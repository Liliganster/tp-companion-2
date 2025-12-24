import type { SupabaseClient } from "@supabase/supabase-js";

type AnyRow = Record<string, any>;

function uniqStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));
}

async function removeTripIdFromReports(supabase: SupabaseClient, tripId: string) {
  const { data: affectedReports, error } = await supabase
    .from("reports")
    .select("id, trip_ids")
    .contains("trip_ids", [tripId]);

  if (error) throw error;
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
    const { error: storageError } = await supabase.storage.from("callsheets").remove(storagePaths);
    if (storageError) throw storageError;

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
    const { error: storageError } = await supabase.storage.from("callsheets").remove([storagePath]);
    if (storageError) throw storageError;
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

  if (tripsFetchError) throw tripsFetchError;
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

  if (jobsFetchError) throw jobsFetchError;

  const jobStoragePaths = uniqStrings((jobs ?? []).map((j: AnyRow) => j.storage_path));
  if (jobStoragePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from("callsheets").remove(jobStoragePaths);
    if (storageError) throw storageError;
  }

  if ((jobs ?? []).length > 0) {
    const { error: deleteJobsError } = await supabase.from("callsheet_jobs").delete().eq("project_id", projectId);
    if (deleteJobsError) throw deleteJobsError;
  }

  // 3) Delete project_documents (and their files)
  const { data: docs, error: docsFetchError } = await supabase
    .from("project_documents")
    .select("id, storage_path")
    .eq("project_id", projectId);

  if (docsFetchError) throw docsFetchError;

  const projectDocPaths = uniqStrings((docs ?? []).map((d: AnyRow) => d.storage_path));
  if (projectDocPaths.length > 0) {
    const { error: storageError } = await supabase.storage.from("project_documents").remove(projectDocPaths);
    if (storageError) throw storageError;
  }

  if ((docs ?? []).length > 0) {
    const { error: deleteDocsError } = await supabase.from("project_documents").delete().eq("project_id", projectId);
    if (deleteDocsError) throw deleteDocsError;
  }

  // 4) Delete project row itself
  const { error: deleteProjectError } = await supabase.from("projects").delete().eq("id", projectId);
  if (deleteProjectError) throw deleteProjectError;
}
