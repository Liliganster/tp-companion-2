type BulkJobState = {
  status?: string | null;
  needsReviewReason?: string | null;
};

export function getBulkDisplayStatus(args: {
  status?: string | null;
  totalJobs: number;
}) {
  const normalizedStatus = String(args.status ?? "").trim() || "queued";
  if (args.totalJobs === 1 && (normalizedStatus === "created" || normalizedStatus === "queued")) {
    return "processing";
  }
  return normalizedStatus;
}

export function getInitialBulkJobStateById(args: {
  createdJobIds: string[];
  jobStateById: Record<string, BulkJobState>;
}) {
  const { createdJobIds, jobStateById } = args;

  return createdJobIds.reduce<Record<string, BulkJobState>>((acc, id) => {
    const current = jobStateById[id] ?? {};

    acc[id] = {
      ...current,
      status: getBulkDisplayStatus({
        status: current.status,
        totalJobs: createdJobIds.length,
      }),
    };
    return acc;
  }, {});
}

export function getBulkTriggerWorkerUrl(jobIds: string[]) {
  const ids = (jobIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean);
  if (ids.length === 1) {
    return `/api/callsheets/trigger-worker?jobId=${encodeURIComponent(ids[0])}`;
  }
  return "/api/callsheets/trigger-worker";
}
