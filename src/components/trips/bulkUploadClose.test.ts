import { describe, expect, it } from "vitest";

import { getBulkCloseCancellation } from "./bulkUploadClose";

describe("getBulkCloseCancellation", () => {
  it("marks in-flight processing work as cancellable and requests a toast", () => {
    const result = getBulkCloseCancellation({
      activeJobIds: ["job-1"],
      aiLoading: false,
      aiStep: "processing",
      jobIds: ["job-1"],
      jobStateById: {},
    });

    expect(result.jobsToCancel).toEqual(["job-1"]);
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
