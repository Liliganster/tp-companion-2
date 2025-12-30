import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { withApiObservability } from "../_utils/observability.js";
import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";
import { z } from "zod";

const BodySchema = z.object({
  filename: z.string().max(180).optional(),
  contentType: z.string().max(120).optional(),
  size: z.number().int().min(0).max(25_000_000).optional(),
});

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  // Rate limit: signed upload URLs can be abused (storage + downstream Gemini cost).
  const allowed = await enforceRateLimit({
    req,
    res,
    name: "callsheet_create_upload",
    identifier: user.id,
    limit: 20,
    windowMs: 60_000,
    requestId,
  });
  if (!allowed) return;

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_body", details: parsed.error.issues });

  try {
    const { filename } = parsed.data;

    const { data: job, error: jobError } = await supabaseAdmin
      .from("callsheet_jobs")
      .insert({
        user_id: user.id,
        storage_path: "pending",
        status: "created",
      })
      .select("id")
      .single();

    if (jobError || !job?.id) {
      log.error({ jobError }, "[callsheets/create-upload] job insert failed");
      return sendJson(res, 500, { error: "job_insert_failed", message: jobError?.message });
    }

    const filePath = `${user.id}/${job.id}/${filename || "document.pdf"}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("callsheets")
      .createSignedUploadUrl(filePath);

    if (uploadError || !uploadData?.signedUrl) {
      log.error({ uploadError }, "[callsheets/create-upload] createSignedUploadUrl failed");
      return sendJson(res, 500, { error: "signed_upload_failed", message: uploadError?.message });
    }

    try {
      await supabaseAdmin.from("callsheet_jobs").update({ storage_path: filePath }).eq("id", job.id);
    } catch {
      // best-effort
    }

    return sendJson(res, 200, {
      jobId: job.id,
      uploadUrl: uploadData.signedUrl,
      path: uploadData.path,
    });
  } catch (err: any) {
    log.error({ err }, "[callsheets/create-upload] error");
    return sendJson(res, 500, { error: "create_upload_failed", message: err?.message ?? "Create upload failed" });
  }
}, { name: "callsheets/create-upload" });
