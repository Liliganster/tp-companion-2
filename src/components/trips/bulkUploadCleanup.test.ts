import { describe, expect, it } from "vitest";

import { getBulkDuplicateCleanupIds, getBulkSessionCleanupIds } from "./bulkUploadCleanup";

describe("bulkUploadCleanup", () => {
  it("cleans stale duplicate jobs that were never persisted", () => {
    const cleanupIds = getBulkDuplicateCleanupIds({
      existingJobs: [
        { id: "job-done-unsaved", status: "done" },
        { id: "job-out-of-quota", status: "out_of_quota" },
        { id: "job-failed", status: "failed" },
        { id: "job-needs-review", status: "needs_review" },
        { id: "job-cancelled", status: "cancelled" },
        { id: "job-processing", status: "processing" },
        { id: "job-queued", status: "queued" },
      ],
      persistedJobIds: new Set(["job-done-saved"]),
    });

    expect(cleanupIds).toEqual([
      "job-done-unsaved",
      "job-out-of-quota",
      "job-failed",
      "job-needs-review",
      "job-cancelled",
    ]);
  });

  it("preserves jobs already saved into trips", () => {
    const cleanupIds = getBulkDuplicateCleanupIds({
      existingJobs: [
        { id: "job-done-saved", status: "done" },
        { id: "job-out-of-quota-saved", status: "out_of_quota" },
      ],
      persistedJobIds: new Set(["job-done-saved", "job-out-of-quota-saved"]),
    });

    expect(cleanupIds).toEqual([]);
  });

  it("removes unsaved session jobs when closing the modal", () => {
    const cleanupIds = getBulkSessionCleanupIds({
      jobIds: ["job-1", "job-2", "job-3", "job-2"],
      savedByJobId: {
        "job-2": true,
      },
    });

    expect(cleanupIds).toEqual(["job-1", "job-3"]);
  });
});
