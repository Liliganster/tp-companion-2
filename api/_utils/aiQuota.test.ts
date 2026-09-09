import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), identity: vi.fn(), ownership: vi.fn(), plan: vi.fn(),
}));
vi.mock("../../src/lib/supabaseServer.js", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("./freeUsage.js", () => ({ getFreeIdentityHash: mocks.identity }));
vi.mock("./entitlements.js", () => ({ getServerPlanTier: mocks.plan }));
vi.mock("./storageOwnership.js", () => ({ assertStorageOwnership: mocks.ownership }));
import { checkAiMonthlyQuota, reserveAiQuota, finishAiQuota } from "./aiQuota";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue("stable-identity");
  mocks.plan.mockResolvedValue("basic");
  mocks.ownership.mockResolvedValue(undefined);
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), single: vi.fn().mockResolvedValue({ data: { storage_path: "user/file.pdf" }, error: null }) };
  mocks.from.mockReturnValue(chain);
});
describe("atomic quota bridge", () => {
  it("fails closed when quota lookup fails instead of returning zero usage", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("database unavailable"), data: null });
    await expect(checkAiMonthlyQuota("user")).rejects.toThrow("ai_quota_unavailable");
  });
  it("requires a stable identity for Free usage", async () => {
    mocks.identity.mockResolvedValue(null);
    await expect(checkAiMonthlyQuota("user")).rejects.toThrow("ai_quota_unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reserves atomically with the server plan and verifies file ownership first", async () => {
    mocks.rpc.mockResolvedValue({ data: { allowed: true, requestId: "request", storagePath: "user/file.pdf" }, error: null });
    const r = await reserveAiQuota("user", "job");
    expect(mocks.ownership).toHaveBeenCalledWith("user", "callsheets", "user/file.pdf");
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_ai_quota", expect.objectContaining({
      p_user_id: "user", p_job_id: "job", p_limit: 3, p_identity_hash: "stable-identity", p_new_request_id: null,
    }));
    expect(r.attemptId).toBeTruthy();
  });
  it("passes a new user request but not a new internal request on technical retry", async () => {
    mocks.rpc.mockResolvedValue({ data: { allowed: true, requestId: "request" }, error: null });
    await reserveAiQuota("user", "job", "pro", "manual-request");
    await reserveAiQuota("user", "job", "pro");
    expect(mocks.rpc.mock.calls[0][1].p_new_request_id).toBe("manual-request");
    expect(mocks.rpc.mock.calls[1][1].p_new_request_id).toBeNull();
    expect(mocks.rpc.mock.calls[0][1].p_limit).toBe(60);
  });
  it("never reserves for an unverified storage object", async () => {
    mocks.ownership.mockRejectedValue(new Error("storage_ownership_not_verified"));
    await expect(reserveAiQuota("user", "job")).rejects.toThrow("storage_ownership_not_verified");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the same reservation for completion and release", async () => {
    const reservation = { allowed: true, requestId: "request", userId: "user", jobId: "job", attemptId: "attempt" };
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await finishAiQuota(reservation, true);
    await finishAiQuota(reservation, false);
    expect(mocks.rpc.mock.calls.map(([, args]) => args)).toEqual([
      { p_user_id: "user", p_job_id: "job", p_request_id: "request", p_attempt_id: "attempt", p_success: true },
      { p_user_id: "user", p_job_id: "job", p_request_id: "request", p_attempt_id: "attempt", p_success: false },
    ]);
  });
});
