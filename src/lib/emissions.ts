import {
  DEFAULT_GRID_ZONE,
  DIESEL_KG_CO2_PER_LITER,
  GASOLINE_KG_CO2_PER_LITER,
  GRID_KG_CO2_PER_KWH,
  TREE_KG_CO2_PER_YEAR,
} from "@/lib/emissionFactors";

export function calculateCO2KgFromKm(distanceKm: number): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return 0;

  // Generic estimate when the vehicle or its configured consumption is missing.
  // Used when the fuel type or the vehicle consumption is unknown.
  const kgPerKm = 0.21;

  return km * kgPerKm;
}

export type FuelType = "gasoline" | "diesel" | "ev" | "unknown";

export type EmissionsMethod = "fuel" | "ev" | "fallback_km";

export type TripEmissionsInput = {
  distanceKm: number;
  fuelType?: FuelType;
  fuelLPer100Km?: number | null;
  fuelKgCo2ePerLiter?: number | null;
  fuelKgCo2ePerKm?: number | null;  // Legacy input, ignored: configured vehicle consumption governs the calculation.
  fuelLiters?: number | null;       // Legacy trip data, ignored for this estimate.
  evKwhPer100Km?: number | null;
  evKwhUsed?: number | null;        // Legacy trip data, ignored for this estimate.
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

// Fallback (kg CO₂ per kWh) when no grid factor is provided: static annual
// average for Austria (see src/lib/emissionFactors.ts — Fase 1, sin APIs).
export const DEFAULT_GRID_KG_CO2_PER_KWH_FALLBACK = GRID_KG_CO2_PER_KWH[DEFAULT_GRID_ZONE];
export { GASOLINE_KG_CO2_PER_LITER, DIESEL_KG_CO2_PER_LITER };

export function calculateTripEmissions(input: TripEmissionsInput): TripEmissionsResult {
  const raw = _computeTripEmissions(input);
  const pax =
    Number.isFinite(Number(input.passengers)) && Number(input.passengers) >= 1
      ? Math.max(1, Math.floor(Number(input.passengers)))
      : 1;
  return { ...raw, co2KgPerPassenger: raw.co2Kg / pax };
}

function _computeTripEmissions(input: TripEmissionsInput): Omit<TripEmissionsResult, "co2KgPerPassenger"> {
  const distanceKm = Number(input.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return { co2Kg: 0, method: "fallback_km" };

  const fuelType: FuelType = (input.fuelType ?? "unknown") as FuelType;

  // One policy for tables, totals, reports and stored values: distance ×
  // configured consumption × energy factor. Receipt amounts, per-trip energy
  // and legacy fleet factors must never override the user's vehicle settings.
  if (fuelType === "gasoline" || fuelType === "diesel") {
    const consumption = Number(input.fuelLPer100Km);
    if (Number.isFinite(consumption) && consumption > 0) {
      const liters = distanceKm * consumption / 100;
      const configuredFactor = Number(input.fuelKgCo2ePerLiter);
      const factor = Number.isFinite(configuredFactor) && configuredFactor > 0
        ? configuredFactor
        : fuelType === "diesel" ? DIESEL_KG_CO2_PER_LITER : GASOLINE_KG_CO2_PER_LITER;
      return { co2Kg: liters * factor, method: "fuel", liters };
    }
  }

  if (fuelType === "ev") {
    const consumption = Number(input.evKwhPer100Km);
    const gridKg = input.gridKgCo2PerKwh == null
      ? DEFAULT_GRID_KG_CO2_PER_KWH_FALLBACK : Number(input.gridKgCo2PerKwh);
    if (Number.isFinite(consumption) && consumption > 0 && Number.isFinite(gridKg) && gridKg >= 0) {
      const kwh = distanceKm * consumption / 100;
      return { co2Kg: kwh * gridKg, method: "ev", kwh };
    }
  }

  return { co2Kg: calculateCO2KgFromKm(distanceKm), method: "fallback_km" };
}

// ~21 kg CO₂/árbol/año (árbol maduro; fuente en src/lib/emissionFactors.ts)
export function calculateTreesNeeded(co2Kg: number, kgCo2PerTreeYear = TREE_KG_CO2_PER_YEAR): number {
  const c = Number(co2Kg);
  const perTree = Number(kgCo2PerTreeYear);
  if (!Number.isFinite(c) || c <= 0) return 0;
  if (!Number.isFinite(perTree) || perTree <= 0) return 0;
  return c / perTree;
}

/** Display-only formatting; calculations and totals retain their precision. */
export function formatTreeEquivalent(trees: number, locale: string): string {
  const format = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 0 });
  if (!Number.isFinite(trees) || trees <= 0) return format(0);
  return trees < 0.5 ? `< ${format(1)}` : format(Math.round(trees));
}
