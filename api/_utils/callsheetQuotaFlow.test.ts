import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  reserve: vi.fn(), finish: vi.fn(), extract: vi.fn(), from: vi.fn(),
}));
vi.mock("../../src/lib/supabaseServer.js", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./observability.js", () => ({ withApiObservability: (fn: (...args: any[]) => unknown) => (req: unknown, res: unknown) => fn(req, res, { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, requestId: "trace" }) }));
vi.mock("./supabase.js", () => ({
  getBearerToken: () => null, requireSupabaseUser: async () => ({ id: "user" }),
  sendJson: (res: { statusCode: number; body: unknown }, code: number, body: unknown) => { res.statusCode = code; res.body = body; },
}));
vi.mock("./rateLimit.js", () => ({ enforceRateLimit: async () => true }));
vi.mock("./entitlements.js", () => ({ getServerPlanTier: async () => "pro" }));
vi.mock("./aiQuota.js", () => ({
  reserveAiQuota: mocks.reserve, finishAiQuota: mocks.finish,
  AiQuotaUnavailableError: class extends Error {},
}));
vi.mock("./callsheetExtraction.js", () => ({ extractCallsheet: mocks.extract }));
import handler from "../callsheets";
const run = async () => {
  const res = { statusCode: 0, body: null as unknown, setHeader: vi.fn(), end: vi.fn() };
  await handler({ method: "POST", url: "/api/callsheets/process", query: { jobId: "job" } }, res);
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), update: vi.fn(() => chain), maybeSingle: vi.fn().mockResolvedValue({ data: {} }) };
  mocks.from.mockReturnValue(chain);
  mocks.reserve.mockResolvedValue({ allowed: true, requestId: "request", userId: "user", jobId: "job", attemptId: "attempt", storagePath: "user/file.pdf" });
  mocks.finish.mockResolvedValue(true);
  mocks.extract.mockResolvedValue({ ok: true, cached: true });
});
describe("direct extraction quota gate", () => {
  it('records provider timeouts for review and releases the reservation without charging', async () => {
    mocks.extract.mockRejectedValue(new Error('Request aborted'));
    const response = await run();
    expect(response.statusCode).toBe(504);
    expect(response.body).toMatchObject({ error: 'processing_timeout' });
    expect(mocks.from().update).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_review' }));
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), false);
    expect(mocks.finish).not.toHaveBeenCalledWith(expect.anything(), true);
    expect(mocks.extract).toHaveBeenCalledOnce();
  });
  it("does not call AI or delete documents when quota is exhausted", async () => {
    mocks.reserve.mockResolvedValue({ allowed: false, reason: "monthly_quota_exceeded" });
    expect((await run()).statusCode).toBe(402);
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("blocks a second execution of an in-flight request", async () => {
    mocks.reserve.mockResolvedValue({ allowed: false, busy: true });
    expect((await run()).statusCode).toBe(409);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("does not extract or bill again for an already completed request", async () => {
    mocks.reserve.mockResolvedValue({ allowed: false, completed: true });
    expect((await run()).statusCode).toBe(200);
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("finalizes an internally cached result through the same reservation", async () => {
    expect((await run()).statusCode).toBe(200);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ requestId: "request" }), true);
  });
  it("releases on processing failure", async () => {
    mocks.extract.mockRejectedValue(new Error("provider failed"));
    expect((await run()).statusCode).toBe(500);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ requestId: "request" }), false);
  });
});
