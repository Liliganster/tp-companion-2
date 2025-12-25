import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";

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
    // Trigger the worker endpoint directly with CRON_SECRET
    const protocol = req.headers.host?.includes('localhost') ? 'http' : 'https';
    const workerUrl = `${protocol}://${req.headers.host}/api/worker`;
    const cronSecret = process.env.CRON_SECRET;

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
      return sendJson(res, workerRes.status, { 
        error: "worker_failed", 
        message: errorText || "Worker execution failed" 
      });
    }

    const result = await workerRes.json() as Record<string, any>;
    return sendJson(res, 200, { ok: true, ...result });
  } catch (e: any) {
    console.error("[trigger-worker] error:", e);
    return sendJson(res, 500, { error: "trigger_failed", message: e?.message ?? "Trigger failed" });
  }
}
