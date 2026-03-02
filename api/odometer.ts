/**
 * /api/odometer — Consolidated endpoint for odometer feature (Pro only).
 *
 * Routes:
 *   POST /api/odometer/extract  — AI extraction of km reading from an uploaded odometer image.
 *
 * CRUD (snapshots) is done directly client-side via Supabase with RLS.
 * We keep a single Vercel function to avoid quota waste.
 */

import { requireSupabaseUser } from "./_utils/supabase.js";
import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { captureServerException, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { checkAiMonthlyQuota, recordAiUsage } from "./_utils/aiQuota.js";

// ---------------------------------------------------------------------------
// Odometer-specific AI prompt
// Source is ALWAYS the vehicle dashboard/instrument cluster.
// ---------------------------------------------------------------------------
const ODOMETER_PROMPT = `You are reading the odometer (km counter / Kilometerstand / cuentakilómetros) from a photo of a vehicle's dashboard or instrument cluster.

YOUR ONLY TASK: Find and return the total accumulated mileage shown on the odometer display.

CRITICAL RULES:
1. Extract ONLY the main cumulative odometer reading (total km the vehicle has ever traveled).
2. DO NOT extract or confuse with:
   - Trip meters / partial counters ("Trip A", "Trip B", "Tageskilometer") — these reset and show small values like 12.5 or 340
   - Speed (shown in much larger digits on the speedometer, e.g. 0–240)
   - RPM / engine revs
   - Fuel level numbers
   - Clock / time display
   - Monetary amounts (€, $)
   - Engine displacement or model numbers
3. The odometer is typically a row of 5–7 digits, often in its own small display area labeled "ODO", "km", or similar. Total values are typically between 10,000 and 999,999 km.
4. Thousand separators vary — treat all of these as the same number:
   "98.000" → 98000 km  (Spanish/German dot)
   "98,000" → 98000 km  (English comma)
   "98 000" → 98000 km  (space)
   "98000"  → 98000 km  (none)
5. If the unit shown is MILES, convert to km: km = miles × 1.60934. Return km.
6. Return an integer (round, no decimals).
7. If you cannot read the odometer with at least low confidence, return null.

Return ONLY valid JSON — nothing else:
{"reading_km": <integer or null>, "confidence": <"high"|"medium"|"low">}`;

const ODOMETER_SCHEMA = {
  type: "object",
  properties: {
    reading_km: {
      type: "number",
      description: "Total odometer reading in km (integer). Null if not found."
    },
    confidence: {
      type: "string",
      description: "Extraction confidence: high, medium, or low"
    }
  },
  required: ["reading_km"]
};

// ---------------------------------------------------------------------------
// Handler: POST /api/odometer/extract
// Body: { storagePath: string, snapshotId?: string }
// ---------------------------------------------------------------------------
const handleExtract = withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  // Rate limit: 20 requests / minute per user
  const allowed = await enforceRateLimit({
    req,
    res,
    name: "odometer_extract",
    identifier: user.id,
    limit: 20,
    windowMs: 60_000,
    requestId,
  });
  if (!allowed) return;

  try {
    // Fetch user profile: plan check + AI settings
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("plan_tier, openrouter_enabled, openrouter_api_key, openrouter_model")
      .eq("id", user.id)
      .maybeSingle();

    // Pro gate: odometer AI extraction is Pro-only
    if ((profile as any)?.plan_tier !== "pro") {
      res.status(403).json({ error: "Pro plan required for odometer AI extraction" });
      return;
    }

    const { storagePath, snapshotId } = req.body || {};
    if (!storagePath || typeof storagePath !== "string") {
      res.status(400).json({ error: "Missing storagePath" });
      return;
    }

    // Monthly quota check (shared with other AI extractions)
    const quotaCheck = await checkAiMonthlyQuota(user.id);
    if (!quotaCheck.allowed) {
      res.status(429).json({
        error: "Monthly AI quota exceeded",
        remaining: quotaCheck.remaining,
        limit: quotaCheck.limit,
      });
      return;
    }

    log.info({ storagePath, snapshotId }, "odometer_extract_start");

    // AI settings (OpenRouter or default Gemini)
    let userSettings = undefined;
    if ((profile as any)?.openrouter_enabled && (profile as any)?.openrouter_api_key) {
      userSettings = {
        openrouterEnabled: (profile as any).openrouter_enabled,
        openrouterApiKey: (profile as any).openrouter_api_key,
        openrouterModel: (profile as any).openrouter_model,
      };
    }

    // Download image from odometer-images bucket (private)
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("odometer-images")
      .download(storagePath);

    if (downloadError || !fileData) {
      log.error({ err: downloadError }, "odometer_extract_download_failed");
      res.status(404).json({ error: "File not found in storage" });
      return;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Max 10 MB
    if (buffer.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: "File too large (max 10 MB)" });
      return;
    }

    // Detect MIME type from extension
    const ext = storagePath.split(".").pop()?.toLowerCase() ?? "jpeg";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      heic: "image/heic",
      heif: "image/heif",
    };
    const mimeType = mimeMap[ext] ?? "image/jpeg";

    // Call AI — note: this uses generateContentFromPDF which works for images too
    const aiResult = await generateContentFromPDF(
      "gemini-2.5-flash",
      ODOMETER_PROMPT,
      buffer,
      mimeType,
      ODOMETER_SCHEMA,
      userSettings,
    );

    log.info(
      { aiProvider: aiResult.provider, aiModel: aiResult.model },
      "odometer_extract_ai_done"
    );

    // Parse response
    let parsed: any;
    try {
      parsed = JSON.parse(aiResult.text);
    } catch {
      const match = aiResult.text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
      } else {
        parsed = {};
      }
    }

    // Normalize reading_km
    let readingKm: number | null = null;
    if (parsed.reading_km != null) {
      const raw = String(parsed.reading_km)
        .replace(/[^\d.,]/g, "")   // strip non-numeric except . and ,
        .replace(/\./g, "")        // remove thousand-sep dots (Spanish/German)
        .replace(",", ".");         // normalize decimal comma
      const num = parseFloat(raw);
      if (Number.isFinite(num) && num > 0 && num < 10_000_000) {
        readingKm = Math.round(num);
      }
    }

    const confidence = typeof parsed.confidence === "string" ? parsed.confidence : "low";

    // If a snapshotId is provided, update extraction_status on the row
    if (snapshotId && typeof snapshotId === "string") {
      await supabaseAdmin
        .from("odometer_snapshots")
        .update({
          extraction_status: readingKm !== null ? "ai" : "failed",
          ...(readingKm !== null ? { reading_km: readingKm } : {}),
        })
        .eq("id", snapshotId)
        .eq("user_id", user.id);
    }

    // Record AI usage (reuses 'expense' kind counter — one quota pool)
    await recordAiUsage(user.id, "expense", requestId);

    log.info({ readingKm, confidence }, "odometer_extract_success");
    res.status(200).json({ reading_km: readingKm, confidence });
  } catch (err: any) {
    log.error({ err }, "odometer_extract_error");
    captureServerException(err, { extra: { requestId } });
    res.status(500).json({ error: err.message || "Extraction failed" });
  }
});

// ---------------------------------------------------------------------------
// Handler: POST /api/odometer/begin-capture  (auth required)
// Creates a draft snapshot row and returns a short-lived QR token.
// The desktop shows a QR code; the phone scans it to take the photo.
// ---------------------------------------------------------------------------
async function handleBeginCapture(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("plan_tier")
    .eq("id", user.id)
    .maybeSingle();

  if ((profile as any)?.plan_tier !== "pro") {
    res.status(403).json({ error: "Pro plan required" });
    return;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
  const today = new Date().toISOString().slice(0, 10);

  const { data: snap, error } = await supabaseAdmin
    .from("odometer_snapshots")
    .insert({
      user_id: user.id,
      snapshot_date: today,
      reading_km: 0,          // placeholder — will be updated by AI
      source: "manual",
      extraction_status: "manual",
      capture_token: token,
      capture_expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !snap) {
    res.status(500).json({ error: "Failed to create draft snapshot" });
    return;
  }

  res.status(200).json({ token, snapshotId: snap.id, expiresAt });
}

// ---------------------------------------------------------------------------
// Handler: GET /api/odometer/capture-info?token=xxx  (NO auth — public)
// Validates the QR token and returns a signed Supabase Storage upload URL.
// Called by the phone's browser on the /odometer-capture page.
// ---------------------------------------------------------------------------
async function handleCaptureInfo(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const token = new URL(req.url, "http://x").searchParams.get("token");
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  const { data: snap } = await supabaseAdmin
    .from("odometer_snapshots")
    .select("id, user_id, capture_expires_at, image_storage_path")
    .eq("capture_token", token)
    .maybeSingle();

  if (!snap) {
    res.status(404).json({ error: "Invalid or expired QR code" });
    return;
  }

  // If already used (image already uploaded), return done status
  if (snap.image_storage_path) {
    res.status(200).json({ alreadyUsed: true });
    return;
  }

  // Check expiry
  if (snap.capture_expires_at && new Date(snap.capture_expires_at) < new Date()) {
    res.status(410).json({ error: "QR code has expired" });
    return;
  }

  // Create signed upload URL for the phone to upload directly to Supabase Storage
  const uploadPath = `${snap.user_id}/${snap.id}_mobile.jpg`;
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("odometer-images")
    .createSignedUploadUrl(uploadPath);

  if (signErr || !signed?.signedUrl) {
    res.status(500).json({ error: "Failed to create upload URL" });
    return;
  }

  res.status(200).json({
    signedUploadUrl: signed.signedUrl,
    uploadPath,
    snapshotId: snap.id,
  });
}

// ---------------------------------------------------------------------------
// Handler: POST /api/odometer/finish-capture  (token-based auth, no session)
// Called by the phone after uploading the photo.
// Updates the snapshot path, then runs AI extraction synchronously.
// ---------------------------------------------------------------------------
async function handleFinishCapture(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { token, uploadPath, mimeType } = req.body || {};
  if (!token || !uploadPath) {
    res.status(400).json({ error: "Missing token or uploadPath" });
    return;
  }

  const { data: snap } = await supabaseAdmin
    .from("odometer_snapshots")
    .select("id, user_id, capture_expires_at")
    .eq("capture_token", token)
    .maybeSingle();

  if (!snap) {
    res.status(404).json({ error: "Invalid or already used token" });
    return;
  }
  if (snap.capture_expires_at && new Date(snap.capture_expires_at) < new Date()) {
    res.status(410).json({ error: "Token expired" });
    return;
  }

  // Update snapshot: set image path, clear token so the link cannot be reused
  await supabaseAdmin
    .from("odometer_snapshots")
    .update({
      image_storage_path: uploadPath,
      capture_token: null,
      capture_expires_at: null,
      extraction_status: "manual",
    })
    .eq("id", snap.id);

  // Run AI extraction inline (no extra Vercel function needed)
  try {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("plan_tier, openrouter_enabled, openrouter_api_key, openrouter_model")
      .eq("id", snap.user_id)
      .maybeSingle();

    if ((profile as any)?.plan_tier === "pro") {
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage
        .from("odometer-images")
        .download(uploadPath);

      if (!dlErr && fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const ext = uploadPath.split(".").pop()?.toLowerCase() ?? "jpeg";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg",
          png: "image/png", webp: "image/webp",
          heic: "image/heic", heif: "image/heif",
        };
        const detectedMime = mimeMap[ext] ?? (mimeType || "image/jpeg");

        let userSettings = undefined;
        if ((profile as any)?.openrouter_enabled && (profile as any)?.openrouter_api_key) {
          userSettings = {
            openrouterEnabled: (profile as any).openrouter_enabled,
            openrouterApiKey: (profile as any).openrouter_api_key,
            openrouterModel: (profile as any).openrouter_model,
          };
        }

        const aiResult = await generateContentFromPDF(
          "gemini-2.5-flash",
          ODOMETER_PROMPT,
          buffer,
          detectedMime,
          ODOMETER_SCHEMA,
          userSettings,
        );

        let parsed: any = {};
        try { parsed = JSON.parse(aiResult.text); } catch {
          const match = aiResult.text.match(/\{[\s\S]*\}/);
          if (match) { try { parsed = JSON.parse(match[0]); } catch { /* skip */ } }
        }

        let readingKm: number | null = null;
        if (parsed.reading_km != null) {
          const raw = String(parsed.reading_km)
            .replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
          const num = parseFloat(raw);
          if (Number.isFinite(num) && num > 0 && num < 10_000_000) readingKm = Math.round(num);
        }

        await supabaseAdmin
          .from("odometer_snapshots")
          .update({
            extraction_status: readingKm !== null ? "ai" : "failed",
            ...(readingKm !== null ? { reading_km: readingKm } : {}),
          })
          .eq("id", snap.id);

        res.status(200).json({ ok: true, reading_km: readingKm });
        return;
      }
    }
  } catch {
    // AI failed — snapshot already has image_storage_path, reading_km stays 0
    // Desktop will show it as failed extraction, user can enter km manually
  }

  res.status(200).json({ ok: true, reading_km: null });
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");

  if (path === "/api/odometer/extract") return handleExtract(req, res);
  if (path === "/api/odometer/begin-capture") return handleBeginCapture(req, res);
  if (path === "/api/odometer/capture-info") return handleCaptureInfo(req, res);
  if (path === "/api/odometer/finish-capture") return handleFinishCapture(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found" }));
}
