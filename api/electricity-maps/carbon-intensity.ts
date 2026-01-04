import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

const BASE_URL = "https://api.electricitymap.org/v3";
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { expiresAtMs: number; payload: unknown };
const CACHE = new Map<string, CacheEntry>();

function normalizeZone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const z = input.trim().toUpperCase();
  if (!z) return null;
  if (z.length > 16) return null;
  // Examples: "AT", "DE", "FR", "DK-DK1"
  if (!/^[A-Z0-9]{2,3}(-[A-Z0-9]{2,4})?$/.test(z)) return null;
  return z;
}

function getCached(zone: string): unknown | null {
  const entry = CACHE.get(zone);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAtMs) {
    CACHE.delete(zone);
    return null;
  }
  return entry.payload;
}

function setCached(zone: string, payload: unknown) {
  CACHE.set(zone, { expiresAtMs: Date.now() + CACHE_TTL_MS, payload });
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
    name: "electricity_maps_carbon_intensity",
    identifier: user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!allowed) return;

  const zone = normalizeZone(req.query?.zone) ?? (process.env.ELECTRICITY_MAPS_DEFAULT_ZONE || "AT");
  const cached = getCached(zone);
  if (cached) return sendJson(res, 200, cached);

  const apiKey = process.env.ELECTRICITY_MAPS_API_KEY;
  if (!apiKey) return sendJson(res, 500, { error: "Missing ELECTRICITY_MAPS_API_KEY" });

  const url = new URL(`${BASE_URL}/carbon-intensity/latest`);
  url.searchParams.set("zone", zone);

  const upstream = await fetch(url.toString(), {
    headers: {
      "auth-token": apiKey,
      accept: "application/json",
    },
  });

  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok || !data) {
    const msg = typeof data?.message === "string" ? data.message : "";
    return sendJson(res, 502, { error: "electricity_maps_error", message: msg || "Failed to contact Electricity Maps" });
  }

  const carbonIntensityG = Number(data?.carbonIntensity);
  if (!Number.isFinite(carbonIntensityG) || carbonIntensityG <= 0) {
    return sendJson(res, 502, { error: "electricity_maps_error", message: "Invalid carbonIntensity payload" });
  }

  const payload = {
    zone,
    gCo2PerKwh: carbonIntensityG,
    kgCo2PerKwh: Math.round((carbonIntensityG / 1000) * 1000) / 1000,
    datetime: typeof data?.datetime === "string" ? data.datetime : null,
    source: "electricitymaps",
    cachedTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
  };

  setCached(zone, payload);
  return sendJson(res, 200, payload);
}

