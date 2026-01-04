import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

const BASE_URL = "https://api.climatiq.io/data/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DATA_VERSION = "^21";
const VOLUME_L = 1;

type FuelType = "gasoline" | "diesel";
type CacheEntry = { expiresAtMs: number; payload: unknown };
const CACHE = new Map<string, CacheEntry>();
const ACTIVITY_ID_CACHE = new Map<FuelType, string>();

function normalizeFuelType(input: unknown): FuelType | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  if (v === "gasoline" || v === "petrol") return "gasoline";
  if (v === "diesel") return "diesel";
  return null;
}

function getActivityId(fuelType: FuelType): string {
  const fromEnv = fuelType === "gasoline" ? process.env.CLIMATIQ_ACTIVITY_ID_GASOLINE : process.env.CLIMATIQ_ACTIVITY_ID_DIESEL;
  const trimmed = typeof fromEnv === "string" ? fromEnv.trim() : "";
  if (trimmed) return trimmed;

  const cached = ACTIVITY_ID_CACHE.get(fuelType);
  if (cached) return cached;

  // Defaults - will be replaced if search finds better matches
  return fuelType === "gasoline" ? "fuel_type_motor_gasoline-fuel_use_na" : "fuel_type_diesel-fuel_use_na";
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

async function searchFuelActivityId(params: {
  apiKey: string;
  dataVersion: string;
  fuelType: FuelType;
}): Promise<string | null> {
  // Narrow down to volume-based fuel combustion factors.
  const query = params.fuelType === "gasoline" ? "fuel-type_motor_gasoline fuel_use" : "fuel-type_diesel fuel_use";

  const url = new URL(`${BASE_URL}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("data_version", params.dataVersion);
  url.searchParams.set("results_per_page", "20");
  url.searchParams.set("unit_type", "Volume");
  url.searchParams.set("source_lca_activity", "fuel_combustion");
  url.searchParams.set("region", "AT");

  const upstream = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      accept: "application/json",
    },
  });

  const { data } = await readJsonResponse(upstream);
  if (!upstream.ok || !data) return null;

  const results = Array.isArray(data?.results) ? data.results : [];
  for (const r of results) {
    const activityId = typeof r?.activity_id === "string" ? r.activity_id.trim() : "";
    const unitType = typeof r?.unit_type === "string" ? r.unit_type.trim().toLowerCase() : "";
    const unit = typeof r?.unit === "string" ? r.unit.trim().toLowerCase() : "";
    const region = typeof r?.region === "string" ? r.region.trim().toUpperCase() : "";
    
    if (!activityId) continue;
    if (unitType && unitType !== "volume") continue;
    if (unit && unit !== "l") continue;
    // Only accept AT region or global factors
    if (region && region !== "AT" && region !== "GLOBAL") continue;
    
    return activityId;
  }

  // If no AT-specific result found, look for first AT or GLOBAL result
  const first = results.find((r: any) => {
    const region = typeof r?.region === "string" ? r.region.trim().toUpperCase() : "";
    return region === "AT" || region === "GLOBAL" || !region;
  });
  const fallback = typeof first?.activity_id === "string" ? first.activity_id.trim() : "";
  return fallback || null;
}

export default async function handler(req: any, res: any) {
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

  // Force cache refresh by checking with AT suffix
  const cacheKey = `${fuelType}-AT`;
  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const apiKey = process.env.CLIMATIQ_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing CLIMATIQ_API_KEY" });

  const dataVersion = (process.env.CLIMATIQ_DATA_VERSION || DEFAULT_DATA_VERSION).trim() || DEFAULT_DATA_VERSION;

  async function estimateOnce(activityId: string) {
    const upstream = await fetch(`${BASE_URL}/estimate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        emission_factor: {
          activity_id: activityId,
          data_version: dataVersion,
          region: "AT",
        },
        parameters: {
          volume: VOLUME_L,
          volume_unit: "l",
        },
      }),
    });

    const { data, rawText } = await readJsonResponse(upstream);
    return { upstream, data, rawText, activityId };
  }

  const initialActivityId = getActivityId(fuelType);
  let attempt = await estimateOnce(initialActivityId);

  if (!attempt.upstream.ok || !attempt.data) {
    const discovered = await searchFuelActivityId({ apiKey, dataVersion, fuelType });
    if (discovered && discovered !== initialActivityId) {
      attempt = await estimateOnce(discovered);
      if (attempt.upstream.ok && attempt.data) {
        ACTIVITY_ID_CACHE.set(fuelType, discovered);
      }
    }
  }

  const data: any = attempt.data;
  if (!attempt.upstream.ok || !data) {
    const msg =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : "";
    return sendJson(res, 502, {
      error: "climatiq_error",
      message: msg || "Failed to contact Climatiq",
      upstreamStatus: attempt.upstream.status,
      dataVersion,
      activityId: attempt.activityId,
    });
  }

  const co2e = Number(data?.co2e);
  const unit = typeof data?.co2e_unit === "string" ? data.co2e_unit : "kg";
  const co2eKg = Number.isFinite(co2e) ? co2eToKg(co2e, unit) : null;
  if (!Number.isFinite(co2e) || co2e <= 0 || co2eKg == null || !Number.isFinite(co2eKg) || co2eKg <= 0) {
    return sendJson(res, 502, { error: "climatiq_error", message: "Invalid co2e payload" });
  }

  const payload = {
    fuelType,
    kgCo2ePerLiter: Math.round((co2eKg / VOLUME_L) * 1_000_000) / 1_000_000,
    activityId: attempt.activityId,
    dataVersion,
    source: data?.emission_factor?.source ?? "climatiq",
    year: data?.emission_factor?.year ?? null,
    region: data?.emission_factor?.region ?? null,
    cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
  };

  setCached(cacheKey, payload);
  return sendJson(res, 200, payload);
}
