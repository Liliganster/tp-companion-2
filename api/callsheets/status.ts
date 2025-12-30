import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { withApiObservability } from "../_utils/observability.js";
import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";
import { z } from "zod";

const QuerySchema = z.object({ jobId: z.string().uuid() });

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  // Rate limit: status is often polled; keep it generous but bounded.
  const allowed = await enforceRateLimit({
    req,
    res,
    name: "callsheet_status",
    identifier: user.id,
    limit: 120,
    windowMs: 60_000,
    requestId,
  });
  if (!allowed) return;

  const parsed = QuerySchema.safeParse({ jobId: typeof req.query?.jobId === "string" ? req.query.jobId : undefined });
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_query", details: parsed.error.issues });
  const { jobId } = parsed.data;

  try {
    const { data: job, error: jobError } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (jobError || !job) {
      return sendJson(res, 404, { error: "job_not_found" });
    }

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
