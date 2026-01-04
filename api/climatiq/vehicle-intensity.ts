import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

const BASE_URL = "https://api.climatiq.io";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DATA_VERSION = "^0";
const DISTANCE_KM = 100;

type FuelType = "gasoline" | "diesel";
type CacheEntry = { expiresAtMs: number; payload: unknown };
const CACHE = new Map<string, CacheEntry>();

function normalizeFuelType(input: unknown): FuelType | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  if (v === "gasoline" || v === "petrol") return "gasoline";
  if (v === "diesel") return "diesel";
  return null;
}

function normalizeRegion(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const r = input.trim().toUpperCase();
  if (!r) return null;
  if (r.length > 8) return null;
  if (!/^[A-Z]{2,3}$/.test(r)) return null;
  return r;
}

function getActivityId(fuelType: FuelType): string {
  const fromEnv =
    fuelType === "gasoline"
      ? process.env.CLIMATIQ_ACTIVITY_ID_GASOLINE
      : process.env.CLIMATIQ_ACTIVITY_ID_DIESEL;
  const trimmed = typeof fromEnv === "string" ? fromEnv.trim() : "";
  if (trimmed) return trimmed;

  // Defaults based on Climatiq public examples (car distance factors).
  return fuelType === "gasoline"
    ? "passenger_vehicle-vehicle_type_car-fuel_source_petrol-distance_na-engine_size_na-vehicle_age_na-vehicle_weight_na"
    : "passenger_vehicle-vehicle_type_car-fuel_source_diesel-distance_na-engine_size_na-vehicle_age_na-vehicle_weight_na";
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
    name: "climatiq_vehicle_intensity",
    identifier: user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!allowed) return;

  const fuelType = normalizeFuelType(req.query?.fuelType ?? req.query?.fuel);
  if (!fuelType) return sendJson(res, 400, { error: "invalid_fuel_type" });

  const region = normalizeRegion(req.query?.region);
  const cacheKey = `${fuelType}:${region ?? "default"}`;
  const cached = getCached(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const apiKey = process.env.CLIMATIQ_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing CLIMATIQ_API_KEY" });

  const activityId = getActivityId(fuelType);
  const dataVersion = (process.env.CLIMATIQ_DATA_VERSION || DEFAULT_DATA_VERSION).trim() || DEFAULT_DATA_VERSION;

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
      },
      parameters: {
        distance: DISTANCE_KM,
        distance_unit: "km",
      },
    }),
  });

  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok || !data) {
    const msg = typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : "";
    return sendJson(res, 502, { error: "climatiq_error", message: msg || "Failed to contact Climatiq" });
  }

  const co2e = Number(data?.co2e);
  const unit = typeof data?.co2e_unit === "string" ? data.co2e_unit : "kg";
  const co2eKg = Number.isFinite(co2e) ? co2eToKg(co2e, unit) : null;
  if (!Number.isFinite(co2e) || co2e <= 0 || co2eKg == null || !Number.isFinite(co2eKg) || co2eKg <= 0) {
    return sendJson(res, 502, { error: "climatiq_error", message: "Invalid co2e payload" });
  }

  const kgCo2ePerKm = co2eKg / DISTANCE_KM;
  const payload = {
    fuelType,
    region: (data?.emission_factor?.region ?? region ?? null) as any,
    kgCo2ePerKm: Math.round(kgCo2ePerKm * 1_000_000) / 1_000_000,
    activityId,
    dataVersion,
    source: data?.emission_factor?.source ?? "climatiq",
    year: data?.emission_factor?.year ?? null,
    cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
  };

  setCached(cacheKey, payload);
  return sendJson(res, 200, payload);
}

