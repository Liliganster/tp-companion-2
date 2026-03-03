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

  const jobsToCancel = Array.from(new Set([...jobIds, ...activeJobIds])).filter((id) => {
    const status = String(jobStateById[id]?.status ?? "").trim();
    return status === "created" || status === "queued" || status === "processing" || (aiStep === "processing" && !status);
  });

  return {
    jobsToCancel,
    shouldShowCancellationToast: aiLoading || aiStep === "processing" || jobsToCancel.length > 0,
  };
}
