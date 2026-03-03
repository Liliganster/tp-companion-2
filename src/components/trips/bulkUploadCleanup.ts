export type BulkExistingCallsheetJob = {
  id?: string | null;
  status?: string | null;
};

const TERMINAL_BULK_DUPLICATE_STATUSES = new Set([
  "cancelled",
  "failed",
  "needs_review",
  "out_of_quota",
]);

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      ids
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export function getBulkDuplicateCleanupIds(args: {
  existingJobs: BulkExistingCallsheetJob[];
  persistedJobIds: ReadonlySet<string>;
}) {
  const { existingJobs, persistedJobIds } = args;

  return uniqueIds(
    existingJobs.flatMap((job) => {
      const id = String(job.id ?? "").trim();
      const status = String(job.status ?? "").trim();
      if (!id || persistedJobIds.has(id)) return [];
      if (TERMINAL_BULK_DUPLICATE_STATUSES.has(status)) return [id];
      if (status === "done") return [id];
      return [];
    }),
  );
}

export function getBulkSessionCleanupIds(args: {
  jobIds: string[];
  savedByJobId: Record<string, boolean | undefined>;
}) {
  const { jobIds, savedByJobId } = args;
  return uniqueIds(jobIds.filter((id) => !savedByJobId[id]));
}
