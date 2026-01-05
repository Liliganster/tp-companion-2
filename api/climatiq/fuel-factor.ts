import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

const ESTIMATE_URL = "https://api.climatiq.io/data/v1/estimate";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_DATA_VERSION = "^21";

// Diesel: EU region with volume (liters)
// Gasoline: AT region with distance (km)
const FUEL_CONFIG: Record<FuelType, {
  activityId: string;
  region: string;
  paramType: "volume" | "distance";
  fallbackValue: number;
  unit: string;
}> = {
  gasoline: {
    activityId: "passenger_vehicle-vehicle_type_car-fuel_source_gasoline-engine_size_na-vehicle_age_na-vehicle_weight_na",
    region: "AT",
    paramType: "distance",
    fallbackValue: 0.258, // UBA Austria 2022 kg CO2e/km
    unit: "kgCo2ePerKm",
  },
  diesel: {
    activityId: "fuel-type_diesel-fuel_use_na",
    region: "EU",
    paramType: "volume",
    fallbackValue: 2.68, // EU average kg CO2e/L
    unit: "kgCo2ePerLiter",
  },
};

type FuelType = "gasoline" | "diesel";
type CacheEntry = { expiresAtMs: number; payload: unknown };
type ActivitySelection = { activityId: string; region: string };
const CACHE = new Map<string, CacheEntry>();

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
  return { activityId, region: FUEL_CONFIG[fuelType].region };
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

// Use the fuel-specific config
function getActivitySelection(fuelType: FuelType): ActivitySelection {
  const config = FUEL_CONFIG[fuelType];
  return {
    activityId: config.activityId,
    region: config.region,
  };
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
  const cacheKey = `${fuelType}:${dataVersion}:v2`;
  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const apiKey = (process.env.CLIMATIQ_API_KEY || "").trim();
  const config = FUEL_CONFIG[fuelType];
  
  if (!apiKey) {
    const payload = {
      fuelType,
      ...(config.paramType === "volume" 
        ? { kgCo2ePerLiter: config.fallbackValue }
        : { kgCo2ePerKm: config.fallbackValue }
      ),
      activityId: null,
      dataVersion,
      source: "fallback",
      year: null,
      region: config.region,
      cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      method: "fallback",
      fallback: true,
    };
    setCached(cacheKey, payload);
    return sendJson(res, 200, payload);
  }

  async function estimateOnce(
    activityId: string,
    region: string | null,
    paramType: "volume" | "distance",
  ): Promise<{
    ok: boolean;
    status: number | null;
    data: any | null;
    rawText: string;
    activityId: string;
    region: string | null;
  }> {
    try {
      // Build request body - parameters depend on fuel type
      const parameters = paramType === "volume"
        ? { volume: 1, volume_unit: "l" }
        : { distance: 1, distance_unit: "km" };
      
      const requestBody: any = {
        emission_factor: {
          activity_id: activityId,
          region: region || config.region,
          data_version: dataVersion,
        },
        parameters,
      };

      const upstream = await fetch(ESTIMATE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const { data, rawText } = await readJsonResponse(upstream);
      return { ok: upstream.ok, status: upstream.status, data, rawText, activityId, region };
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Network error";
      return { ok: false, status: null, data: null, rawText: msg, activityId, region };
    }
  }

  let selection = getEnvActivitySelection(fuelType) ?? getActivitySelection(fuelType);

  // Use the fuel-specific config
  let attempt = await estimateOnce(selection.activityId, config.region, config.paramType);

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

  const factorRegion = normalizeFactorRegion(data?.emission_factor?.region) || config.region;
  
  // Build response with fuel-type specific field
  const emissionValue = Math.round(co2eKg * 1_000_000) / 1_000_000;
  const parameters = config.paramType === "volume"
    ? { volume: 1, volume_unit: "l" }
    : { distance: 1, distance_unit: "km" };
  
  const payload = {
    fuelType,
    ...(config.paramType === "volume" 
      ? { kgCo2ePerLiter: emissionValue }
      : { kgCo2ePerKm: emissionValue }
    ),
    activityId: selection.activityId,
    dataVersion,
    source: data?.emission_factor?.source ?? "climatiq",
    year: data?.emission_factor?.year ?? null,
    region: factorRegion,
    cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
    method: "data",
    fallback: false,
    request: {
      emission_factor: {
        activity_id: attempt.activityId,
        region: attempt.region || config.region,
      },
      parameters,
    },
    upstream: {
      ok: attempt.ok,
      status: attempt.status,
      data,
      rawText: attempt.rawText,
    },
  };

  setCached(cacheKey, payload);
  return sendJson(res, 200, payload);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Unexpected error";
    return sendJson(res, 500, { error: "internal_error", message });
  }
}
