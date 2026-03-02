import { logger } from "@/lib/logger";

export function calculateCO2KgFromKm(distanceKm: number): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return 0;

  // WTW fallback: 0.21 kg CO₂e/km (European passenger car Well-to-Wheel average)
  // Used when Climatiq data is unavailable or fuel type is unknown.
  const kgPerKm = 0.21;

  return Math.round(km * kgPerKm * 10) / 10;
}

export type FuelType = "gasoline" | "diesel" | "ev" | "unknown";

export type EmissionsMethod = "fuel" | "ev" | "fallback_km";

export type TripEmissionsInput = {
  distanceKm: number;
  fuelType?: FuelType;
  fuelLPer100Km?: number | null;
  fuelKgCo2ePerLiter?: number | null;
  fuelKgCo2ePerKm?: number | null;  // Alternative: distance-based emission factor
  fuelLiters?: number | null;       // Real fuel consumed for the trip (ICE)
  evKwhPer100Km?: number | null;
  evKwhUsed?: number | null;        // Real kWh used for the trip (EV)
  gridKgCo2PerKwh?: number | null;
  passengers?: number | null;       // Number of passengers (for per-capita CO₂ calculation)
};

export type TripEmissionsResult = {
  co2Kg: number;
  co2KgPerPassenger: number; // co2Kg / max(passengers, 1)
  method: EmissionsMethod;
  liters?: number;
  kwh?: number;
};

// Fallback (kg CO₂ per kWh) used when a real-time grid factor isn't available (offline / missing key / upstream error).
// Austria ('AT') real-time values are fetched via Electricity Maps (see `/api/electricity-maps/carbon-intensity`).
export const DEFAULT_GRID_KG_CO2_PER_KWH_FALLBACK = 0.05;
export const GASOLINE_KG_CO2_PER_LITER = 2.31;
export const DIESEL_KG_CO2_PER_LITER = 2.68;

export function calculateTripEmissions(input: TripEmissionsInput): TripEmissionsResult {
  const raw = _computeTripEmissions(input);
  const pax =
    Number.isFinite(Number(input.passengers)) && Number(input.passengers) >= 1
      ? Math.max(1, Math.floor(Number(input.passengers)))
      : 1;
  return { ...raw, co2KgPerPassenger: Math.round((raw.co2Kg / pax) * 100) / 100 };
}

function _computeTripEmissions(input: TripEmissionsInput): Omit<TripEmissionsResult, "co2KgPerPassenger"> {
  const distanceKm = Number(input.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return { co2Kg: 0, method: "fallback_km" };

  const fuelType: FuelType = (input.fuelType ?? "unknown") as FuelType;

  if (fuelType === "gasoline" || fuelType === "diesel") {
    // Priority 1: Distance-based WTW factor from Climatiq passenger vehicle activity
    // (e.g. UBA Austria 2022: 0.2472 kg CO₂e/km, LCA total = combustion + upstream)
    // This is more accurate than volume-based because it uses real fleet data.
    const distanceFactorRaw = input.fuelKgCo2ePerKm == null ? null : Number(input.fuelKgCo2ePerKm);
    if (Number.isFinite(distanceFactorRaw) && (distanceFactorRaw as number) > 0) {
      const co2Kg = distanceKm * (distanceFactorRaw as number);
      return { co2Kg: Math.round(co2Kg * 100) / 100, method: "fuel" };
    }

    // Priority 2: Real liters consumed (user-entered) × kg CO₂e/L — most precise when available
    const fuelLitersReal = input.fuelLiters == null ? null : Number(input.fuelLiters);
    if (Number.isFinite(fuelLitersReal) && (fuelLitersReal as number) > 0) {
      const perLiterReal = input.fuelKgCo2ePerLiter == null ? null : Number(input.fuelKgCo2ePerLiter);
      const factorReal =
        Number.isFinite(perLiterReal) && (perLiterReal as number) > 0
          ? (perLiterReal as number)
          : fuelType === "diesel"
            ? DIESEL_KG_CO2_PER_LITER
            : GASOLINE_KG_CO2_PER_LITER;
      const co2Kg = (fuelLitersReal as number) * factorReal;
      return { co2Kg: Math.round(co2Kg * 10) / 10, method: "fuel", liters: Math.round((fuelLitersReal as number) * 10) / 10 };
    }

    // Priority 3: Volume-based calculation (L/100km × kg CO₂e/L) — fallback when distance factor unavailable
    const fuelLPer100Km = input.fuelLPer100Km == null ? null : Number(input.fuelLPer100Km);
    
    // Validation warnings (UI forms should prevent saving invalid values)
    if (fuelLPer100Km !== null && Number.isFinite(fuelLPer100Km)) {
      if (fuelLPer100Km < 3 && fuelLPer100Km > 0) {
        logger.warn(`⚠️ Consumo anormalmente bajo: ${fuelLPer100Km} L/100km (mínimo realista: 3 L/100km)`);
      }
      
      if (fuelLPer100Km > 50) {
        logger.warn(`⚠️ Consumo excesivo: ${fuelLPer100Km} L/100km (máximo realista: 50 L/100km)`);
      }
    }
    
    const liters = Number.isFinite(fuelLPer100Km) && fuelLPer100Km > 0 ? (distanceKm * fuelLPer100Km) / 100 : null;

    if (!Number.isFinite(liters) || (liters ?? 0) <= 0) {
      return { co2Kg: calculateCO2KgFromKm(distanceKm), method: "fallback_km" };
    }
    
    if (fuelType === "gasoline") {
      const perLiter = input.fuelKgCo2ePerLiter == null ? null : Number(input.fuelKgCo2ePerLiter);
      const factor = Number.isFinite(perLiter) && perLiter > 0 ? perLiter : GASOLINE_KG_CO2_PER_LITER;
      
      const co2Kg = liters * factor;
      return { co2Kg: Math.round(co2Kg * 10) / 10, method: "fuel", liters: Math.round(liters * 10) / 10 };
    }
    
    if (fuelType === "diesel") {
      const perLiter = input.fuelKgCo2ePerLiter == null ? null : Number(input.fuelKgCo2ePerLiter);
      const factor =
        Number.isFinite(perLiter) && perLiter > 0
          ? perLiter
          : DIESEL_KG_CO2_PER_LITER;

      const co2Kg = liters * factor;
      return { co2Kg: Math.round(co2Kg * 10) / 10, method: "fuel", liters: Math.round(liters * 10) / 10 };
    }
  }

  if (fuelType === "ev") {
    const evKwhPer100Km = input.evKwhPer100Km == null ? null : Number(input.evKwhPer100Km);
    
    // Validation warnings (UI forms should prevent saving invalid values)
    if (evKwhPer100Km !== null && Number.isFinite(evKwhPer100Km)) {
      if (evKwhPer100Km < 10 && evKwhPer100Km > 0) {
        logger.warn(`⚠️ Consumo EV anormalmente bajo: ${evKwhPer100Km} kWh/100km (mínimo realista: 10 kWh/100km)`);
      }
      
      if (evKwhPer100Km > 35) {
        logger.warn(`⚠️ Consumo EV excesivo: ${evKwhPer100Km} kWh/100km (máximo realista: 35 kWh/100km)`);
      }
    }
    
    const gridKg = input.gridKgCo2PerKwh == null ? DEFAULT_GRID_KG_CO2_PER_KWH_FALLBACK : Number(input.gridKgCo2PerKwh);
    if (!Number.isFinite(gridKg) || gridKg <= 0) {
      return { co2Kg: calculateCO2KgFromKm(distanceKm), method: "fallback_km" };
    }

    // App rule: CO₂ depends on distance + vehicle consumption settings (kWh/100km) + grid factor (kg/kWh).
    // Per-trip kWh is intentionally ignored.
    const kwh = Number.isFinite(evKwhPer100Km) && evKwhPer100Km > 0 ? (distanceKm * evKwhPer100Km) / 100 : null;

    if (Number.isFinite(kwh) && (kwh ?? 0) > 0) {
      // WTW for EV: ×1.08 accounts for ~8% grid transmission/distribution losses (ENTSO-E European average).
      // Source: ENTSO-E, JEC Well-to-Wheels Report (EU).
      const co2Kg = (kwh as number) * gridKg * 1.08;
      return { co2Kg: Math.round(co2Kg * 10) / 10, method: "ev", kwh: Math.round((kwh as number) * 10) / 10 };
    }
  }

  return { co2Kg: calculateCO2KgFromKm(distanceKm), method: "fallback_km" };
}

export function calculateTreesNeeded(co2Kg: number, kgCo2PerTreeYear = 20): number {
  const c = Number(co2Kg);
  const perTree = Number(kgCo2PerTreeYear);
  if (!Number.isFinite(c) || c <= 0) return 0;
  if (!Number.isFinite(perTree) || perTree <= 0) return 0;
  return Math.ceil(c / perTree);
}
