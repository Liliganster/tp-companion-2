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
          emission_factor: { activity_id: "passenger_vehicle-vehicle_type_car-fuel_source_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na" },
          parameters: { distance: 1, distance_unit: "km" },
        });
        return new Response(
          JSON.stringify({
            co2e: 0.2487,
            co2e_unit: "kg",
            emission_factor: { region: "AT", source: "UBA Austria", year: 2022 },
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
      kgCo2ePerKm: 0.2487,
      activityId: "passenger_vehicle-vehicle_type_car-fuel_source_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na",
      dataVersion: process.env.CLIMATIQ_DATA_VERSION,
      region: "AT",
      source: "UBA Austria",
      year: 2022,
      method: "data",
    });
    expect(payload?.upstream?.data?.co2e).toBe(0.2487);
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
      kgCo2ePerKm: 0.258,
      fallback: true,
    });
  });
});
