import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), identity: vi.fn(), ownership: vi.fn(), plan: vi.fn(),
}));
vi.mock("../../src/lib/supabaseServer.js", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("./freeUsage.js", () => ({ getFreeIdentityHash: mocks.identity }));
vi.mock('./callsheetQuotaPolicy.js', () => ({ getCallsheetQuotaPolicy: async () => {
  const planTier = await mocks.plan();
  return { planTier, limit: planTier === 'pro' ? 60 : 3, period: 'monthly', periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-10-01T00:00:00Z' };
} }));
vi.mock("./storageOwnership.js", () => ({ assertStorageOwnership: mocks.ownership }));
import { checkAiMonthlyQuota, reserveAiQuota, finishAiQuota, isAiQuotaBypassed, AI_QUOTA_BYPASS_LIMIT } from "./aiQuota";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BYPASS_AI_LIMITS', '0');
  vi.stubEnv('AI_QUOTA_BYPASS_USER_IDS', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('NODE_ENV', 'test');
  mocks.identity.mockResolvedValue("stable-identity");
  mocks.plan.mockResolvedValue("basic");
  mocks.ownership.mockResolvedValue(undefined);
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), single: vi.fn().mockResolvedValue({ data: { storage_path: "user/file.pdf" }, error: null }) };
  mocks.from.mockReturnValue(chain);
});
afterEach(() => vi.unstubAllEnvs());
describe('test quota bypass', () => {
  it('is disabled by default and a user allowlist alone cannot enable it', () => {
    vi.stubEnv('AI_QUOTA_BYPASS_USER_IDS', 'user');
    expect(isAiQuotaBypassed('user')).toBe(false);
  });
  it('supports the local bypass flag', () => {
    vi.stubEnv('BYPASS_AI_LIMITS', ' true ');
    expect(isAiQuotaBypassed('user')).toBe(true);
  });
  it.each(['production', 'preview'])('requires a matching account in Vercel %s', env => {
    vi.stubEnv('BYPASS_AI_LIMITS', '1');
    vi.stubEnv('VERCEL_ENV', env);
    expect(isAiQuotaBypassed('user')).toBe(false);
    vi.stubEnv('AI_QUOTA_BYPASS_USER_IDS', ' another-user, user ');
    expect(isAiQuotaBypassed('user')).toBe(true);
    expect(isAiQuotaBypassed('other')).toBe(false);
  });
  it('requires an allowlist in non-Vercel production too', () => {
    vi.stubEnv('BYPASS_AI_LIMITS', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(isAiQuotaBypassed('user')).toBe(false);
  });
  it('applies the same bypass to the displayed quota and atomic reservation', async () => {
    mocks.plan.mockResolvedValue('pro');
    vi.stubEnv('BYPASS_AI_LIMITS', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('AI_QUOTA_BYPASS_USER_IDS', 'user');
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: true, remaining: AI_QUOTA_BYPASS_LIMIT - 60, used: 60 }, error: null });
    const quota = await checkAiMonthlyQuota('user', 'pro');
    expect(quota).toMatchObject({ allowed: true, bypass: true, used: 60 });
    mocks.rpc.mockResolvedValue({ data: { allowed: true, requestId: 'request' }, error: null });
    const reservation = await reserveAiQuota('user', 'job', 'pro');
    expect(reservation.requestId).toBe('request');
    expect(mocks.ownership).toHaveBeenCalledWith('user', 'callsheets', 'user/file.pdf');
    expect(mocks.rpc.mock.calls.map(([, args]) => args.p_limit)).toEqual([AI_QUOTA_BYPASS_LIMIT, AI_QUOTA_BYPASS_LIMIT]);
    await reserveAiQuota('other', 'job', 'pro');
    expect(mocks.rpc.mock.calls[2][1].p_limit).toBe(60);
  });
  it('keeps the file ownership check with bypass enabled', async () => {
    vi.stubEnv('BYPASS_AI_LIMITS', '1');
    mocks.ownership.mockRejectedValue(new Error('storage_ownership_not_verified'));
    await expect(reserveAiQuota('user', 'job')).rejects.toThrow('storage_ownership_not_verified');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
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
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_ai_quota_v2", expect.objectContaining({
      p_user_id: "user", p_job_id: "job", p_limit: 3, p_identity_hash: "stable-identity", p_new_request_id: null,
    }));
    expect(r.attemptId).toBeTruthy();
  });
  it("passes a new user request but not a new internal request on technical retry", async () => {
    mocks.plan.mockResolvedValue('pro');
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
