import { useMemo } from "react";
import {
  DIESEL_KG_CO2_PER_LITER,
  FUEL_FACTOR_SOURCE,
  GASOLINE_KG_CO2_PER_LITER,
} from "@/lib/emissionFactors";

/**
 * Fase 1: la API de Climatiq está HIBERNADA. Este hook conserva su firma y la
 * forma del dato, pero devuelve los factores estáticos de
 * `src/lib/emissionFactors.ts` sin ninguna llamada de red.
 * (El endpoint /api/climatiq/* sigue en api/external.ts por si se reactiva.)
 */
export type ClimatiqFuelFactor = {
  fuelType: "gasoline" | "diesel";
  kgCo2ePerLiter?: number;  // For volume-based calculation
  kgCo2ePerKm?: number;     // For distance-based (future use)
  region: string | null;
  source?: string;
  year?: number | null;
  activityId?: string;
  dataVersion?: string;
  method?: string;
  fallback?: boolean;
  apiPayload?: unknown;
  cachedAt?: string;  // When it was cached
  expiresAt?: string; // When cache expires
};

export function useClimatiqFuelFactor(fuelType: ClimatiqFuelFactor["fuelType"] | null, opts?: { enabled?: boolean }) {
  const enabled = Boolean(fuelType) && (opts?.enabled ?? true);

  const data = useMemo<ClimatiqFuelFactor | null>(() => {
    if (!enabled || !fuelType) return null;
    return {
      fuelType,
      kgCo2ePerLiter: fuelType === "diesel" ? DIESEL_KG_CO2_PER_LITER : GASOLINE_KG_CO2_PER_LITER,
      region: "EU",
      source: FUEL_FACTOR_SOURCE,
      year: null,
      method: "static",
      fallback: false,
    };
  }, [enabled, fuelType]);

  return { data, isLoading: false, isFetching: false } as const;
}
