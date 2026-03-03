import { describe, expect, it } from "vitest";

import { getBulkCloseCancellation } from "./bulkUploadClose";

describe("getBulkCloseCancellation", () => {
  it("marks in-flight processing work as cancellable and requests a toast", () => {
    const result = getBulkCloseCancellation({
      activeJobIds: ["job-1", "job-2"],
      aiLoading: false,
      aiStep: "processing",
      jobIds: ["job-1", "job-3"],
      jobStateById: {
        "job-1": { status: "done" },
        "job-2": { status: "queued" },
        "job-3": { status: "processing" },
      },
    });

    expect(result.jobsToCancel).toEqual(["job-1", "job-3", "job-2"]);
    expect(result.shouldShowCancellationToast).toBe(true);
  });

  it("only cancels non-terminal jobs once the modal is no longer processing", () => {
    const result = getBulkCloseCancellation({
      activeJobIds: ["job-1", "job-2"],
      aiLoading: false,
      aiStep: "review",
      jobIds: ["job-1", "job-3", "job-4"],
      jobStateById: {
        "job-1": { status: "done" },
        "job-2": { status: "queued" },
        "job-3": { status: "processing" },
        "job-4": { status: "failed" },
      },
    });

    expect(result.jobsToCancel).toEqual(["job-3", "job-4", "job-2"]);
    expect(result.shouldShowCancellationToast).toBe(true);
  });

  it("does not request a cancellation toast when the modal closes idle", () => {
    const result = getBulkCloseCancellation({
      activeJobIds: [],
      aiLoading: false,
      aiStep: "upload",
      jobIds: [],
      jobStateById: {},
    });

    expect(result.jobsToCancel).toEqual([]);
    expect(result.shouldShowCancellationToast).toBe(false);
  });
});
