export type BulkAiStep = "upload" | "processing" | "review";
export type BulkCloseJobState = { status?: string | null };
type GetBulkCloseCancellationArgs = {
  activeJobIds: string[];
  aiLoading: boolean;
  aiStep: BulkAiStep;
  jobIds: string[];
  jobStateById: Record<string, BulkCloseJobState>;
};

/** Only uploading/dispatching needs the window; extraction belongs to the server. */
export function getBulkCloseCancellation(args: GetBulkCloseCancellationArgs) {
  return { shouldBlockClose: args.aiLoading };
}
