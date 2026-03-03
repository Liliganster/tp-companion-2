import { describe, expect, it } from "vitest";

import { getBulkDisplayStatus, getBulkTriggerWorkerUrl, getInitialBulkJobStateById } from "./bulkUploadProcessingState";

describe("bulkUploadProcessingState", () => {
  it("promotes a single queued job to processing for the UI", () => {
    const result = getInitialBulkJobStateById({
      createdJobIds: ["job-1"],
      jobStateById: {
        "job-1": { status: "queued" },
      },
    });

    expect(result["job-1"]).toEqual({ status: "processing" });
  });

  it("keeps queued status for multi-job batches", () => {
    const result = getInitialBulkJobStateById({
      createdJobIds: ["job-1", "job-2"],
      jobStateById: {
        "job-1": { status: "queued" },
        "job-2": { status: "queued" },
      },
    });

    expect(result["job-1"]).toEqual({ status: "queued" });
    expect(result["job-2"]).toEqual({ status: "queued" });
  });

  it("targets trigger-worker directly when there is only one job", () => {
    expect(getBulkTriggerWorkerUrl(["job-1"])).toBe("/api/callsheets/trigger-worker?jobId=job-1");
    expect(getBulkTriggerWorkerUrl(["job-1", "job-2"])).toBe("/api/callsheets/trigger-worker");
  });

  it("renders a single queued job as processing in the UI", () => {
    expect(getBulkDisplayStatus({ status: "queued", totalJobs: 1 })).toBe("processing");
    expect(getBulkDisplayStatus({ status: "created", totalJobs: 1 })).toBe("processing");
    expect(getBulkDisplayStatus({ status: "queued", totalJobs: 2 })).toBe("queued");
  });
});
