/**
 * Consolidated router for all /api/callsheets/* routes.
 * Handler logic is verbatim from original files.
 */

import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { withApiObservability } from "./_utils/observability.js";
import { requireSupabaseUser, sendJson } from "./_utils/supabase.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { z } from "zod";

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

  const user = await requireSupabaseUser(req, res);
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
      const { data: job, error } = await supabaseAdmin.from("callsheet_jobs").select("id, user_id, status").eq("id", normalizedJobId).maybeSingle();
      if (error) { log.error({ error, jobId: normalizedJobId }, "[trigger-worker] Error fetching job"); return sendJson(res, 500, { error: "fetch_failed", message: error.message }); }
      if (!job || String((job as any).user_id ?? "") !== user.id) return sendJson(res, 404, { ok: false, error: "not_found", message: "Job not found" });
    } else {
      const { count, error } = await supabaseAdmin.from("callsheet_jobs").select("id", { head: true, count: "exact" }).eq("status", "queued").eq("user_id", user.id);
      if (error) { log.error({ error }, "[trigger-worker] Error fetching jobs"); return sendJson(res, 500, { error: "fetch_failed", message: error.message }); }
      if (!count) return sendJson(res, 200, { ok: true, processed: 0, message: "No jobs queued" });
    }

    const protocol = req.headers.host?.includes("localhost") ? "http" : "https";
    const params = new URLSearchParams({ manual: "1", skipGeocode: "1", userId: user.id });
    if (hasJobId) params.set("jobId", normalizedJobId);
    const workerUrl = `${protocol}://${req.headers.host}/api/worker?${params.toString()}`;
    const cronSecret = process.env.CRON_SECRET;

    log.info({ jobId: hasJobId ? normalizedJobId : null }, "[trigger-worker] Firing worker (fire-and-forget)");

    // Fire-and-forget: do NOT await — Vercel Hobby has a 10s function limit
    // and the worker (Gemini PDF processing) can take 15-30s.
    // The frontend polls /api/callsheets/status for the result.
    fetch(workerUrl, {
      method: "POST",
      headers: { Authorization: cronSecret ? `Bearer ${cronSecret}` : "", "Content-Type": "application/json" },
    }).catch((err) => log.error({ err }, "[trigger-worker] worker fetch error (background)"));

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

  if (path === "/api/callsheets/create-upload" || path.endsWith("/create-upload"))   return handleCreateUpload(req, res);
  if (path === "/api/callsheets/queue"          || path.endsWith("/queue"))           return handleQueue(req, res);
  if (path === "/api/callsheets/status"         || path.endsWith("/status"))          return handleStatus(req, res);
  if (path === "/api/callsheets/trigger-worker" || path.endsWith("/trigger-worker")) return handleTriggerWorker(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found", path }));
}
