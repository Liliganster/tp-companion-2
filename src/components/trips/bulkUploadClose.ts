export type BulkAiStep = "upload" | "processing" | "review";
export type BulkCloseJobState = { status?: string | null };
type GetBulkCloseCancellationArgs = {
  activeJobIds: string[];
  aiLoading: boolean;
  aiStep: BulkAiStep;
  jobIds: string[];
  jobStateById: Record<string, BulkCloseJobState>;
};

/** The browser dispatches the batch. Closing must never silently cancel its queue.
 * Keep the dialog open while work remains; only the explicit cancellation action
 * changes persisted jobs to cancelled. A finished batch can close normally. */
export function getBulkCloseCancellation(args: GetBulkCloseCancellationArgs) {
  const ids = [...new Set([...args.jobIds, ...args.activeJobIds])].filter(Boolean);
  return { shouldBlockClose: args.aiLoading || ids.some(id =>
    ['created', 'queued', 'processing'].includes(String(args.jobStateById[id]?.status ?? '')),
  ) };
}
