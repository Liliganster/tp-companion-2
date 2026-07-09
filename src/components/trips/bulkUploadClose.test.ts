import { describe, expect, it } from "vitest";

import { getBulkCloseCancellation } from "./bulkUploadClose";

describe("getBulkCloseCancellation", () => {
  it("keeps processing/done jobs alive on close and only cancels queued work", () => {
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

    // queued se cancela; processing y done sobreviven (se recuperan al reabrir).
    expect(result.jobsToCancel).toEqual(["job-2"]);
    expect(result.backgroundJobIds).toEqual(["job-1", "job-3"]);
    expect(result.shouldShowBackgroundToast).toBe(true);
  });

  it("cancels non-terminal queued/failed jobs when closing from review", () => {
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

    expect(result.jobsToCancel).toEqual(["job-4", "job-2"]);
    // processing sigue vivo también al cerrar desde revisión.
    expect(result.backgroundJobIds).toEqual(["job-3"]);
    expect(result.shouldShowCancellationToast).toBe(true);
  });

  it("cancels unknown-status jobs only while an upload is still in flight", () => {
    const uploading = getBulkCloseCancellation({
      activeJobIds: ["job-1"],
      aiLoading: true,
      aiStep: "upload",
      jobIds: [],
      jobStateById: {},
    });
    expect(uploading.jobsToCancel).toEqual(["job-1"]);

    const idleUnknown = getBulkCloseCancellation({
      activeJobIds: ["job-1"],
      aiLoading: false,
      aiStep: "review",
      jobIds: [],
      jobStateById: {},
    });
    expect(idleUnknown.jobsToCancel).toEqual([]);
  });

  it("does not request any toast when the modal closes idle", () => {
    const result = getBulkCloseCancellation({
      activeJobIds: [],
      aiLoading: false,
      aiStep: "upload",
      jobIds: [],
      jobStateById: {},
    });

    expect(result.jobsToCancel).toEqual([]);
    expect(result.backgroundJobIds).toEqual([]);
    expect(result.shouldShowCancellationToast).toBe(false);
    expect(result.shouldShowBackgroundToast).toBe(false);
  });
});
