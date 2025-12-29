import { describe, it, expect } from "vitest";
import { enforceRateLimit } from "./rateLimit";

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    headers,
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    end: (_body?: string) => {},
  };
}

describe("enforceRateLimit (memory fallback)", () => {
  it("returns 429 when over limit", async () => {
    const req: any = { headers: {}, socket: { remoteAddress: "1.2.3.4" } };
    const res1: any = makeRes();
    const res2: any = makeRes();
    const name = `test_${Date.now()}`;

    const ok1 = await enforceRateLimit({ req, res: res1, name, limit: 1, windowMs: 60_000 });
    const ok2 = await enforceRateLimit({ req, res: res2, name, limit: 1, windowMs: 60_000 });

    expect(ok1).toBe(true);
    expect(ok2).toBe(false);
    expect(res2.statusCode).toBe(429);
    expect(res2.headers["retry-after"]).toBeDefined();
  });
});

