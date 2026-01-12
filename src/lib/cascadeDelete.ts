import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

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
  logger.warn(`[cascadeDelete] Storage bulk remove failed for ${bucket}:`, error);

  await Promise.all(
    paths.map(async (p) => {
      const { error: singleError } = await supabase.storage.from(bucket).remove([p]);
      if (singleError) {
        logger.warn(`[cascadeDelete] Storage remove failed for ${bucket} path=${p}:`, singleError);
      }
    }),
  );
}

function uniqStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean)));
}

async function removeTripIdFromReports(supabase: SupabaseClient, tripId: string) {
  // NOTE:
  // Using PostgREST json contains operators can be brittle across schema cache / type differences
  // and has been observed to return 400 (22P02 invalid json). To keep deletes reliable, we
  // fetch report ids + trip_ids and filter client-side.
  const { data: allReports, error } = await supabase
    .from("reports")
    .select("id, trip_ids");

  if (error) {
    // Some deployments may not have the optional trip_ids column yet.
    // In that case, skip report cleanup instead of blocking deletes.
    if (isMissingColumnOrSchema(error)) {
      logger.warn("[cascadeDelete] reports.trip_ids missing; skipping report cleanup");
      return;
    }
    throw error;
  }
  if (!allReports || allReports.length === 0) return;

  const affectedReports = (allReports as AnyRow[]).filter((r) => {
    const v = (r as AnyRow)?.trip_ids;
    if (Array.isArray(v)) return v.includes(tripId);
    // Some clients may store trip_ids as jsonb but return it as string.
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) && parsed.includes(tripId);
      } catch {
        return false;
      }
    }
    return false;
  });

  if (affectedReports.length === 0) return;

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
  // 1) Load documents and project_id
  let tripRow: AnyRow | null = null;

  const extendedTrip = await supabase
    .from("trips")
    .select("documents, project_id, invoice_job_id, callsheet_job_id")
    .eq("id", tripId)
    .maybeSingle();

  if (extendedTrip.error) {
    if (!isMissingColumnOrSchema(extendedTrip.error)) throw extendedTrip.error;

    const minimalTrip = await supabase
      .from("trips")
      .select("documents, project_id")
      .eq("id", tripId)
      .maybeSingle();

    if (minimalTrip.error) throw minimalTrip.error;
    tripRow = (minimalTrip.data as AnyRow | null) ?? null;
  } else {
    tripRow = (extendedTrip.data as AnyRow | null) ?? null;
  }

  const projectId = tripRow?.project_id || null;
  const callsheetJobId = typeof tripRow?.callsheet_job_id === "string" ? String(tripRow.callsheet_job_id).trim() : "";
  const docs: AnyRow[] = Array.isArray(tripRow?.documents) ? (tripRow as AnyRow).documents : [];

  const callsheetPaths = uniqStrings(
    docs
      .filter((d) => String((d as AnyRow)?.bucketId ?? "").trim() !== "project_documents")
      .map((d) => {
        if (typeof (d as AnyRow)?.storagePath === "string") return String((d as AnyRow).storagePath);
        if (typeof (d as AnyRow)?.path === "string") return String((d as AnyRow).path);
        return "";
      }),
  );

  // If multiple trips reference the same callsheet job (e.g., due to a previous duplicate bug),
  // don't delete the underlying job/file until the last referencing trip is removed.
  let callsheetPathsToDelete = callsheetPaths;
  if (callsheetJobId) {
    let callsheetJobPath = "";
    try {
      const { data, error: jobFetchError } = await supabase
        .from("callsheet_jobs")
        .select("storage_path")
        .eq("id", callsheetJobId)
        .maybeSingle();

      if (!jobFetchError) {
        callsheetJobPath = String((data as AnyRow | null)?.storage_path ?? "").trim();
      }
    } catch {
      // ignore
    }

    try {
      const { count, error: countError } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("callsheet_job_id", callsheetJobId)
        .neq("id", tripId);

      if (!countError && typeof count === "number") {
        if (count > 0) {
          if (callsheetJobPath) {
            callsheetPathsToDelete = callsheetPathsToDelete.filter((p) => p !== callsheetJobPath);
          }
        } else if (count === 0) {
          try {
            await cascadeDeleteCallsheetJobById(supabase, callsheetJobId);
          } catch {
            // ignore and continue with path-based cleanup below
          }

          if (callsheetJobPath) {
            callsheetPathsToDelete = callsheetPathsToDelete.filter((p) => p !== callsheetJobPath);
          }
        }
      }
    } catch {
      // ignore and keep existing deletion behaviour
    }
  }

  const projectDocumentPaths = uniqStrings(
    docs
      .filter((d) => String((d as AnyRow)?.bucketId ?? "").trim() === "project_documents")
      .map((d) => {
        if (typeof (d as AnyRow)?.storagePath === "string") return String((d as AnyRow).storagePath);
        if (typeof (d as AnyRow)?.path === "string") return String((d as AnyRow).path);
        return "";
      }),
  );

  // 2) Remove references in reports first (so we can still abort safely)
  await removeTripIdFromReports(supabase, tripId);

  // 3) Delete invoice jobs linked to this trip (and their files/results/docs)
  try {
    const { data: invoiceJobs, error: invoiceJobsError } = await supabase
      .from("invoice_jobs")
      .select("id")
      .eq("trip_id", tripId);

    if (invoiceJobsError) {
      if (!isMissingColumnOrSchema(invoiceJobsError)) throw invoiceJobsError;
    } else {
      const ids = uniqStrings((invoiceJobs ?? []).map((j: AnyRow) => String(j.id)));
      for (const id of ids) {
        await cascadeDeleteInvoiceJobById(supabase, id);
      }
    }
  } catch (err) {
    if (!isMissingColumnOrSchema(err)) throw err;
  }

  // 4) Delete associated callsheet files/jobs (if any)
  if (callsheetPathsToDelete.length > 0) {
    await bestEffortRemoveFromBucket(supabase, "callsheets", callsheetPathsToDelete);

    const { error: jobsDeleteError } = await supabase
      .from("callsheet_jobs")
      .delete()
      .in("storage_path", callsheetPathsToDelete);

    if (jobsDeleteError) throw jobsDeleteError;
  }

  // 5) Delete project_documents files/rows referenced by this trip's documents (best-effort)
  if (projectDocumentPaths.length > 0) {
    await bestEffortRemoveFromBucket(supabase, "project_documents", projectDocumentPaths);

    try {
      const { error: deleteDocsError } = await supabase
        .from("project_documents")
        .delete()
        .in("storage_path", projectDocumentPaths);

      if (deleteDocsError && !isMissingColumnOrSchema(deleteDocsError)) throw deleteDocsError;
    } catch (err) {
      if (!isMissingColumnOrSchema(err)) throw err;
      logger.warn("[cascadeDelete] project_documents missing; skipping trip project document cleanup");
    }
  }

  // 6) Delete trip row
  const { error: deleteTripError } = await supabase.from("trips").delete().eq("id", tripId);
  if (deleteTripError) throw deleteTripError;

  // 7) Check if project is now empty and delete it if so
  if (projectId) {
    const { count, error: countError } = await supabase
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    if (countError) {
      if (!isMissingColumnOrSchema(countError)) {
        logger.warn("[cascadeDelete] Could not check remaining trips for project:", countError);
      }
    } else if (count === 0) {
      // Project has no more trips, delete it (but avoid recursion by using direct delete logic)
      await deleteOrphanProject(supabase, projectId);
    }
  }
}

async function deleteOrphanProject(supabase: SupabaseClient, projectId: string) {
  // Delete callsheet jobs linked to project (and their files)
  const { data: jobs, error: jobsFetchError } = await supabase
    .from("callsheet_jobs")
    .select("id, storage_path")
    .eq("project_id", projectId);

  if (jobsFetchError && !isMissingColumnOrSchema(jobsFetchError)) {
    logger.warn("[cascadeDelete] Error fetching callsheet jobs for orphan project:", jobsFetchError);
  }

  const jobStoragePaths = uniqStrings((jobs ?? []).map((j: AnyRow) => j.storage_path));
  if (jobStoragePaths.length > 0) {
    await bestEffortRemoveFromBucket(supabase, "callsheets", jobStoragePaths);
  }

  if ((jobs ?? []).length > 0) {
    const { error: deleteJobsError } = await supabase.from("callsheet_jobs").delete().eq("project_id", projectId);
    if (deleteJobsError && !isMissingColumnOrSchema(deleteJobsError)) {
      logger.warn("[cascadeDelete] Error deleting callsheet jobs for orphan project:", deleteJobsError);
    }
  }

  // Delete invoice jobs linked to project
  const { data: invoiceJobs, error: invoiceJobsFetchError } = await supabase
    .from("invoice_jobs")
    .select("id")
    .eq("project_id", projectId);

  if (invoiceJobsFetchError && !isMissingColumnOrSchema(invoiceJobsFetchError)) {
    logger.warn("[cascadeDelete] Error fetching invoice jobs for orphan project:", invoiceJobsFetchError);
  }

  for (const job of invoiceJobs ?? []) {
    try {
      await cascadeDeleteInvoiceJobById(supabase, (job as AnyRow).id);
    } catch (e) {
      logger.warn("[cascadeDelete] Error deleting invoice job for orphan project:", e);
    }
  }

  // Delete project documents
  const { data: projectDocs, error: projectDocsFetchError } = await supabase
    .from("project_documents")
    .select("id, storage_path")
    .eq("project_id", projectId);

  if (projectDocsFetchError && !isMissingColumnOrSchema(projectDocsFetchError)) {
    logger.warn("[cascadeDelete] Error fetching project documents for orphan project:", projectDocsFetchError);
  }

  const projectDocPaths = uniqStrings((projectDocs ?? []).map((d: AnyRow) => d.storage_path));
  if (projectDocPaths.length > 0) {
    await bestEffortRemoveFromBucket(supabase, "project_documents", projectDocPaths);
  }

  if ((projectDocs ?? []).length > 0) {
    const { error: deleteProjectDocsError } = await supabase
      .from("project_documents")
      .delete()
      .eq("project_id", projectId);
    if (deleteProjectDocsError && !isMissingColumnOrSchema(deleteProjectDocsError)) {
      logger.warn("[cascadeDelete] Error deleting project documents for orphan project:", deleteProjectDocsError);
    }
  }

  // Finally delete the project
  const { error: deleteProjectError } = await supabase.from("projects").delete().eq("id", projectId);
  if (deleteProjectError) {
    logger.warn("[cascadeDelete] Error deleting orphan project:", deleteProjectError);
  }
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

export async function cascadeDeleteInvoiceJobById(supabase: SupabaseClient, jobId: string) {
  const { data: job, error: fetchError } = await supabase
    .from("invoice_jobs")
    .select("id, storage_path, trip_id")
    .eq("id", jobId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!job) return;

  const storagePath = String((job as AnyRow).storage_path ?? "").trim();
  const tripId = String((job as AnyRow).trip_id ?? "").trim();

  if (storagePath) {
    await bestEffortRemoveFromBucket(supabase, "project_documents", [storagePath]);
  }

  // Remove project_documents rows that reference this job (best-effort: some schemas may not have invoice_job_id yet)
  try {
    const { error: deleteDocsError } = await supabase.from("project_documents").delete().eq("invoice_job_id", jobId);
    if (deleteDocsError && !isMissingColumnOrSchema(deleteDocsError)) throw deleteDocsError;
  } catch (err) {
    if (!isMissingColumnOrSchema(err)) throw err;
    logger.warn("[cascadeDelete] project_documents.invoice_job_id missing; skipping invoice doc delete");
  }

  // If this invoice is linked to a trip, clear trip invoice fields and remove attached doc entries.
  if (tripId) {
    const { data: tripRow, error: tripFetchError } = await supabase
      .from("trips")
      .select("documents")
      .eq("id", tripId)
      .maybeSingle();

    if (tripFetchError) throw tripFetchError;

    const docs: AnyRow[] = Array.isArray((tripRow as AnyRow | null)?.documents) ? (tripRow as AnyRow).documents : [];
    const nextDocs = docs.filter((d) => {
      const sp = typeof d?.storagePath === "string" ? d.storagePath : typeof d?.path === "string" ? d.path : "";
      const jid = typeof d?.invoiceJobId === "string" ? d.invoiceJobId : "";
      if (jid && jid === jobId) return false;
      if (storagePath && sp && sp === storagePath) return false;
      return true;
    });

    const { error: tripUpdateError } = await supabase
      .from("trips")
      .update({
        invoice_job_id: null,
        invoice_amount: null,
        invoice_currency: null,
        documents: nextDocs,
      })
      .eq("id", tripId);

    if (tripUpdateError) throw tripUpdateError;
  }

  const { error: deleteError } = await supabase.from("invoice_jobs").delete().eq("id", jobId);
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
      logger.warn("[cascadeDelete] trips.project_id missing; skipping trip deletion for project");
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
      logger.warn("[cascadeDelete] callsheet_jobs.project_id missing; skipping callsheet job cleanup for project");
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
        logger.warn("[cascadeDelete] callsheet_jobs.project_id missing; skipping callsheet job delete for project");
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
      logger.warn("[cascadeDelete] project_documents.project_id missing; skipping project document cleanup");
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
        logger.warn("[cascadeDelete] project_documents.project_id missing; skipping project document delete");
      } else {
        throw deleteDocsError;
      }
    }
  }

  // 4) Delete project row itself
  const { error: deleteProjectError } = await supabase.from("projects").delete().eq("id", projectId);
  if (deleteProjectError) throw deleteProjectError;
}
