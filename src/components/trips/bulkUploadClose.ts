export type BulkAiStep = "upload" | "processing" | "review";

export type BulkCloseJobState = {
  status?: string | null;
};

type GetBulkCloseCancellationArgs = {
  activeJobIds: string[];
  aiLoading: boolean;
  aiStep: BulkAiStep;
  jobIds: string[];
  jobStateById: Record<string, BulkCloseJobState>;
};

export function getBulkCloseCancellation(args: GetBulkCloseCancellationArgs) {
  const { activeJobIds, aiLoading, aiStep, jobIds, jobStateById } = args;
  const sessionJobIds = Array.from(new Set([...jobIds, ...activeJobIds])).filter(Boolean);
  const closeWhileProcessing = aiLoading || aiStep === "processing";

  const jobsToCancel = sessionJobIds.filter((id) => {
    if (closeWhileProcessing) return true;

    const status = String(jobStateById[id]?.status ?? "").trim();
    return status === "created" || status === "queued" || status === "processing" || status === "failed";
  });

  return {
    jobsToCancel,
    shouldShowCancellationToast: closeWhileProcessing || jobsToCancel.length > 0,
  };
}
