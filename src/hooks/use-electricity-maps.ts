import { useMemo } from "react";
import { DEFAULT_GRID_ZONE, GRID_KG_CO2_PER_KWH, type GridZone } from "@/lib/emissionFactors";

/**
 * Fase 1: la API de Electricity Maps está HIBERNADA. Este hook conserva su
 * firma y la forma del dato, pero devuelve la media anual estática por país de
 * `src/lib/emissionFactors.ts` sin ninguna llamada de red.
 * (El endpoint /api/electricity-maps/* sigue en api/external.ts por si se reactiva.)
 */
export type ElectricityMapsCarbonIntensity = {
  zone: string;
  gCo2PerKwh: number;
  kgCo2PerKwh: number;
  datetime: string | null;
};

export function useElectricityMapsCarbonIntensity(zone = "AT", opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;

  const data = useMemo<ElectricityMapsCarbonIntensity | null>(() => {
    if (!enabled) return null;
    const key: GridZone = (zone in GRID_KG_CO2_PER_KWH ? zone : DEFAULT_GRID_ZONE) as GridZone;
    const kg = GRID_KG_CO2_PER_KWH[key];
    return {
      zone: key,
      gCo2PerKwh: Math.round(kg * 1000),
      kgCo2PerKwh: kg,
      datetime: null, // media anual estática, no hay "última actualización"
    };
  }, [enabled, zone]);

  return { data, isLoading: false, isFetching: false } as const;
}
