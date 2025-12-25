import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function uniqueStrings(values: Array<unknown>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.trim()) set.add(v);
  }
  return Array.from(set);
}

function extractStoragePathsFromTripDocuments(raw: unknown): string[] {
  const paths: string[] = [];
  if (!raw) return paths;

  // documents is expected to be an array of { storagePath?: string }
  if (Array.isArray(raw)) {
    for (const doc of raw) {
      if (doc && typeof doc === "object") {
        const anyDoc: any = doc as any;
        if (typeof anyDoc.storagePath === "string") paths.push(anyDoc.storagePath);
      }
    }
    return paths;
  }

  // Sometimes JSON might come through as a string
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return extractStoragePathsFromTripDocuments(parsed);
    } catch {
      return paths;
    }
  }

  return paths;
}

async function deleteStoragePaths(bucket: string, paths: string[]) {
  const uniq = uniqueStrings(paths);
  if (uniq.length === 0) return;

  // supabase storage remove supports batching
  for (const batch of chunk(uniq, 100)) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(batch);
    if (error) {
      // Best-effort: keep going
      console.error(`[delete-account] storage remove failed (${bucket}):`, error);
    }
  }
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

  try {
    // 1) Collect storage paths BEFORE deleting rows
    const callsheetsPaths: string[] = [];
    const projectDocsPaths: string[] = [];

    const { data: jobs, error: jobsErr } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("storage_path")
      .eq("user_id", user.id);
    if (jobsErr) console.error("[delete-account] callsheet_jobs select failed:", jobsErr);
    for (const row of jobs ?? []) callsheetsPaths.push((row as any).storage_path);

    const { data: trips, error: tripsErr } = await supabaseAdmin
      .from("trips")
      .select("documents")
      .eq("user_id", user.id);
    if (tripsErr) console.error("[delete-account] trips select failed:", tripsErr);
    for (const row of trips ?? []) {
      callsheetsPaths.push(...extractStoragePathsFromTripDocuments((row as any).documents));
    }

    const { data: projectDocs, error: projectDocsErr } = await supabaseAdmin
      .from("project_documents")
      .select("storage_path")
      .eq("user_id", user.id);
    if (projectDocsErr) console.error("[delete-account] project_documents select failed:", projectDocsErr);
    for (const row of projectDocs ?? []) projectDocsPaths.push((row as any).storage_path);

    // 2) Delete storage (best-effort)
    await deleteStoragePaths("callsheets", callsheetsPaths);
    await deleteStoragePaths("project_documents", projectDocsPaths);

    // 3) Delete DB rows (best-effort order)
    const deletes: Array<Promise<any>> = [];

    deletes.push(supabaseAdmin.from("project_documents").delete().eq("user_id", user.id));
    deletes.push(supabaseAdmin.from("reports").delete().eq("user_id", user.id));
    deletes.push(supabaseAdmin.from("route_templates").delete().eq("user_id", user.id));
    deletes.push(supabaseAdmin.from("producer_mappings").delete().eq("user_id", user.id));
    deletes.push(supabaseAdmin.from("callsheet_jobs").delete().eq("user_id", user.id));
    deletes.push(supabaseAdmin.from("trips").delete().eq("user_id", user.id));
    deletes.push(supabaseAdmin.from("projects").delete().eq("user_id", user.id));
    deletes.push(supabaseAdmin.from("google_connections").delete().eq("user_id", user.id));

    const results = await Promise.allSettled(deletes);
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[delete-account] delete failed:", r.reason);
      } else {
        const value: any = r.value;
        if (value?.error) console.error("[delete-account] delete error:", value.error);
      }
    }

    // 4) Delete auth user (this should cascade remaining FK rows)
    const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (authDelErr) {
      console.error("[delete-account] auth delete failed:", authDelErr);
      return sendJson(res, 500, { error: "auth_delete_failed", message: authDelErr.message });
    }

    return sendJson(res, 200, { ok: true });
  } catch (e: any) {
    console.error("[delete-account] unexpected error:", e);
    return sendJson(res, 500, { error: "delete_failed", message: e?.message ?? "Delete failed" });
  }
}
