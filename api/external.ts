/**
 * Consolidated router for /api/climatiq/* and /api/electricity-maps/* routes.
 * Handler logic is verbatim from original files.
 */

import { requireSupabaseUser, sendJson } from "./_utils/supabase.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { createClient } from "@supabase/supabase-js";

// ─── /api/climatiq/fuel-factor ───────────────────────────────────────────────
const ESTIMATE_URL = "https://api.climatiq.io/data/v1/estimate";
const DEFAULT_DATA_VERSION = "^21";

type FuelType = "gasoline" | "diesel";
type ActivitySelection = { activityId: string; region: string };

const FUEL_CONFIG: Record<FuelType, { activityId: string; lcaActivity: string; region: string | null; paramType: "volume" | "distance"; fallbackValue: number; unit: string }> = {
  // UBA Austria 2022 — LCA activity "total" (WTW = fuel_combustion + upstream)
  // Source: Climatiq Explorer, passenger_vehicle, distance unit type, 0.2472 kg CO₂e/km
  gasoline: { activityId: "passenger_vehicle-vehicle_type_car-fuel_source_gasoline_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na", lcaActivity: "total", region: "AT", paramType: "distance", fallbackValue: 0.2472, unit: "kgCo2ePerKm" },
  diesel:   { activityId: "passenger_vehicle-vehicle_type_car-fuel_source_gasoline_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na", lcaActivity: "total", region: "AT", paramType: "distance", fallbackValue: 0.2472, unit: "kgCo2ePerKm" },
};

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
  return { activityId, region: FUEL_CONFIG[fuelType].region ?? "" };
}

function normalizeFactorRegion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const region = value.trim().toUpperCase();
  if (!region) return null;
  if (region === "NA" || region === "N/A") return null;
  return region;
}

const serverCache = new Map<string, { data: any; expiresAt: number }>();

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
  try { return { data: JSON.parse(rawText), rawText }; } catch { return { data: null, rawText }; }
}

function getActivitySelection(fuelType: FuelType): ActivitySelection {
  const config = FUEL_CONFIG[fuelType];
  return { activityId: config.activityId, region: config.region || "" };
}

async function handleClimatiqFuelFactor(req: any, res: any) {
  try {
    if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return; }

    const user = await requireSupabaseUser(req, res);
    if (!user) return;

    const allowed = await enforceRateLimit({ req, res, name: "climatiq_fuel_factor", identifier: user.id, limit: 60, windowMs: 60_000 });
    if (!allowed) return;

    const fuelType = normalizeFuelType(req.query?.fuelType ?? req.query?.fuel);
    if (!fuelType) return sendJson(res, 400, { error: "invalid_fuel_type" });

    const dataVersion = (process.env.CLIMATIQ_DATA_VERSION || DEFAULT_DATA_VERSION).trim() || DEFAULT_DATA_VERSION;
    const config = FUEL_CONFIG[fuelType];

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    const now = new Date();
    const cacheKey = `${user.id}:${fuelType}`;

    let cachedData: any = null;
    const inMemory = serverCache.get(cacheKey);
    if (inMemory && inMemory.expiresAt > now.getTime()) {
      cachedData = inMemory.data;
    } else if (supabase) {
      const { data, error } = await supabase.from("climatiq_cache").select("*").eq("user_id", user.id).eq("fuel_type", fuelType).single();
      if (data && !error) { cachedData = data; serverCache.set(cacheKey, { data, expiresAt: new Date(data.expires_at).getTime() }); }
    }

    const cacheValid = cachedData && new Date(cachedData.expires_at) > now;
    if (cacheValid) {
      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: cachedData.source || "cache", year: cachedData.year, region: cachedData.region, method: "cache", fallback: false, cachedAt: cachedData.cached_at, expiresAt: cachedData.expires_at };
      return sendJson(res, 200, payload);
    }

    const apiKey = (process.env.CLIMATIQ_API_KEY || "").trim();
    if (!apiKey) {
      if (cachedData) {
        const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: "fallback_from_cache", year: cachedData.year, region: cachedData.region, method: "fallback", fallback: true };
        return sendJson(res, 200, payload);
      }
      let finalFallback = config.fallbackValue;
      if (supabase) {
        const { data: userHistory } = await supabase.from('climatiq_cache').select('*').eq('user_id', user.id).eq('fuel_type', fuelType).order('cached_at', { ascending: false }).limit(1).maybeSingle();
        if (config.paramType === 'volume' && userHistory?.kg_co2e_per_liter) finalFallback = Number(userHistory.kg_co2e_per_liter);
        else if (config.paramType === 'distance' && userHistory?.kg_co2e_per_km) finalFallback = Number(userHistory.kg_co2e_per_km);
      }
      const payload: any = { fuelType, ...(config.paramType === 'volume' ? { kgCo2ePerLiter: finalFallback } : { kgCo2ePerKm: finalFallback }), activityId: null, dataVersion, source: 'historic_user_fallback', year: null, region: config.region, method: 'fallback', fallback: true };
      if (typeof attempt !== "undefined") {
        payload._debug = {
          status: attempt.status,
          rawText: attempt.rawText,
          message: "API called but failed or returned invalid data"
        };
      } else {
        payload._debug = "No attempt made. Possibly missing API key.";
      }
      return sendJson(res, 200, payload);
    }

    async function estimateOnce(activityId: string, region: string | null) {
      try {
        const parameters = config.paramType === "volume" ? { volume: 1, volume_unit: "l" } : { distance: 1, distance_unit: "km" };
        const emissionFactor: any = { activity_id: activityId, data_version: dataVersion, lca_activity: config.lcaActivity };
        if (region) emissionFactor.region = region;
        const upstream = await fetch(ESTIMATE_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ emission_factor: emissionFactor, parameters }) });
        const { data, rawText } = await readJsonResponse(upstream);
        console.log(`[climatiq] status=${upstream.status} activityId=${activityId} region=${region} dataVersion=${dataVersion} ok=${upstream.ok} rawText=${rawText?.substring(0, 300)}`);
        return { ok: upstream.ok, status: upstream.status, data, rawText, activityId, region };
      } catch (err: any) {
        return { ok: false, status: null, data: null, rawText: typeof err?.message === "string" ? err.message : "Network error", activityId, region };
      }
    }

    const selection = getEnvActivitySelection(fuelType) ?? getActivitySelection(fuelType);
    const attempt = await estimateOnce(selection.activityId, selection.region);
    const data: any = attempt.data;

    let co2e = Number(data?.co2e);
    let unit = typeof data?.co2e_unit === "string" ? data.co2e_unit : "kg";
    let co2eKg = Number.isFinite(co2e) ? co2eToKg(co2e, unit) : null;

    if (!attempt.ok || !data || !Number.isFinite(co2e) || co2e <= 0 || co2eKg == null || !Number.isFinite(co2eKg) || co2eKg <= 0) {
      if (cachedData) {
        const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: "fallback_from_cache", year: cachedData.year, region: cachedData.region, method: "fallback", fallback: true };
        return sendJson(res, 200, payload);
      }
      let finalFallback = config.fallbackValue;
      if (supabase) {
        const { data: userHistory } = await supabase.from('climatiq_cache').select('*').eq('user_id', user.id).eq('fuel_type', fuelType).order('cached_at', { ascending: false }).limit(1).maybeSingle();
        if (config.paramType === 'volume' && userHistory?.kg_co2e_per_liter) finalFallback = Number(userHistory.kg_co2e_per_liter);
        else if (config.paramType === 'distance' && userHistory?.kg_co2e_per_km) finalFallback = Number(userHistory.kg_co2e_per_km);
      }
      const payload: any = { fuelType, ...(config.paramType === 'volume' ? { kgCo2ePerLiter: finalFallback } : { kgCo2ePerKm: finalFallback }), activityId: null, dataVersion, source: 'historic_user_fallback', year: null, region: config.region, method: 'fallback', fallback: true };
      if (typeof attempt !== "undefined") {
        payload._debug = {
          status: attempt.status,
          rawText: attempt.rawText,
          message: "API called but failed or returned invalid data"
        };
      } else {
        payload._debug = "No attempt made. Possibly missing API key.";
      }
      return sendJson(res, 200, payload);
    }

    const factorRegion = normalizeFactorRegion(data?.emission_factor?.region) || config.region || null;
    const emissionValue = Math.round(co2eKg * 1_000_000) / 1_000_000;
    const parameters = config.paramType === "volume" ? { volume: 1, volume_unit: "l" } : { distance: 1, distance_unit: "km" };

    const cacheEntry = { user_id: user.id, fuel_type: fuelType, kg_co2e_per_liter: config.paramType === "volume" ? emissionValue : null, kg_co2e_per_km: config.paramType === "distance" ? emissionValue : null, region: factorRegion, source: data?.emission_factor?.source ?? "climatiq", year: data?.emission_factor?.year ?? null, activity_id: selection.activityId, data_version: dataVersion, cached_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), raw_response: data, updated_at: new Date().toISOString() };
    if (supabase) await supabase.from("climatiq_cache").upsert(cacheEntry, { onConflict: "user_id,fuel_type" });
    serverCache.set(cacheKey, { data: cacheEntry, expiresAt: new Date(cacheEntry.expires_at).getTime() });

    const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: emissionValue } : { kgCo2ePerKm: emissionValue }), activityId: selection.activityId, dataVersion, source: data?.emission_factor?.source ?? "climatiq", year: data?.emission_factor?.year ?? null, region: factorRegion, method: "data", fallback: false, cachedAt: cacheEntry.cached_at, expiresAt: cacheEntry.expires_at, request: { emission_factor: { activity_id: attempt.activityId, region: attempt.region || config.region }, parameters }, upstream: { ok: attempt.ok, status: attempt.status, data, rawText: attempt.rawText } };
    return sendJson(res, 200, payload);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Unexpected error";
    return sendJson(res, 500, { error: "internal_error", message });
  }
}

// ─── /api/climatiq/refresh-cache ─────────────────────────────────────────────
async function handleClimatiqRefreshCache(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing or invalid authorization" });

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Missing Supabase configuration" });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

  const { fuelType } = req.body;
  if (!fuelType || !["gasoline", "diesel", "ev"].includes(fuelType)) return res.status(400).json({ error: "Invalid or missing fuelType" });

  try {
    const { error: deleteError } = await supabase.from("climatiq_cache").delete().eq("user_id", user.id).eq("fuel_type", fuelType);
    if (deleteError) { console.error("[refresh-cache] Delete error:", deleteError); return res.status(500).json({ error: "Failed to clear cache" }); }
    return res.status(200).json({ success: true, message: `Cache cleared for ${fuelType}. Will be refreshed on next query.` });
  } catch (error) {
    console.error("[refresh-cache] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ─── /api/electricity-maps/carbon-intensity ──────────────────────────────────
const EM_BASE_URL = "https://api.electricitymap.org/v3";
const EM_CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { expiresAtMs: number; payload: unknown };
const EM_CACHE = new Map<string, CacheEntry>();

function normalizeZone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const z = input.trim().toUpperCase();
  if (!z) return null;
  if (z.length > 16) return null;
  if (!/^[A-Z0-9]{2,3}(-[A-Z0-9]{2,4})?$/.test(z)) return null;
  return z;
}

function getEmCached(zone: string): unknown | null {
  const entry = EM_CACHE.get(zone);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAtMs) { EM_CACHE.delete(zone); return null; }
  return entry.payload;
}

async function handleCarbonIntensity(req: any, res: any) {
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return; }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "electricity_maps_carbon_intensity", identifier: user.id, limit: 60, windowMs: 60_000 });
  if (!allowed) return;

  const zone = normalizeZone(req.query?.zone) ?? (process.env.ELECTRICITY_MAPS_DEFAULT_ZONE || "AT");
  const cached = getEmCached(zone);
  if (cached) return sendJson(res, 200, cached);

  const apiKey = process.env.ELECTRICITY_MAPS_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing ELECTRICITY_MAPS_API_KEY" });

  const url = new URL(`${EM_BASE_URL}/carbon-intensity/latest`);
  url.searchParams.set("zone", zone);
  const upstream = await fetch(url.toString(), { headers: { "auth-token": apiKey, accept: "application/json" } });
  const data: any = await upstream.json().catch(() => null);

  if (!upstream.ok || !data) {
    const msg = typeof data?.message === "string" ? data.message : "";
    return sendJson(res, 502, { error: "electricity_maps_error", message: msg || "Failed to contact Electricity Maps" });
  }

  const carbonIntensityG = Number(data?.carbonIntensity);
  if (!Number.isFinite(carbonIntensityG) || carbonIntensityG <= 0) return sendJson(res, 502, { error: "electricity_maps_error", message: "Invalid carbonIntensity payload" });

  const payload = { zone, gCo2PerKwh: carbonIntensityG, kgCo2PerKwh: Math.round((carbonIntensityG / 1000) * 1000) / 1000, datetime: typeof data?.datetime === "string" ? data.datetime : null, source: "electricitymaps", cachedTtlSeconds: Math.round(EM_CACHE_TTL_MS / 1000) };
  EM_CACHE.set(zone, { expiresAtMs: Date.now() + EM_CACHE_TTL_MS, payload });
  return sendJson(res, 200, payload);
}

// ─── Main router ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");

  if (path === "/api/climatiq/fuel-factor")              return handleClimatiqFuelFactor(req, res);
  if (path === "/api/climatiq/refresh-cache")            return handleClimatiqRefreshCache(req, res);
  if (path === "/api/electricity-maps/carbon-intensity") return handleCarbonIntensity(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found" }));
}
