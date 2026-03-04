/**
 * Consolidated router for all /api/callsheets/* routes.
 * Handler logic is verbatim from original files.
 */

import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { withApiObservability } from "./_utils/observability.js";
import { getBearerToken, requireSupabaseUser, sendJson } from "./_utils/supabase.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { checkAiMonthlyQuota } from "./_utils/aiQuota.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildUniversalExtractorPrompt } from "../src/lib/ai/prompts.js";
import { extractionSchema } from "../src/lib/ai/schema.js";
import { CallsheetExtractionResultSchema } from "../src/lib/ai/validation.js";
import { parsePdfWithTimeout } from "./_utils/pdf-parser.js";
import {
  buildCallsheetPdfHintText,
  extractLabeledLocationCandidates,
  normalizeExtractedCallsheetLocations,
  filterHallucinatedLocations,
  filterLogisticsLocations,
  postProcessLocationsForGeocoding,
} from "./_utils/callsheetLocationHints.js";
import { z } from "zod";

// ─── Geocoding (same logic as worker.ts) ─────────────────────────────────────
async function geocodeAddress(address: string) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data: any = await response.json();
    if (data.status === "OK" && data.results?.length > 0) {
      const result = data.results[0];
      return {
        formatted_address: result.formatted_address as string,
        lat: result.geometry.location.lat as number,
        lng: result.geometry.location.lng as number,
        place_id: result.place_id as string,
        quality: result.geometry.location_type as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const NON_DONE_CALLSHEET_STATUSES = ["created", "queued", "processing", "failed", "cancelled", "out_of_quota"] as const;
const CALLSHEET_PROCESS_STALE_MS = 90_000;

async function deleteUnprocessedCallsheetJob(args: { userId: string; jobId: string }) {
  const { userId, jobId } = args;

  const { data: existingJob } = await supabaseAdmin
    .from("callsheet_jobs")
    .select("id, storage_path")
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", [...NON_DONE_CALLSHEET_STATUSES])
    .maybeSingle();

  const storagePath = String((existingJob as any)?.storage_path ?? "").trim();
  if (storagePath && storagePath !== "pending") {
    try {
      await supabaseAdmin.storage.from("callsheets").remove([storagePath]);
    } catch {
      // ignore cleanup failure
    }
  }

  await supabaseAdmin
    .from("callsheet_jobs")
    .delete()
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", [...NON_DONE_CALLSHEET_STATUSES]);
}

function isCallsheetProcessingStale(timestamp: unknown, staleMs = CALLSHEET_PROCESS_STALE_MS) {
  if (typeof timestamp !== "string" || !timestamp.trim()) return true;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return true;
  return Date.now() - parsed >= staleMs;
}

// ─── /api/callsheets/process ────────────────────────────────────────────────
// Direct synchronous extraction: claim job → download PDF → call Gemini → save results → done.
// No worker, no fire-and-forget, no polling needed. maxDuration=60s covers Gemini (15-30s).
const handleProcess = withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return; }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "callsheet_process", identifier: user.id, limit: 10, windowMs: 60_000, requestId });
  if (!allowed) return;

  const jobId = typeof req.query?.jobId === "string" ? req.query.jobId.trim() : null;
  if (!jobId) return sendJson(res, 400, { error: "missing_jobId" });

  try {
    // 1. Fetch user profile to get AI plan tier
    const { data: profile } = await supabaseAdmin.from("user_profiles").select("plan_tier, openrouter_enabled, openrouter_api_key, openrouter_model").eq("id", user.id).maybeSingle();

    // 2. Check monthly quota
    const quota = await checkAiMonthlyQuota(user.id, profile?.plan_tier);
    if (!quota.allowed) {
      await deleteUnprocessedCallsheetJob({ userId: user.id, jobId });

      return sendJson(res, 402, { error: "quota_exceeded", reason: quota.reason });
    }

    // 3. Atomically claim the job (created/queued/failed/cancelled -> processing)
    const now = new Date().toISOString();
    const { data: claimedJob, error: claimError } = await supabaseAdmin
      .from("callsheet_jobs")
      .update({ status: "processing", processing_started_at: now, processed_at: now })
      .eq("id", jobId)
      .eq("user_id", user.id)
      .in("status", ["created", "queued", "failed", "cancelled", "out_of_quota"])
      .select("id, storage_path, user_id")
      .maybeSingle();
    let job = claimedJob;

    if (claimError) return sendJson(res, 500, { error: "claim_failed", message: claimError.message });
    if (!job) {
      const { data: existing } = await supabaseAdmin
        .from("callsheet_jobs")
        .select("status, processing_started_at, processed_at, user_id, storage_path")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle();
      const s = String((existing as any)?.status ?? "");
      const processingStartedAt = String((existing as any)?.processing_started_at ?? (existing as any)?.processed_at ?? "");
      if (s === "processing" && isCallsheetProcessingStale(processingStartedAt)) {
        const { data: reclaimed, error: reclaimError } = await supabaseAdmin
          .from("callsheet_jobs")
          .update({ status: "processing", processing_started_at: now, processed_at: now })
          .eq("id", jobId)
          .eq("user_id", user.id)
          .eq("status", "processing")
          .select("id, storage_path, user_id")
          .maybeSingle();
        if (reclaimError) return sendJson(res, 500, { error: "reclaim_failed", message: reclaimError.message });
        if (reclaimed) job = reclaimed as any;
      }
    }
    if (!job) {
      const { data: existing } = await supabaseAdmin.from("callsheet_jobs").select("status").eq("id", jobId).maybeSingle();
      const s = String((existing as any)?.status ?? "");
      // If already processing or done, return ok so the client can poll/refresh
      if (s === "done") return sendJson(res, 200, { ok: true, alreadyDone: true });
      return sendJson(res, 409, { error: "not_claimable", status: s });
    }

    // 3. Download PDF from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage.from("callsheets").download(job.storage_path);
    if (downloadError || !fileData) {
      await deleteUnprocessedCallsheetJob({ userId: user.id, jobId });
      return sendJson(res, 500, { error: "download_failed", message: downloadError?.message });
    }

    // 4. Load user AI settings (OpenRouter override if configured)
    const userSettings = profile?.openrouter_enabled && profile?.openrouter_api_key
      ? { openrouterEnabled: true, openrouterApiKey: profile.openrouter_api_key, openrouterModel: profile.openrouter_model }
      : undefined;

    // 5. Call Gemini (or OpenRouter)
    const buffer = Buffer.from(await fileData.arrayBuffer());
    let pdfText = "";
    let pdfHintText = "";
    let labeledPdfLocations: string[] = [];
    try {
      const parsedPdf = await parsePdfWithTimeout(buffer, 4_000);
      pdfText = String(parsedPdf?.text ?? "");
      labeledPdfLocations = extractLabeledLocationCandidates(pdfText);
      pdfHintText = buildCallsheetPdfHintText(pdfText);
    } catch {
      pdfText = "";
      pdfHintText = "";
      labeledPdfLocations = [];
    }
    const promptSource = pdfHintText
      ? `[PDF CONTENT ATTACHED]\n\nBEST-EFFORT PDF TEXT SNIPPETS:\n${pdfHintText}`
      : "[PDF CONTENT ATTACHED]";
    const prompt = buildUniversalExtractorPrompt(promptSource);
    const aiResult = await generateContentFromPDF("gemini-2.5-flash", prompt, buffer, "application/pdf", extractionSchema, userSettings);
    log.info({ jobId, provider: aiResult.provider, model: aiResult.model }, "callsheet_process_ai_done");

    // 6. Parse and validate
    let extractedJson: any = null;
    try { extractedJson = JSON.parse(aiResult.text); }
    catch { extractedJson = JSON.parse(aiResult.text.replace(/```json|```/g, "").trim()); }

    const validated = CallsheetExtractionResultSchema.safeParse(extractedJson);
    if (!validated.success) {
      const reason = `invalid_extraction: ${validated.error.issues.map((i: any) => i.message).join("; ")}`;
      await deleteUnprocessedCallsheetJob({ userId: user.id, jobId });
      return sendJson(res, 422, { error: "extraction_invalid", reason });
    }
    const normalizedAiLocations = normalizeExtractedCallsheetLocations({
      locations: validated.data.locations,
      pdfText,
    });
    // Evidence: keep the raw AI output for DB records
    const evidenceLocations = validated.data.locations;
    const extracted = {
      ...validated.data,
      locations:
        normalizedAiLocations.length > 0
          ? normalizedAiLocations
          : validated.data.locations,
    };

    // 6b. Strip logistics locations (Base, Parking, Catering, etc.)
    const nonLogistics = filterLogisticsLocations(extracted.locations);
    extracted.locations = nonLogistics.length > 0 ? nonLogistics : extracted.locations;

    // 6c. Filter out hallucinated locations (addresses the AI invented)
    const verifiedLocations = filterHallucinatedLocations({
      locations: extracted.locations,
      pdfText,
    });
    extracted.locations = verifiedLocations.length > 0 ? verifiedLocations : extracted.locations;
    log.info({ jobId, aiLocs: validated.data.locations.length, verified: verifiedLocations.length }, "callsheet_process_hallucination_filter");

    // 6c. Code-side normalization for geocoding (Bezirk expansion, abbreviations)
    const geocodingLocations = postProcessLocationsForGeocoding(extracted.locations);

    // 7. Save results
    const { error: resultError } = await supabaseAdmin.from("callsheet_results").insert({
      job_id: jobId,
      date_value: extracted.date,
      project_value: extracted.projectName,
      producer_value: (extracted.productionCompanies as any)?.[0],
    });
    if (resultError) throw new Error(`Failed to save results: ${resultError.message}`);

    if (extracted.locations.length > 0) {
      // Geocode all locations in parallel (same as worker)
      const geoResults = await Promise.all(
        geocodingLocations.map((addr: string) => geocodeAddress(addr))
      );
      log.info({ jobId, geocoded: geoResults.filter(Boolean).length, total: extracted.locations.length }, "callsheet_process_geocoding_done");

      const { error: locsError } = await supabaseAdmin.from("callsheet_locations").insert(
        extracted.locations.map((addr: string, index: number) => {
          const geo = geoResults[index];
          return {
            job_id: jobId,
            name_raw: /\d/.test(addr) ? null : addr,
            address_raw: addr,
            label_source: "EXTRACTED",
            evidence_text: evidenceLocations[index] ?? addr,
            formatted_address: geo?.formatted_address ?? null,
            lat: geo?.lat ?? null,
            lng: geo?.lng ?? null,
            place_id: geo?.place_id ?? null,
            geocode_quality: geo?.quality ?? null,
          };
        })
      );
      if (locsError) log.warn({ jobId, locsError }, "callsheet_process_locs_insert_failed");
    }

    // 8. Mark done
    await supabaseAdmin.from("callsheet_jobs").update({ status: "done" }).eq("id", jobId).eq("status", "processing");
    log.info({ jobId }, "callsheet_process_done");

    return sendJson(res, 200, { ok: true, jobId, date: extracted.date, projectName: extracted.projectName, locations: extracted.locations });
  } catch (err: any) {
    log.error({ err, jobId }, "callsheet_process_error");
    try {
      await deleteUnprocessedCallsheetJob({ userId: user.id, jobId });
    } catch (updateErr) {
      // ignore
    }
    return sendJson(res, 500, { error: "process_failed", message: err?.message ?? "Extraction failed" });
  }
}, { name: "callsheets/process" });

// ─── /api/callsheets/create-upload ──────────────────────────────────────────
const CreateUploadBodySchema = z.object({
  filename: z.string().max(180).optional(),
  contentType: z.string().max(120).optional(),
  size: z.number().int().min(0).max(25_000_000).optional(),
});

const handleCreateUpload = withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return; }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "callsheet_create_upload", identifier: user.id, limit: 20, windowMs: 60_000, requestId });
  if (!allowed) return;

  const parsed = CreateUploadBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_body", details: parsed.error.issues });

  try {
    const { filename } = parsed.data;
    const { data: job, error: jobError } = await supabaseAdmin.from("callsheet_jobs").insert({ user_id: user.id, storage_path: "pending", status: "created" }).select("id").single();
    if (jobError || !job?.id) { log.error({ jobError }, "[callsheets/create-upload] job insert failed"); return sendJson(res, 500, { error: "job_insert_failed", message: jobError?.message }); }

    const filePath = `${user.id}/${job.id}/${filename || "document.pdf"}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage.from("callsheets").createSignedUploadUrl(filePath);
    if (uploadError || !uploadData?.signedUrl) { log.error({ uploadError }, "[callsheets/create-upload] createSignedUploadUrl failed"); return sendJson(res, 500, { error: "signed_upload_failed", message: uploadError?.message }); }

    try { await supabaseAdmin.from("callsheet_jobs").update({ storage_path: filePath }).eq("id", job.id); } catch { /* best-effort */ }
    return sendJson(res, 200, { jobId: job.id, uploadUrl: uploadData.signedUrl, path: uploadData.path });
  } catch (err: any) {
    log.error({ err }, "[callsheets/create-upload] error");
    return sendJson(res, 500, { error: "create_upload_failed", message: err?.message ?? "Create upload failed" });
  }
}, { name: "callsheets/create-upload" });

// ─── /api/callsheets/queue ───────────────────────────────────────────────────
const QueueBodySchema = z.object({ jobId: z.string().uuid() });

const handleQueue = withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return; }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "callsheet_queue", identifier: user.id, limit: 10, windowMs: 10_000, requestId });
  if (!allowed) return;

  const parsed = QueueBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_body", details: parsed.error.issues });
  const { jobId } = parsed.data;

  try {
    const { data: job, error: fetchError } = await supabaseAdmin.from("callsheet_jobs").select("id, status, user_id").eq("id", jobId).eq("user_id", user.id).maybeSingle();
    if (fetchError || !job) return sendJson(res, 404, { error: "job_not_found" });
    if (job.status !== "created" && job.status !== "failed" && job.status !== "cancelled") return sendJson(res, 400, { error: "job_already_queued_or_done", status: job.status });

    const { error: updateError } = await supabaseAdmin.from("callsheet_jobs").update({ status: "queued" }).eq("id", jobId);
    if (updateError) { log.error({ updateError }, "[callsheets/queue] Update error"); return sendJson(res, 500, { error: "update_failed", message: updateError.message }); }
    return sendJson(res, 200, { ok: true, jobId });
  } catch (err: any) {
    log.error({ err }, "[callsheets/queue] error");
    return sendJson(res, 500, { error: "queue_failed", message: err?.message ?? "Queue failed" });
  }
}, { name: "callsheets/queue" });

// ─── /api/callsheets/status ──────────────────────────────────────────────────
const StatusQuerySchema = z.object({ jobId: z.string().uuid() });

const handleStatus = withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return; }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "callsheet_status", identifier: user.id, limit: 120, windowMs: 60_000, requestId });
  if (!allowed) return;

  const parsed = StatusQuerySchema.safeParse({ jobId: typeof req.query?.jobId === "string" ? req.query.jobId : undefined });
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_query", details: parsed.error.issues });
  const { jobId } = parsed.data;

  try {
    const { data: job, error: jobError } = await supabaseAdmin.from("callsheet_jobs").select("*").eq("id", jobId).eq("user_id", user.id).maybeSingle();
    if (jobError || !job) return sendJson(res, 404, { error: "job_not_found" });

    let results = null;
    let locations: any[] = [];
    if (job.status === "done" || job.status === "needs_review") {
      const { data: resData } = await supabaseAdmin.from("callsheet_results").select("*").eq("job_id", jobId).maybeSingle();
      results = resData ?? null;
      const { data: locData } = await supabaseAdmin.from("callsheet_locations").select("*").eq("job_id", jobId);
      locations = (locData ?? []) as any[];
    }
    return sendJson(res, 200, { job, results, locations });
  } catch (err: any) {
    log.error({ err }, "[callsheets/status] error");
    return sendJson(res, 500, { error: "status_failed", message: err?.message ?? "Status failed", requestId });
  }
}, { name: "callsheets/status" });

// ─── /api/callsheets/trigger-worker ─────────────────────────────────────────
const handleTriggerWorker = withApiObservability(async function handler(req: any, res: any, { log }) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return; }

  const cronSecret = process.env.CRON_SECRET;
  const internalUserId =
    (typeof req.query?.userId === "string" ? req.query.userId : null) ??
    (typeof req.body?.userId === "string" ? req.body.userId : null);
  const normalizedInternalUserId = String(internalUserId ?? "").trim();
  const isInternalTrigger =
    Boolean(normalizedInternalUserId) &&
    Boolean(cronSecret) &&
    getBearerToken(req) === cronSecret;

  const user = isInternalTrigger
    ? { id: normalizedInternalUserId }
    : await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "callsheets_trigger_worker", identifier: user.id, limit: 3, windowMs: 60_000 });
  if (!allowed) return;

  try {
    const jobId =
      (typeof req.query?.jobId === "string" ? req.query.jobId : null) ??
      (typeof req.body?.jobId === "string" ? req.body.jobId : null);
    const normalizedJobId = String(jobId ?? "").trim();
    const hasJobId = Boolean(normalizedJobId);

    if (hasJobId) {
      // Atomically claim the job here (trigger-worker → "processing") so the DB never
      // shows "queued" to the user for a manual single-job trigger.
      // The worker receives preClaimed=1 and skips its own claim step.
      const now = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("callsheet_jobs")
        .update({ status: "processing", processing_started_at: now, processed_at: now })
        .eq("id", normalizedJobId)
        .eq("user_id", user.id)
        .in("status", ["queued", "created", "failed", "cancelled"])
        .select("id")
        .maybeSingle();

      if (claimError) {
        log.error({ claimError, jobId: normalizedJobId }, "[trigger-worker] claim failed");
        return sendJson(res, 500, { error: "claim_failed", message: claimError.message });
      }
      if (!claimed) {
        // Already processing/done — still fire worker so it can finish if it was interrupted.
        const { data: existing } = await supabaseAdmin
          .from("callsheet_jobs")
          .select("status")
          .eq("id", normalizedJobId)
          .maybeSingle();
        const existingStatus = String((existing as any)?.status ?? "");
        if (existingStatus === "done") return sendJson(res, 200, { ok: true, triggered: false, message: "already_done" });
        if (existingStatus !== "processing")
          return sendJson(res, 400, { ok: false, error: "not_claimable", status: existingStatus });
      }
    } else {
      const { count, error } = await supabaseAdmin.from("callsheet_jobs").select("id", { head: true, count: "exact" }).eq("status", "queued").eq("user_id", user.id);
      if (error) { log.error({ error }, "[trigger-worker] Error fetching jobs"); return sendJson(res, 500, { error: "fetch_failed", message: error.message }); }
      if (!count) return sendJson(res, 200, { ok: true, processed: 0, message: "No jobs queued" });
    }

    const protocol = req.headers.host?.includes("localhost") ? "http" : "https";
    const params = new URLSearchParams({ manual: "1", skipGeocode: "1", userId: user.id });
    if (hasJobId) {
      params.set("jobId", normalizedJobId);
      params.set("preClaimed", "1"); // job is already in "processing"; worker skips its claim step
    }
    const workerUrl = `${protocol}://${req.headers.host}/api/worker?${params.toString()}`;

    log.info(
      {
        jobId: hasJobId ? normalizedJobId : null,
        internalTrigger: isInternalTrigger,
        userId: user.id,
      },
      "[trigger-worker] Firing worker (fire-and-forget)",
    );

    // Fire-and-forget: do NOT await — Vercel Hobby has a 10s function limit
    // and the worker (Gemini PDF processing) can take 15-30s.
    // The frontend polls /api/callsheets/status for the result.
    void fetch(workerUrl, {
      method: "POST",
      headers: { Authorization: cronSecret ? `Bearer ${cronSecret}` : "", "Content-Type": "application/json" },
    })
      .then(async (response) => {
        if (response.ok) return;
        const bodyPreview = (await response.text().catch(() => "")).slice(0, 300);
        log.error(
          {
            status: response.status,
            bodyPreview,
            jobId: hasJobId ? normalizedJobId : null,
            internalTrigger: isInternalTrigger,
            userId: user.id,
          },
          "[trigger-worker] worker fetch non-ok (background)",
        );
      })
      .catch((err) =>
        log.error(
          { err, internalTrigger: isInternalTrigger, userId: user.id },
          "[trigger-worker] worker fetch error (background)",
        ),
      );

    return sendJson(res, 200, { ok: true, triggered: true, jobId: hasJobId ? normalizedJobId : null });
  } catch (e: any) {
    log.error({ err: e }, "[trigger-worker] error");
    return sendJson(res, 500, { error: "trigger_failed", message: e?.message ?? "Trigger failed" });
  }
}, { name: "callsheets/trigger-worker" });

// ─── Main router ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  // req.url may be the original path or the rewritten path depending on Vercel's behavior.
  // We check both the URL path and the Vercel-injected sub-path query param as a fallback.
  const rawPath = (req.url || "").split("?")[0].replace(/\/$/, "");
  const path = rawPath.includes("/api/callsheets") ? rawPath : `/api/callsheets/${rawPath.replace(/^\//, "")}`;

  if (path === "/api/callsheets/process"        || path.endsWith("/process"))        return handleProcess(req, res);
  if (path === "/api/callsheets/create-upload" || path.endsWith("/create-upload"))   return handleCreateUpload(req, res);
  if (path === "/api/callsheets/queue"          || path.endsWith("/queue"))           return handleQueue(req, res);
  if (path === "/api/callsheets/status"         || path.endsWith("/status"))          return handleStatus(req, res);
  if (path === "/api/callsheets/trigger-worker" || path.endsWith("/trigger-worker")) return handleTriggerWorker(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found", path }));
}
