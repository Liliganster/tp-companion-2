import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";

const CALLSHEET_CANCELABLE_STATUSES = ["created", "queued", "processing", "failed"] as const;
const INVOICE_CANCELABLE_STATUSES = ["created", "queued", "processing", "failed"] as const;

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

  await updateWithFallback({
    table: "callsheet_jobs",
    ids,
    statuses: CALLSHEET_CANCELABLE_STATUSES,
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
