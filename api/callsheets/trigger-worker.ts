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
    // Instead of calling the worker via HTTP, process jobs directly here
    // This avoids authentication issues
    
    const { data: jobs, error } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("status", "queued")
      .limit(8);

    if (error) {
      log.error({ error }, "[trigger-worker] Error fetching jobs");
      return sendJson(res, 500, { error: "fetch_failed", message: error.message });
    }

    if (!jobs || jobs.length === 0) {
      return sendJson(res, 200, { ok: true, processed: 0, message: "No jobs queued" });
    }

    // Trigger the worker endpoint with CRON_SECRET
    const protocol = req.headers.host?.includes('localhost') ? 'http' : 'https';
    const workerUrl = `${protocol}://${req.headers.host}/api/worker`;
    const cronSecret = process.env.CRON_SECRET;

    log.info({ queuedJobs: jobs.length }, "[trigger-worker] Calling worker");

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
