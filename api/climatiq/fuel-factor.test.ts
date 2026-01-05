import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_utils/supabase.js", () => {
  return {
    requireSupabaseUser: vi.fn(async () => ({ id: "user_1" })),
    sendJson: (res: any, statusCode: number, payload: unknown) => {
      res.statusCode = statusCode;
      res.setHeader?.("Content-Type", "application/json");
      res.end?.(JSON.stringify(payload));
      return res;
    },
  };
});

vi.mock("../_utils/rateLimit.js", () => {
  return {
    enforceRateLimit: vi.fn(async () => true),
  };
});

function makeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    headers,
    body: "",
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    end: (body?: string) => {
      if (typeof body === "string") res.body = body;
    },
  };
  return res;
}

describe("/api/climatiq/fuel-factor", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.CLIMATIQ_ACTIVITY_ID_GASOLINE;
    delete process.env.CLIMATIQ_ACTIVITY_ID_DIESEL;
    process.env.CLIMATIQ_API_KEY = "test_key";
    process.env.CLIMATIQ_DATA_VERSION = `test_${Date.now()}`;
  });

  it("returns factor via Climatiq Data API (diesel)", async () => {
    const fetchMock = vi.fn(async (url: any, init?: any) => {
      const u = String(url);

      if (u === "https://api.climatiq.io/data/v1/estimate") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body).toMatchObject({
          emission_factor: { activity_id: "fuel-type_diesel-fuel_use_na" },
          parameters: { fuel: 1, fuel_unit: "l" },
        });
        return new Response(
          JSON.stringify({
            co2e: 2.68,
            co2e_unit: "kg",
            emission_factor: { region: "EU", source: "BEIS", year: 2023 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch url: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = (await import("./fuel-factor")).default;
    const req: any = { method: "GET", query: { fuelType: "diesel" }, headers: {}, socket: { remoteAddress: "1.2.3.4" } };
    const res: any = makeRes();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload).toMatchObject({
      fuelType: "diesel",
      kgCo2ePerLiter: 2.68,
      activityId: "fuel-type_diesel-fuel_use_na",
      dataVersion: process.env.CLIMATIQ_DATA_VERSION,
      region: "EU",
      source: "BEIS",
      year: 2023,
      method: "data",
    });
    expect(payload?.upstream?.data?.co2e).toBe(2.68);
  });

  it("returns fallback factor when CLIMATIQ_API_KEY is missing", async () => {
    process.env.CLIMATIQ_API_KEY = "";
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch should not be called");
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = (await import("./fuel-factor")).default;
    const req: any = { method: "GET", query: { fuelType: "gasoline" }, headers: {}, socket: { remoteAddress: "1.2.3.4" } };
    const res: any = makeRes();

    await handler(req, res);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload).toMatchObject({
      fuelType: "gasoline",
      kgCo2ePerLiter: 2.31, // Gasoline now uses volume-based calculation too
      fallback: true,
    });
  });
});
