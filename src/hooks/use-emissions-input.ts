import { useMemo } from "react";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useElectricityMapsCarbonIntensity } from "@/hooks/use-electricity-maps";
import { useClimatiqFuelFactor } from "@/hooks/use-climatiq";
import { parseLocaleNumber } from "@/lib/number";
import { TripEmissionsInput } from "@/lib/emissions";

/**
 * Hook to interpret user profile and external data into a standardized emissions input object.
 * This ensures all parts of the app use the exact same parameters for CO2 calculations.
 */
export function useEmissionsInput(): {
  emissionsInput: Omit<TripEmissionsInput, "distanceKm">;
  isLoading: boolean;
  fuelFactorData: any;
  gridData: any;
} {
  const { profile } = useUserProfile();

  const { data: atGrid, isLoading: isLoadingGrid } = useElectricityMapsCarbonIntensity("AT", {
    enabled: profile.fuelType === "ev",
  });

  const { data: fuelFactor, isLoading: isLoadingFuel } = useClimatiqFuelFactor(
    profile.fuelType === "gasoline" || profile.fuelType === "diesel" ? profile.fuelType : null,
    { enabled: profile.fuelType === "gasoline" || profile.fuelType === "diesel" },
  );

  const emissionsInput = useMemo(() => {
    return {
      fuelType: profile.fuelType,
      fuelLPer100Km: parseLocaleNumber(profile.fuelLPer100Km),
      fuelKgCo2ePerLiter: fuelFactor?.kgCo2ePerLiter ?? null,
      fuelKgCo2ePerKm: fuelFactor?.kgCo2ePerKm ?? null,
      evKwhPer100Km: parseLocaleNumber(profile.evKwhPer100Km),
      gridKgCo2PerKwh: atGrid?.kgCo2PerKwh ?? null,
    };
  }, [
    atGrid?.kgCo2PerKwh,
    fuelFactor?.kgCo2ePerLiter,
    fuelFactor?.kgCo2ePerKm,
    profile.evKwhPer100Km,
    profile.fuelLPer100Km,
    profile.fuelType
  ]);

  return {
    emissionsInput,
    isLoading: isLoadingGrid || isLoadingFuel,
    fuelFactorData: fuelFactor,
    gridData: atGrid,
  };
}
