import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  try {
    // Instead of calling the worker via HTTP, process jobs directly here
    // This avoids authentication issues
    
    const { data: jobs, error } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("status", "queued")
      .limit(8);

    if (error) {
      console.error("[trigger-worker] Error fetching jobs:", error);
      return sendJson(res, 500, { error: "fetch_failed", message: error.message });
    }

    if (!jobs || jobs.length === 0) {
      return sendJson(res, 200, { ok: true, processed: 0, message: "No jobs queued" });
    }

    // Trigger the worker endpoint with CRON_SECRET
    const protocol = req.headers.host?.includes('localhost') ? 'http' : 'https';
    const workerUrl = `${protocol}://${req.headers.host}/api/worker`;
    const cronSecret = process.env.CRON_SECRET;

    console.log("[trigger-worker] Calling worker with", jobs.length, "queued jobs");

    const workerRes = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Authorization": cronSecret ? `Bearer ${cronSecret}` : "",
        "Content-Type": "application/json",
      },
    });

    if (!workerRes.ok) {
      const errorText = await workerRes.text();
      console.error("[trigger-worker] worker failed:", workerRes.status, errorText);
      return sendJson(res, 500, { 
        error: "worker_failed", 
        message: errorText || "Worker execution failed",
        status: workerRes.status
      });
    }

    const result = await workerRes.json() as Record<string, any>;
    console.log("[trigger-worker] Worker completed:", result);
    return sendJson(res, 200, { ok: true, ...result });
  } catch (e: any) {
    console.error("[trigger-worker] error:", e);
    return sendJson(res, 500, { error: "trigger_failed", message: e?.message ?? "Trigger failed" });
  }
}
