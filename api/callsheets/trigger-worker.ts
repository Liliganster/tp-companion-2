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
    // Trigger the worker endpoint directly
    const workerUrl = `${req.headers.host?.includes('localhost') ? 'http' : 'https'}://${req.headers.host}/api/worker`;
    const cronSecret = process.env.CRON_SECRET;

    const workerRes = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Authorization": cronSecret ? `Bearer ${cronSecret}` : "",
        "Content-Type": "application/json",
      },
    });

    const result = await workerRes.json();

    if (!workerRes.ok) {
      return sendJson(res, workerRes.status, result);
    }

    return sendJson(res, 200, { ok: true, ...result });
  } catch (e: any) {
    console.error("[trigger-worker] error:", e);
    return sendJson(res, 500, { error: "trigger_failed", message: e?.message ?? "Trigger failed" });
  }
}
