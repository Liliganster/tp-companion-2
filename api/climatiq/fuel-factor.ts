import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

const BASE_URL = "https://api.climatiq.io/data/v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_DATA_VERSION = "^21";
const DEFAULT_REGION = "AT";
const VOLUME_L = 1;
const FALLBACK_KG_CO2E_PER_LITER: Record<FuelType, number> = {
  gasoline: 2.31,
  diesel: 2.68,
};

type FuelType = "gasoline" | "diesel";
type CacheEntry = { expiresAtMs: number; payload: unknown };
type ActivitySelection = { activityId: string; region: string | null };
const CACHE = new Map<string, CacheEntry>();
const ACTIVITY_SELECTION_CACHE = new Map<FuelType, ActivitySelection>();

function normalizeFuelType(input: unknown): FuelType | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  if (v === "gasoline" || v === "petrol") return "gasoline";
  if (v === "diesel") return "diesel";
  return null;
}

function getEnvActivitySelection(fuelType: FuelType): ActivitySelection | null {
  const fromEnv = fuelType === "gasoline" ? process.env.CLIMATIQ_ACTIVITY_ID_GASOLINE : process.env.CLIMATIQ_ACTIVITY_ID_DIESEL;
  const activityId = typeof fromEnv === "string" ? fromEnv.trim() : "";
  if (!activityId) return null;
  return { activityId, region: DEFAULT_REGION };
}

function isLiterUnit(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const unit = value.trim().toLowerCase();
  return unit === "l" || unit === "liter" || unit === "litre" || unit === "liters" || unit === "litres";
}

function normalizeFactorRegion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const region = value.trim().toUpperCase();
  if (!region) return null;
  // Climatiq uses "NA" (and sometimes "N/A") to mean "Not Applicable" (no region specificity).
  if (region === "NA" || region === "N/A") return null;
  return region;
}

function getCached(key: string): unknown | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAtMs) {
    CACHE.delete(key);
    return null;
  }
  return entry.payload;
}

function setCached(key: string, payload: unknown) {
  CACHE.set(key, { expiresAtMs: Date.now() + CACHE_TTL_MS, payload });
}

function co2eToKg(value: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "kg") return value;
  if (u === "g") return value / 1000;
  if (u === "t" || u === "tonne" || u === "tonnes") return value * 1000;
  return null;
}

async function readJsonResponse(upstream: Response): Promise<{ data: any | null; rawText: string }> {
  const rawText = await upstream.text().catch(() => "");
  if (!rawText) return { data: null, rawText: "" };
  try {
    return { data: JSON.parse(rawText), rawText };
  } catch {
    return { data: null, rawText };
  }
}

async function searchFuelActivitySelection(params: {
  apiKey: string;
  dataVersion: string;
  fuelType: FuelType;
}): Promise<ActivitySelection | null> {
  // Search for fuel combustion factors with volume unit
  const query = params.fuelType === "gasoline" ? "fuel_type_gasoline fuel_use" : "fuel_type_diesel fuel_use";

  const url = new URL(`${BASE_URL}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("data_version", params.dataVersion);
  url.searchParams.set("results_per_page", "100");
  url.searchParams.set("unit_type", "Volume");

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        accept: "application/json",
      },
    });
  } catch {
    return null;
  }

  const { data } = await readJsonResponse(upstream);
  if (!upstream.ok || !data) return null;

  const results = Array.isArray(data?.results) ? data.results : [];

  // Priority 1: AT region with liter unit
  for (const r of results) {
    const activityId = typeof r?.activity_id === "string" ? r.activity_id.trim() : "";
    const region = normalizeFactorRegion(r?.region);
    const unitOk = isLiterUnit(r?.unit);

    if (activityId && region === DEFAULT_REGION && unitOk) {
      return { activityId, region: DEFAULT_REGION };
    }
  }

  // Priority 2: EU region with liter unit
  for (const r of results) {
    const activityId = typeof r?.activity_id === "string" ? r.activity_id.trim() : "";
    const region = normalizeFactorRegion(r?.region);
    const unitOk = isLiterUnit(r?.unit);

    if (activityId && region === "EU" && unitOk) {
      return { activityId, region: "EU" };
    }
  }

  // Priority 3: Not-applicable/unspecified region with liter unit
  for (const r of results) {
    const activityId = typeof r?.activity_id === "string" ? r.activity_id.trim() : "";
    const region = normalizeFactorRegion(r?.region);
    const unitOk = isLiterUnit(r?.unit);

    if (activityId && region == null && unitOk) {
      return { activityId, region: null };
    }
  }

  // Fallback: first factor with liter unit (better than giving up)
  for (const r of results) {
    const activityId = typeof r?.activity_id === "string" ? r.activity_id.trim() : "";
    const region = normalizeFactorRegion(r?.region);
    const unitOk = isLiterUnit(r?.unit);
    if (activityId && unitOk) return { activityId, region };
  }

  return null;
}

export default async function handler(req: any, res: any) {
  try {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({
    req,
    res,
    name: "climatiq_fuel_factor",
    identifier: user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!allowed) return;

  const fuelType = normalizeFuelType(req.query?.fuelType ?? req.query?.fuel);
  if (!fuelType) return sendJson(res, 400, { error: "invalid_fuel_type" });

  const dataVersion = (process.env.CLIMATIQ_DATA_VERSION || DEFAULT_DATA_VERSION).trim() || DEFAULT_DATA_VERSION;
  const cacheKey = `${fuelType}:${dataVersion}`;
  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const apiKey = (process.env.CLIMATIQ_API_KEY || "").trim();
  if (!apiKey) {
    const payload = {
      fuelType,
      kgCo2ePerLiter: FALLBACK_KG_CO2E_PER_LITER[fuelType],
      activityId: null,
      dataVersion,
      source: "fallback",
      year: null,
      region: DEFAULT_REGION,
      cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      fallback: true,
    };
    setCached(cacheKey, payload);
    return sendJson(res, 200, payload);
  }

  async function estimateOnce(
    activityId: string,
    region: string | null,
  ): Promise<{ ok: boolean; status: number | null; data: any | null; rawText: string; activityId: string }> {
    try {
      const emissionFactor: any = {
        activity_id: activityId,
        data_version: dataVersion,
      };
      if (region) emissionFactor.region = region;

      const upstream = await fetch(`${BASE_URL}/estimate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          emission_factor: {
            ...emissionFactor,
          },
          parameters: {
            volume: VOLUME_L,
            volume_unit: "l",
          },
        }),
      });

      const { data, rawText } = await readJsonResponse(upstream);
      return { ok: upstream.ok, status: upstream.status, data, rawText, activityId };
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Network error";
      return { ok: false, status: null, data: null, rawText: msg, activityId };
    }
  }

  let selection = getEnvActivitySelection(fuelType) ?? ACTIVITY_SELECTION_CACHE.get(fuelType) ?? null;
  if (!selection) {
    selection = await searchFuelActivitySelection({ apiKey, dataVersion, fuelType });
    if (selection) ACTIVITY_SELECTION_CACHE.set(fuelType, selection);
  }

  if (!selection) {
    const payload = {
      fuelType,
      kgCo2ePerLiter: FALLBACK_KG_CO2E_PER_LITER[fuelType],
      activityId: null,
      dataVersion,
      source: "fallback",
      year: null,
      region: DEFAULT_REGION,
      cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      fallback: true,
    };
    setCached(cacheKey, payload);
    return sendJson(res, 200, payload);
  }

  // Always prefer Austria (AT). If no AT-specific factor exists, fall back to the selector region, then to no-region.
  let attempt = await estimateOnce(selection.activityId, DEFAULT_REGION);
  if ((!attempt.ok || !attempt.data) && selection.region && selection.region !== DEFAULT_REGION) {
    attempt = await estimateOnce(selection.activityId, selection.region);
  }
  if (!attempt.ok || !attempt.data) {
    attempt = await estimateOnce(selection.activityId, null);
  }

  if (!attempt.ok || !attempt.data) {
    // If env/cached activity_id is stale, attempt to rediscover.
    const discovered = await searchFuelActivitySelection({ apiKey, dataVersion, fuelType });
    if (discovered && discovered.activityId !== selection.activityId) {
      selection = discovered;
      ACTIVITY_SELECTION_CACHE.set(fuelType, selection);
      attempt = await estimateOnce(selection.activityId, DEFAULT_REGION);
      if ((!attempt.ok || !attempt.data) && selection.region && selection.region !== DEFAULT_REGION) {
        attempt = await estimateOnce(selection.activityId, selection.region);
      }
      if (!attempt.ok || !attempt.data) {
        attempt = await estimateOnce(selection.activityId, null);
      }
    }
  }

  const data: any = attempt.data;
  if (!attempt.ok || !data) {
    const msg =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : "";
    return sendJson(res, 502, {
      error: "climatiq_error",
      message: msg || "Failed to contact Climatiq",
      upstreamStatus: attempt.status,
      dataVersion,
      activityId: selection.activityId,
    });
  }

  const co2e = Number(data?.co2e);
  const unit = typeof data?.co2e_unit === "string" ? data.co2e_unit : "kg";
  const co2eKg = Number.isFinite(co2e) ? co2eToKg(co2e, unit) : null;
  if (!Number.isFinite(co2e) || co2e <= 0 || co2eKg == null || !Number.isFinite(co2eKg) || co2eKg <= 0) {
    return sendJson(res, 502, { error: "climatiq_error", message: "Invalid co2e payload" });
  }

  const factorRegion = normalizeFactorRegion(data?.emission_factor?.region);
  const payload = {
    fuelType,
    kgCo2ePerLiter: Math.round((co2eKg / VOLUME_L) * 1_000_000) / 1_000_000,
    activityId: selection.activityId,
    dataVersion,
    source: data?.emission_factor?.source ?? "climatiq",
    year: data?.emission_factor?.year ?? null,
    region: factorRegion ?? DEFAULT_REGION,
    cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
  };

  setCached(cacheKey, payload);
  return sendJson(res, 200, payload);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Unexpected error";
    return sendJson(res, 500, { error: "internal_error", message });
  }
}
