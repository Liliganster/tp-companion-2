import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  extract: vi.fn(),
  rateLimit: vi.fn(async () => false),
}));
vi.mock("../../src/lib/supabaseServer.js", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./observability.js", () => ({
  withApiObservability: (handler: (...args: any[]) => unknown) => (req: unknown, res: unknown) => handler(req, res, {
    requestId: "test", log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  }),
  captureServerException: vi.fn(),
}));
vi.mock("./rateLimit.js", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("./aiQuota.js", () => ({ checkAiMonthlyQuota: vi.fn() }));
vi.mock("./entitlements.js", () => ({ getServerPlanTier: vi.fn() }));
vi.mock("./callsheetExtraction.js", () => ({ extractCallsheet: mocks.extract }));
vi.mock("./runtimeWatchdog.js", () => ({ startRuntimeWatchdog: () => ({ cancel: vi.fn() }) }));
import worker from "../worker";

async function request(headers: Record<string, string>, query = {}, method = "POST") {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await worker({ headers, query, method } as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CRON_SECRET", "test-only-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("worker authentication", () => {
  it.each(["production", "preview"])("rejects spoofed cron headers in %s before accessing resources", async (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    for (const method of ["GET", "POST"]) {
      const res = await request({ "x-vercel-cron": "1" }, {}, method);
      expect(res.status).toHaveBeenCalledWith(401);
    }
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("rejects incorrect secrets and query-string secrets in manual runs", async () => {
    const res = await request({ authorization: "Bearer wrong", "x-vercel-cron": "1" }, {
      manual: "1", jobId: "job", userId: "user", key: "test-only-secret",
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it("fails closed when the production secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await request({ "x-vercel-cron": "1" });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it.each(["GET", "POST"])("accepts the valid bearer secret for %s", async (method) => {
    const res = await request({ authorization: "Bearer test-only-secret" }, {}, method);
    // Stop at a mocked rate limiter; never execute AI or access storage.
    expect(mocks.rateLimit).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("still requires an owner for a valid authenticated manual job", async () => {
    const res = await request({ authorization: "Bearer test-only-secret" }, { manual: "1", jobId: "job" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
});
