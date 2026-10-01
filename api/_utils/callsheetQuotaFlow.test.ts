import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  reserve: vi.fn(), finish: vi.fn(), extract: vi.fn(), from: vi.fn(), plan: vi.fn(),
}));
vi.mock("../../src/lib/supabaseServer.js", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./observability.js", () => ({ withApiObservability: (fn: (...args: any[]) => unknown) => (req: unknown, res: unknown) => fn(req, res, { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, requestId: "trace" }) }));
vi.mock("./supabase.js", () => ({
  getBearerToken: () => null, requireSupabaseUser: async () => ({ id: "user" }),
  sendJson: (res: { statusCode: number; body: unknown }, code: number, body: unknown) => { res.statusCode = code; res.body = body; },
}));
vi.mock("./rateLimit.js", () => ({ enforceRateLimit: async () => true }));
vi.mock("./entitlements.js", () => ({ getServerPlanTier: mocks.plan }));
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
  mocks.plan.mockResolvedValue("pro");
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), update: vi.fn(() => chain), maybeSingle: vi.fn().mockResolvedValue({ data: {} }) };
  mocks.from.mockReturnValue(chain);
  mocks.reserve.mockResolvedValue({ allowed: true, requestId: "request", userId: "user", jobId: "job", attemptId: "attempt", storagePath: "user/file.pdf" });
  mocks.finish.mockResolvedValue(true);
  mocks.extract.mockResolvedValue({ ok: true, cached: true });
});
describe("direct extraction quota gate", () => {
  it('records provider timeouts as technical failures and releases the reservation without charging', async () => {
    mocks.extract.mockRejectedValue(new Error('Request aborted'));
    const response = await run();
    expect(response.statusCode).toBe(504);
    expect(response.body).toMatchObject({ error: 'processing_timeout' });
    expect(mocks.from().update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), false);
    expect(mocks.finish).not.toHaveBeenCalledWith(expect.anything(), true);
    expect(mocks.from().eq).toHaveBeenCalledWith("ai_request_id", "request");
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

it('treats a completed review extraction as billable success, never a technical failure', async () => {
  mocks.extract.mockResolvedValue({ok:true,status:'needs_review',reviewReason:'Confirm year',locations:['Opera'],date:'',projectName:'Film'});
  const response=await run();
  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({status:'needs_review',reviewReason:'Confirm year'});
  expect(mocks.finish).toHaveBeenCalledWith(expect.anything(),true);
  expect(mocks.from().update).not.toHaveBeenCalled();
});

it('passes the explicit new extraction identity through quota reservation and extraction', async () => {
  const requestId = '67b90c25-381a-47e5-b145-883c9b3d5cd0';
  mocks.reserve.mockResolvedValue({ allowed: true, requestId, userId: 'user', jobId: 'job', attemptId: 'attempt', storagePath: 'user/Original.pdf' });
  const res = { statusCode: 0, body: null as unknown, setHeader: vi.fn(), end: vi.fn() };
  await handler({ method: 'POST', url: '/api/callsheets/process', query: { jobId: 'job', requestId } }, res);
  expect(mocks.reserve).toHaveBeenCalledWith('user', 'job', 'pro', requestId);
  expect(mocks.extract).toHaveBeenCalledWith(expect.objectContaining({ requestId, storagePath: 'user/Original.pdf' }));
  expect(mocks.extract).toHaveBeenCalledOnce();
});

it('blocks the fourth retry before AI and returns the manual-review reason', async () => {
  mocks.reserve.mockResolvedValue({ allowed: false, reason: 'retry_limit_exceeded', retryCount: 3 });
  const response = await run();
  expect(response.statusCode).toBe(409);
  expect(response.body).toEqual({ error: 'retry_limit_exceeded', retryCount: 3 });
  expect(response.setHeader).toHaveBeenCalledWith('X-Callsheet-Retries-Used', '3');
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(mocks.finish).not.toHaveBeenCalled();
});

it.each([
  {data:null,error:null},
  {data:{openrouter_enabled:true,openrouter_api_key:'offline'},error:{message:'database unavailable'}},
  {data:{openrouter_enabled:true,openrouter_api_key:''},error:null},
])('direct processing blocks unreadable or invalid AI settings before claiming quota', async profileResult => {
  mocks.from().maybeSingle.mockResolvedValue(profileResult);
  const res=await run();
  expect(res.statusCode).toBe(503);
  expect(res.body).toEqual({error:'ai_provider_unavailable'});
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.extract).not.toHaveBeenCalled();
});
it('direct processing passes the selected OpenRouter model to the extractor', async () => {
  mocks.from().maybeSingle.mockResolvedValue({data:{openrouter_enabled:true,openrouter_api_key:'offline',openrouter_model:'google/gemini-3.8-flash'},error:null});
  expect((await run()).statusCode).toBe(200);
  expect(mocks.extract).toHaveBeenCalledWith(expect.objectContaining({userSettings:{openrouterEnabled:true,openrouterApiKey:'offline',openrouterModel:'google/gemini-3.8-flash'}}));
});
it('direct processing never changes an OpenRouter account to Gemini after a plan downgrade', async () => {
  mocks.plan.mockResolvedValue('basic');
  mocks.from().maybeSingle.mockResolvedValue({data:{openrouter_enabled:true,openrouter_api_key:'offline'},error:null});
  expect((await run()).statusCode).toBe(503);
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.extract).not.toHaveBeenCalled();
});
