import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { withApiObservability } from "../_utils/observability.js";
import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";
import { z } from "zod";

const BodySchema = z.object({ jobId: z.string().uuid() });

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  // Rate limit: prevent queue spam (Gemini cost amplifier)
  const allowed = await enforceRateLimit({
    req,
    res,
    name: "callsheet_queue",
    identifier: user.id,
    limit: 10,
    windowMs: 10_000,
    requestId,
  });
  if (!allowed) return;

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_body", details: parsed.error.issues });
  const { jobId } = parsed.data;

  try {
    const { data: job, error: fetchError } = await supabaseAdmin
      .from("callsheet_jobs")
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

    const { error: updateError } = await supabaseAdmin.from("callsheet_jobs").update({ status: "queued" }).eq("id", jobId);
    if (updateError) {
      log.error({ updateError }, "[callsheets/queue] Update error");
      return sendJson(res, 500, { error: "update_failed", message: updateError.message });
    }

    return sendJson(res, 200, { ok: true, jobId });
  } catch (err: any) {
    log.error({ err }, "[callsheets/queue] error");
    return sendJson(res, 500, { error: "queue_failed", message: err?.message ?? "Queue failed" });
  }
}, { name: "callsheets/queue" });
