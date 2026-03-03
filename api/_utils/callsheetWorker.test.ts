import { describe, expect, it } from "vitest";

import { getPlanLimits as getClientPlanLimits } from "../../src/lib/plans.js";
import {
  CALLSHEET_PARALLEL_BATCH_SIZE,
  getCallsheetWorkerFetchLimit,
  limitCallsheetJobsByPlan,
  runWithConcurrencyLimit,
  shouldSelfTriggerCallsheetBatch,
} from "./callsheetWorker.js";
import { getPlanLimits as getServerPlanLimits } from "./plans.js";

describe("callsheetWorker", () => {
  it("keeps client and server Pro limits aligned at 20 uploads and 5 parallel jobs", () => {
    const clientLimits = getClientPlanLimits("pro");
    const serverLimits = getServerPlanLimits("pro");

    expect(clientLimits.maxCallsheetsPerBatch).toBe(20);
    expect(clientLimits.maxCallsheetsPerWorkerRun).toBe(5);
    expect(serverLimits.maxCallsheetsPerBatch).toBe(20);
    expect(serverLimits.maxCallsheetsPerWorkerRun).toBe(5);
    expect(serverLimits.maxCallsheetsPerBatch).toBe(clientLimits.maxCallsheetsPerBatch);
    expect(serverLimits.maxCallsheetsPerWorkerRun).toBe(clientLimits.maxCallsheetsPerWorkerRun);
    expect(CALLSHEET_PARALLEL_BATCH_SIZE).toBe(5);
  });

  it("uses 5 jobs for manual batches and 1 for manual single-job runs", () => {
    expect(getCallsheetWorkerFetchLimit({ manual: false })).toBe(16);
    expect(getCallsheetWorkerFetchLimit({ manual: true, manualJobId: null })).toBe(5);
    expect(getCallsheetWorkerFetchLimit({ manual: true, manualJobId: "job-1" })).toBe(1);
  });

  it("limits jobs per user based on plan tier", () => {
    const jobs = [
      { id: "basic-1", user_id: "basic-user" },
      { id: "basic-2", user_id: "basic-user" },
      { id: "pro-1", user_id: "pro-user" },
      { id: "pro-2", user_id: "pro-user" },
      { id: "pro-3", user_id: "pro-user" },
      { id: "pro-4", user_id: "pro-user" },
      { id: "pro-5", user_id: "pro-user" },
      { id: "pro-6", user_id: "pro-user" },
    ];

    const limited = limitCallsheetJobsByPlan({
      jobs,
      planTierByUserId: new Map([
        ["basic-user", "basic"],
        ["pro-user", "pro"],
      ]),
    });

    expect(limited.map((job) => job.id)).toEqual([
      "basic-1",
      "pro-1",
      "pro-2",
      "pro-3",
      "pro-4",
      "pro-5",
    ]);
  });

  it("only self-triggers follow-up batches when it is safe to continue", () => {
    expect(shouldSelfTriggerCallsheetBatch({ manual: false })).toBe(true);
    expect(
      shouldSelfTriggerCallsheetBatch({ manual: true, manualJobId: null, manualUserId: "user-1" }),
    ).toBe(true);
    expect(
      shouldSelfTriggerCallsheetBatch({ manual: true, manualJobId: "job-1", manualUserId: "user-1" }),
    ).toBe(false);
    expect(
      shouldSelfTriggerCallsheetBatch({ manual: true, manualJobId: null, manualUserId: null }),
    ).toBe(false);
  });

  it("never exceeds the configured parallelism", async () => {
    let active = 0;
    let maxActive = 0;
    const processed: number[] = [];

    await runWithConcurrencyLimit({
      items: [1, 2, 3, 4, 5, 6, 7],
      concurrency: 3,
      worker: async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        processed.push(item);
        active -= 1;
      },
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(processed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
