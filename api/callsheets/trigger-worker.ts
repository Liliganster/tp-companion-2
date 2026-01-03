import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { withApiObservability } from "../_utils/observability.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

export default withApiObservability(async function handler(req: any, res: any, { log }) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  // Rate limit: triggering workers can multiply Gemini costs if abused.
  const allowed = await enforceRateLimit({
    req,
    res,
    name: "callsheets_trigger_worker",
    identifier: user.id,
    limit: 3,
    windowMs: 60_000,
  });
  if (!allowed) return;

  try {
    const jobId =
      (typeof req.query?.jobId === "string" ? req.query.jobId : null) ??
      (typeof req.body?.jobId === "string" ? req.body.jobId : null);

    const normalizedJobId = String(jobId ?? "").trim();
    const hasJobId = Boolean(normalizedJobId);

    if (hasJobId) {
      const { data: job, error } = await supabaseAdmin
        .from("callsheet_jobs")
        .select("id, user_id, status")
        .eq("id", normalizedJobId)
        .maybeSingle();

      if (error) {
        log.error({ error, jobId: normalizedJobId }, "[trigger-worker] Error fetching job");
        return sendJson(res, 500, { error: "fetch_failed", message: error.message });
      }

      if (!job || String((job as any).user_id ?? "") !== user.id) {
        return sendJson(res, 404, { ok: false, error: "not_found", message: "Job not found" });
      }
    } else {
      const { count, error } = await supabaseAdmin
        .from("callsheet_jobs")
        .select("id", { head: true, count: "exact" })
        .eq("status", "queued")
        .eq("user_id", user.id);

      if (error) {
        log.error({ error }, "[trigger-worker] Error fetching jobs");
        return sendJson(res, 500, { error: "fetch_failed", message: error.message });
      }

      if (!count) {
        return sendJson(res, 200, { ok: true, processed: 0, message: "No jobs queued" });
      }
    }

    // Trigger the worker endpoint with CRON_SECRET
    const protocol = req.headers.host?.includes('localhost') ? 'http' : 'https';
    // Manual trigger: keep the request short to avoid function timeouts in UI.
    // Cron will still process the rest in background.
    const params = new URLSearchParams({ manual: "1", skipGeocode: "1", userId: user.id });
    if (hasJobId) params.set("jobId", normalizedJobId);
    const workerUrl = `${protocol}://${req.headers.host}/api/worker?${params.toString()}`;
    const cronSecret = process.env.CRON_SECRET;

    log.info({ jobId: hasJobId ? normalizedJobId : null }, "[trigger-worker] Calling worker");

    const workerRes = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Authorization": cronSecret ? `Bearer ${cronSecret}` : "",
        "Content-Type": "application/json",
      },
    });

    if (!workerRes.ok) {
      const errorText = await workerRes.text();
      log.error({ status: workerRes.status, errorText }, "[trigger-worker] worker failed");
      return sendJson(res, 500, { 
        error: "worker_failed", 
        message: errorText || "Worker execution failed",
        status: workerRes.status
      });
    }

    const result = await workerRes.json() as Record<string, any>;
    log.info({ result }, "[trigger-worker] Worker completed");
    return sendJson(res, 200, { ok: true, ...result });
  } catch (e: any) {
    log.error({ err: e }, "[trigger-worker] error");
    return sendJson(res, 500, { error: "trigger_failed", message: e?.message ?? "Trigger failed" });
  }
}, { name: "callsheets/trigger-worker" });
