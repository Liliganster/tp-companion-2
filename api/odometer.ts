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
// This prompt is COMPLETELY DIFFERENT from invoice/expense extraction.
// It must read a km counter reading, NOT a monetary amount.
// Sources: dashboard photo, ITV/TÜV certificate, workshop receipt, insurance doc.
// ---------------------------------------------------------------------------
const ODOMETER_PROMPT = `You are a specialist in reading vehicle odometer (km counter / Kilometerstand / cuentakilómetros) readings from images and official documents.

YOUR ONLY TASK: Find and return the vehicle's total accumulated mileage in kilometers.

Possible image types:
- Dashboard/instrument cluster photo showing the odometer digits or display
- ITV certificate (Inspección Técnica de Vehículos, Spain) — look for "Km recorridos", "Kilometraje"
- TÜV certificate (Germany/Austria) — look for "Kilometerstand", "km-Stand"
- Workshop/mechanic invoice (taller, Werkstatt) — look for "Km entrada", "Km:", odometer field
- Insurance document — look for km declared at policy renewal or claim
- Printed mileage report or service booklet page

CRITICAL EXTRACTION RULES:
1. Extract ONLY the cumulative total odometer reading (how many km the vehicle has traveled in its lifetime).
2. DO NOT extract or confuse with:
   - Monetary amounts (anything with €, $, £ or similar currency symbols) — these are prices, NOT km
   - Engine displacement (e.g., "1598 cc", "2.0 L")
   - Vehicle model numbers (e.g., "316i", "Golf 2.0")
   - VIN / chassis / serial numbers (usually 17 alphanumeric chars)
   - Phone numbers or postal codes
   - Reference/invoice numbers
   - Partial trip distance meters ("Trip A", "Tageskilometer")
3. Thousand separators vary by country — treat ALL of these as the same number:
   "98.000"  → 98000 km  (Spanish/German dot-as-thousands)
   "98,000"  → 98000 km  (English comma-as-thousands)
   "98 000"  → 98000 km  (space separator)
   "98000"   → 98000 km  (no separator)
4. If the unit is MILES (mi), convert to km: km = miles × 1.60934. Return the result in km.
5. Return an integer (no decimals). Odometer readings for cars are typically 5–6 digits (10000–999999).
6. If you find multiple km-like numbers, pick the one that appears in the "Total km" or "Odometer" field context. If unclear, pick the largest plausible value.
7. If you absolutely cannot find the odometer reading with at least low confidence, return null.

Return ONLY valid JSON matching this schema — nothing else:
{
  "reading_km": <integer km or null>,
  "confidence": <"high" | "medium" | "low">,
  "source_type": <"dashboard" | "itv" | "workshop" | "insurance" | "other" | null>
}`;

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
    },
    source_type: {
      type: "string",
      description: "Document type: dashboard, itv, workshop, insurance, other, or null"
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
    const sourceType = typeof parsed.source_type === "string" ? parsed.source_type : null;

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

    log.info({ readingKm, confidence, sourceType }, "odometer_extract_success");
    res.status(200).json({ reading_km: readingKm, confidence, source_type: sourceType });
  } catch (err: any) {
    log.error({ err }, "odometer_extract_error");
    captureServerException(err, { extra: { requestId } });
    res.status(500).json({ error: err.message || "Extraction failed" });
  }
});

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------
export default async function handler(req: any, res: any) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");

  if (path === "/api/odometer/extract") return handleExtract(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found" }));
}
