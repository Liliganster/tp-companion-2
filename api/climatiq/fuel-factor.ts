import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

const ESTIMATE_URL = "https://api.climatiq.io/data/v1/estimate";

const DEFAULT_DATA_VERSION = "^21";

// Diesel and Gasoline - both use volume (liters) with regional data
const FUEL_CONFIG: Record<FuelType, {
  activityId: string;
  region: string | null;
  paramType: "volume" | "distance";
  fallbackValue: number;
  unit: string;
}> = {
  gasoline: {
    activityId: "fuel-type_motor_gasoline-fuel_use_na",
    region: "AT", // Austria
    paramType: "volume",
    fallbackValue: 2.31, // Standard kg CO2e/L fallback if API fails
    unit: "kgCo2ePerLiter",
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
type ActivitySelection = { activityId: string; region: string };


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
    region: config.region || "", // Empty string if null
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

      method: "fallback",
      fallback: true,
    };

    return sendJson(res, 200, payload);
  }

  async function estimateOnce(
    activityId: string,
    region: string | null,
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
      const parameters = config.paramType === "volume"
        ? { volume: 1, volume_unit: "l" }
        : { distance: 1, distance_unit: "km" };
      
      const emissionFactor: any = {
        activity_id: activityId,
      };

      // For gasoline AT: include region and unit_type
      // For diesel EU: include data_version
      if (region) {
        emissionFactor.region = region;
      }

      if (config.paramType === "volume") {
        emissionFactor.unit_type = "volume";
      }

      // Add data_version (optional but recommended)
      emissionFactor.data_version = dataVersion;

      const requestBody = {
        emission_factor: emissionFactor,
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

  const selection = getEnvActivitySelection(fuelType) ?? getActivitySelection(fuelType);

  // Use the fuel-specific config - pass selection.region which contains "AT" for gasoline
  const attempt = await estimateOnce(selection.activityId, selection.region);

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

  const factorRegion = normalizeFactorRegion(data?.emission_factor?.region) || config.region || null;
  
  // Build response - use fuel-type specific field
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


  return sendJson(res, 200, payload);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Unexpected error";
    return sendJson(res, 500, { error: "internal_error", message });
  }
}
