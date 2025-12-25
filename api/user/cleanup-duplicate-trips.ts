import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const dryRun = Boolean(req.body?.dryRun ?? true);

  try {
    const { data: trips, error } = await supabaseAdmin
      .from("trips")
      .select("id, callsheet_job_id, created_at, updated_at")
      .eq("user_id", user.id)
      .not("callsheet_job_id", "is", null)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[cleanup-duplicate-trips] select failed:", error);
      return sendJson(res, 500, { error: "select_failed", message: error.message });
    }

    const rows = (trips ?? []) as Array<{ id: string; callsheet_job_id: string | null; created_at?: string; updated_at?: string }>;

    const byJob = new Map<string, string[]>();
    for (const t of rows) {
      const jobId = (t.callsheet_job_id ?? "").toString();
      if (!jobId) continue;
      const list = byJob.get(jobId) ?? [];
      list.push(t.id);
      byJob.set(jobId, list);
    }

    const keepIds: string[] = [];
    const deleteIds: string[] = [];
    const affectedJobIds: string[] = [];

    for (const [jobId, ids] of byJob.entries()) {
      if (ids.length <= 1) {
        keepIds.push(ids[0]);
        continue;
      }

      affectedJobIds.push(jobId);
      keepIds.push(ids[0]);
      deleteIds.push(...ids.slice(1));
    }

    if (dryRun) {
      return sendJson(res, 200, {
        ok: true,
        dryRun: true,
        totalTripsWithCallsheetJobId: rows.length,
        uniqueJobs: byJob.size,
        duplicatesFound: deleteIds.length,
        wouldKeep: keepIds.length,
        wouldDelete: deleteIds.length,
        affectedJobIds: affectedJobIds.slice(0, 50),
      });
    }

    let deleted = 0;
    for (const batch of chunk(deleteIds, 100)) {
      const { error: delErr } = await supabaseAdmin.from("trips").delete().in("id", batch).eq("user_id", user.id);
      if (delErr) {
        console.error("[cleanup-duplicate-trips] delete failed:", delErr);
        return sendJson(res, 500, { error: "delete_failed", message: delErr.message, deletedSoFar: deleted });
      }
      deleted += batch.length;
    }

    return sendJson(res, 200, {
      ok: true,
      dryRun: false,
      totalTripsWithCallsheetJobId: rows.length,
      uniqueJobs: byJob.size,
      kept: keepIds.length,
      deleted,
      affectedJobIds: affectedJobIds.slice(0, 50),
    });
  } catch (e: any) {
    console.error("[cleanup-duplicate-trips] unexpected error:", e);
    return sendJson(res, 500, { error: "cleanup_failed", message: e?.message ?? "Cleanup failed" });
  }
}
