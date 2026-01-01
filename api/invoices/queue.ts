import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { withApiObservability } from "../_utils/observability.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";
import { z } from "zod";

export default withApiObservability(async function handler(req: any, res: any, { log }) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  // Rate limit: prevent spamming queue endpoints (Gemini cost amplifier)
  const allowed = await enforceRateLimit({
    req,
    res,
    name: "invoice_queue",
    identifier: user.id,
    limit: 10,
    windowMs: 10_000,
  });
  if (!allowed) return;

  const bodySchema = z.object({ jobId: z.string().uuid() });
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_body", details: parsed.error.issues });
  const { jobId } = parsed.data;

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

    if (job.status !== "created" && job.status !== "failed" && job.status !== "cancelled") {
      return sendJson(res, 400, { error: "job_already_queued_or_done", status: job.status });
    }

    // Update to queued
    const { error: updateError } = await supabaseAdmin
      .from("invoice_jobs")
      .update({ status: "queued" })
      .eq("id", jobId);

    if (updateError) {
      log.error({ updateError }, "[invoice/queue] Update error");
      return sendJson(res, 500, { error: "update_failed", message: updateError.message });
    }

    return sendJson(res, 200, { ok: true, jobId });
  } catch (e: any) {
    log.error({ err: e }, "[invoice/queue] error");
    return sendJson(res, 500, { error: "queue_failed", message: e?.message ?? "Failed to queue invoice job" });
  }
}, { name: "invoices/queue" });
