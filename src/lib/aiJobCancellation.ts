import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";

const CALLSHEET_CANCELABLE_STATUSES = ["created", "queued", "processing", "failed"] as const;
const INVOICE_CANCELABLE_STATUSES = ["created", "queued", "processing", "failed"] as const;
const CALLSHEET_DELETABLE_STATUSES = ["created", "queued", "processing", "failed", "cancelled", "out_of_quota"] as const;

function uniqueIds(ids: string[]) {
  return Array.from(
    new Set(
      (ids ?? [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );
}

async function updateWithFallback<T extends Record<string, any>>(args: {
  table: string;
  ids: string[];
  statuses: readonly string[];
  fullPatch: T;
  minimalPatch: Pick<T, "status"> & Record<string, any>;
}) {
  const { table, ids, statuses, fullPatch, minimalPatch } = args;
  if (ids.length === 0) return;

  const attempt = await supabase
    .from(table as any)
    .update(fullPatch as any)
    .in("id", ids)
    .in("status", [...statuses]);

  if (!attempt.error) return;

  const fallback = await supabase
    .from(table as any)
    .update(minimalPatch as any)
    .in("id", ids)
    .in("status", [...statuses]);

  if (fallback.error) {
    logger.warn(`[aiJobCancellation] Failed to cancel jobs in ${table}`, { attempt: attempt.error, fallback: fallback.error });
  }
}

export async function cancelCallsheetJobs(jobIds: string[]) {
  const ids = uniqueIds(jobIds);
  if (ids.length === 0) return;

  const { data: rows, error: fetchError } = await supabase
    .from("callsheet_jobs")
    .select("id, storage_path, status")
    .in("id", ids)
    .in("status", [...CALLSHEET_DELETABLE_STATUSES]);

  if (fetchError) {
    logger.warn("[aiJobCancellation] Failed to fetch callsheet jobs for delete", fetchError);
    return;
  }

  const jobs = Array.isArray(rows) ? rows : [];
  const paths = jobs
    .map((row: any) => String(row?.storage_path ?? "").trim())
    .filter((p: string) => p && p !== "pending");

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("callsheets").remove(paths);
    if (storageError) {
      logger.warn("[aiJobCancellation] Failed to remove callsheet files", storageError);
    }
  }

  const deletableIds = jobs.map((row: any) => String(row?.id ?? "").trim()).filter(Boolean);
  if (deletableIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from("callsheet_jobs")
    .delete()
    .in("id", deletableIds)
    .in("status", [...CALLSHEET_DELETABLE_STATUSES]);

  if (deleteError) {
    logger.warn("[aiJobCancellation] Failed to delete callsheet jobs", deleteError);
  }
}

export async function cancelInvoiceJobs(jobIds: string[]) {
  const ids = uniqueIds(jobIds);

  await updateWithFallback({
    table: "invoice_jobs",
    ids,
    statuses: INVOICE_CANCELABLE_STATUSES,
    fullPatch: {
      status: "cancelled",
      needs_review_reason: null,
      next_retry_at: null,
      processing_started_at: null,
      last_error: null,
    },
    minimalPatch: {
      status: "cancelled",
    },
  });
}
