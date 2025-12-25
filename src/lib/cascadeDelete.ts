import type { SupabaseClient } from "@supabase/supabase-js";

type AnyRow = Record<string, any>;

type AnyErr = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  statusCode?: number;
  status?: number;
  error?: unknown;
};

function errToMessage(err: unknown) {
  if (!err) return "";
  if (typeof err === "string") return err;
  const anyErr = err as AnyErr;
  return anyErr.message ? String(anyErr.message) : String(err);
}

function isMissingColumnOrSchema(err: unknown) {
  const anyErr = err as AnyErr;
  const msg = errToMessage(err).toLowerCase();
  return (
    anyErr?.code === "PGRST204" ||
    anyErr?.code === "PGRST205" ||
    msg.includes("could not find") ||
    msg.includes("column") && msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

async function bestEffortRemoveFromBucket(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
) {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (!error) return;

  // If bulk remove fails, try one by one. We don't want a storage hiccup to block deletes.
  console.warn(`[cascadeDelete] Storage bulk remove failed for ${bucket}:`, error);

  await Promise.all(
    paths.map(async (p) => {
      const { error: singleError } = await supabase.storage.from(bucket).remove([p]);
      if (singleError) {
        console.warn(`[cascadeDelete] Storage remove failed for ${bucket} path=${p}:`, singleError);
      }
    }),
  );
}

function uniqStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));
}

async function removeTripIdFromReports(supabase: SupabaseClient, tripId: string) {
  const { data: affectedReports, error } = await supabase
    .from("reports")
    .select("id, trip_ids")
    .contains("trip_ids", [tripId]);

  if (error) {
    // Some deployments may not have the optional trip_ids column yet.
    // In that case, skip report cleanup instead of blocking deletes.
    if (isMissingColumnOrSchema(error)) {
      console.warn("[cascadeDelete] reports.trip_ids missing; skipping report cleanup");
      return;
    }
    throw error;
  }
  if (!affectedReports || affectedReports.length === 0) return;

  await Promise.all(
    affectedReports.map(async (r: AnyRow) => {
      const currentIds: string[] = Array.isArray(r.trip_ids) ? r.trip_ids : [];
      const nextIds = currentIds.filter((id) => id !== tripId);
      if (nextIds.length === currentIds.length) return;
      const { error: updateError } = await supabase.from("reports").update({ trip_ids: nextIds }).eq("id", r.id);
      if (updateError) throw updateError;
    }),
  );
}

export async function cascadeDeleteTripById(supabase: SupabaseClient, tripId: string) {
  // 1) Load documents
  const { data: tripRow, error: tripFetchError } = await supabase
    .from("trips")
    .select("documents")
    .eq("id", tripId)
    .maybeSingle();

  if (tripFetchError) throw tripFetchError;

  const docs: AnyRow[] = Array.isArray((tripRow as AnyRow | null)?.documents) ? (tripRow as AnyRow).documents : [];
  const storagePaths = uniqStrings(
    docs.map((d) => {
      if (typeof d?.storagePath === "string") return d.storagePath;
      if (typeof d?.path === "string") return d.path;
      return "";
    }),
  );

  // 2) Remove references in reports first (so we can still abort safely)
  await removeTripIdFromReports(supabase, tripId);

  // 3) Delete associated callsheet files (if any)
  if (storagePaths.length > 0) {
    await bestEffortRemoveFromBucket(supabase, "callsheets", storagePaths);

    // 4) Delete extractor jobs for these storage paths (cascades results/locations/etc)
    const { error: jobsDeleteError } = await supabase
      .from("callsheet_jobs")
      .delete()
      .in("storage_path", storagePaths);

    if (jobsDeleteError) throw jobsDeleteError;
  }

  // 5) Delete trip row
  const { error: deleteTripError } = await supabase.from("trips").delete().eq("id", tripId);
  if (deleteTripError) throw deleteTripError;
}

export async function cascadeDeleteCallsheetJobById(supabase: SupabaseClient, jobId: string) {
  const { data: job, error: fetchError } = await supabase
    .from("callsheet_jobs")
    .select("id, storage_path")
    .eq("id", jobId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!job) return;

  const storagePath = String((job as AnyRow).storage_path ?? "").trim();
  if (storagePath) {
    await bestEffortRemoveFromBucket(supabase, "callsheets", [storagePath]);
  }

  const { error: deleteError } = await supabase.from("callsheet_jobs").delete().eq("id", jobId);
  if (deleteError) throw deleteError;
}

export async function cascadeDeleteProjectById(supabase: SupabaseClient, projectId: string) {
  // 1) Delete trips for this project
  const { data: tripRows, error: tripsFetchError } = await supabase
    .from("trips")
    .select("id")
    .eq("project_id", projectId);

  if (tripsFetchError) {
    if (isMissingColumnOrSchema(tripsFetchError)) {
      console.warn("[cascadeDelete] trips.project_id missing; skipping trip deletion for project");
    } else {
      throw tripsFetchError;
    }
  }
  const tripIds = (tripRows ?? []).map((r: AnyRow) => String(r.id));

  // Delete trips sequentially to keep error handling predictable
  for (const tripId of tripIds) {
    await cascadeDeleteTripById(supabase, tripId);
  }

  // 2) Delete callsheet jobs linked to project (and their files)
  const { data: jobs, error: jobsFetchError } = await supabase
    .from("callsheet_jobs")
    .select("id, storage_path")
    .eq("project_id", projectId);

  if (jobsFetchError) {
    if (isMissingColumnOrSchema(jobsFetchError)) {
      console.warn("[cascadeDelete] callsheet_jobs.project_id missing; skipping callsheet job cleanup for project");
    } else {
      throw jobsFetchError;
    }
  }

  const jobStoragePaths = uniqStrings((jobs ?? []).map((j: AnyRow) => j.storage_path));
  if (jobStoragePaths.length > 0) {
    await bestEffortRemoveFromBucket(supabase, "callsheets", jobStoragePaths);
  }

  if ((jobs ?? []).length > 0) {
    const { error: deleteJobsError } = await supabase.from("callsheet_jobs").delete().eq("project_id", projectId);
    if (deleteJobsError) {
      if (isMissingColumnOrSchema(deleteJobsError)) {
        console.warn("[cascadeDelete] callsheet_jobs.project_id missing; skipping callsheet job delete for project");
      } else {
        throw deleteJobsError;
      }
    }
  }

  // 3) Delete project_documents (and their files)
  const { data: docs, error: docsFetchError } = await supabase
    .from("project_documents")
    .select("id, storage_path")
    .eq("project_id", projectId);

  if (docsFetchError) {
    if (isMissingColumnOrSchema(docsFetchError)) {
      console.warn("[cascadeDelete] project_documents.project_id missing; skipping project document cleanup");
    } else {
      throw docsFetchError;
    }
  }

  const projectDocPaths = uniqStrings((docs ?? []).map((d: AnyRow) => d.storage_path));
  if (projectDocPaths.length > 0) {
    await bestEffortRemoveFromBucket(supabase, "project_documents", projectDocPaths);
  }

  if ((docs ?? []).length > 0) {
    const { error: deleteDocsError } = await supabase.from("project_documents").delete().eq("project_id", projectId);
    if (deleteDocsError) {
      if (isMissingColumnOrSchema(deleteDocsError)) {
        console.warn("[cascadeDelete] project_documents.project_id missing; skipping project document delete");
      } else {
        throw deleteDocsError;
      }
    }
  }

  // 4) Delete project row itself
  const { error: deleteProjectError } = await supabase.from("projects").delete().eq("id", projectId);
  if (deleteProjectError) throw deleteProjectError;
}
