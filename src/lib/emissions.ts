export function calculateCO2KgFromKm(distanceKm: number): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return 0;

  // Default factor used across the app (kg CO₂ per km).
  // Keeps current behavior consistent with existing trip UI.
  const kgPerKm = 0.12;

  // Round to 1 decimal to match UI.
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
  evKwhPer100Km?: number | null;
  gridKgCo2PerKwh?: number | null;
};

export type TripEmissionsResult = {
  co2Kg: number;
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
  const distanceKm = Number(input.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return { co2Kg: 0, method: "fallback_km" };

  const fuelType: FuelType = (input.fuelType ?? "unknown") as FuelType;

  if (fuelType === "gasoline" || fuelType === "diesel") {
    const fuelLPer100Km = input.fuelLPer100Km == null ? null : Number(input.fuelLPer100Km);
    
    // Always need consumption for fuel-based calculation
    if (!Number.isFinite(fuelLPer100Km) || fuelLPer100Km <= 0) {
      return { co2Kg: calculateCO2KgFromKm(distanceKm), method: "fallback_km" };
    }
    
    const liters = (distanceKm * fuelLPer100Km) / 100;
    
    // For gasoline: use kgCo2ePerLiter explicitly.
    // The API now returns a volume-based factor (Well-to-Wheel) for Austria.
    if (fuelType === "gasoline") {
      const perLiter = input.fuelKgCo2ePerLiter == null ? null : Number(input.fuelKgCo2ePerLiter);
      // Use specific API factor if available, otherwise standard constant
      const factor = Number.isFinite(perLiter) && perLiter > 0 ? perLiter : GASOLINE_KG_CO2_PER_LITER;
      
      const co2Kg = liters * factor;
      return { co2Kg: Math.round(co2Kg * 10) / 10, method: "fuel", liters: Math.round(liters * 10) / 10 };
    }
    
    // For diesel: use kgCo2ePerLiter directly
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
    const gridKg = input.gridKgCo2PerKwh == null ? DEFAULT_GRID_KG_CO2_PER_KWH_FALLBACK : Number(input.gridKgCo2PerKwh);
    if (Number.isFinite(evKwhPer100Km) && evKwhPer100Km > 0 && Number.isFinite(gridKg) && gridKg > 0) {
      const kwh = (distanceKm * evKwhPer100Km) / 100;
      const co2Kg = kwh * gridKg;
      return { co2Kg: Math.round(co2Kg * 10) / 10, method: "ev", kwh: Math.round(kwh * 10) / 10 };
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
