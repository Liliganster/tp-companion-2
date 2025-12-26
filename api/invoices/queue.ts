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

  const { jobId } = req.body;
  if (!jobId) {
    return sendJson(res, 400, { error: "missing_job_id" });
  }

  try {
    // Verify job belongs to user and is in "created" state
    const { data: job, error: fetchError } = await supabaseAdmin
      .from("invoice_jobs")
      .select("id, status, user_id")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !job) {
      return sendJson(res, 404, { error: "job_not_found" });
    }

    if (job.status !== "created" && job.status !== "failed") {
      return sendJson(res, 400, { error: "job_already_queued_or_done", status: job.status });
    }

    // Update to queued
    const { error: updateError } = await supabaseAdmin
      .from("invoice_jobs")
      .update({ status: "queued" })
      .eq("id", jobId);

    if (updateError) {
      console.error("[invoice/queue] Update error:", updateError);
      return sendJson(res, 500, { error: "update_failed", message: updateError.message });
    }

    return sendJson(res, 200, { ok: true, jobId });
  } catch (e: any) {
    console.error("[invoice/queue] error:", e);
    return sendJson(res, 500, { error: "queue_failed", message: e?.message ?? "Failed to queue invoice job" });
  }
}
