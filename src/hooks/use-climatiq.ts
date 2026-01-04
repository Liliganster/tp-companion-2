import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { isOffline, readOfflineCache, writeOfflineCache } from "@/lib/offlineCache";

export type ClimatiqVehicleIntensity = {
  fuelType: "gasoline" | "diesel";
  region: string | null;
  kgCo2ePerKm: number;
  source?: string;
  year?: number | null;
};

export function useClimatiqVehicleIntensity(
  fuelType: ClimatiqVehicleIntensity["fuelType"] | null,
  opts?: { enabled?: boolean; region?: string }
) {
  const { user, getAccessToken } = useAuth();
  const region = (opts?.region ?? "").trim().toUpperCase() || null;
  const enabled = Boolean(user) && Boolean(fuelType) && (opts?.enabled ?? true);

  const offlineCacheKey = `cache:climatiq:vehicleIntensity:v1:${fuelType ?? "none"}:${region ?? "default"}`;
  const offlineCacheTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  return useQuery({
    queryKey: ["climatiq", "vehicleIntensity", fuelType, region] as const,
    enabled,
    staleTime: 24 * 60 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ClimatiqVehicleIntensity | null> => {
      const cached = readOfflineCache<ClimatiqVehicleIntensity>(offlineCacheKey, offlineCacheTtlMs);
      if (isOffline()) return cached ?? null;

      const token = await getAccessToken();
      if (!token || !fuelType) return cached ?? null;

      const params = new URLSearchParams({ fuelType });
      if (region) params.set("region", region);

      const res = await fetch(`/api/climatiq/vehicle-intensity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data) return cached ?? null;

      const kg = Number(data?.kgCo2ePerKm);
      if (!Number.isFinite(kg) || kg <= 0) return cached ?? null;

      const payload: ClimatiqVehicleIntensity = {
        fuelType,
        region: typeof data?.region === "string" ? data.region : region,
        kgCo2ePerKm: kg,
        source: typeof data?.source === "string" ? data.source : undefined,
        year: typeof data?.year === "number" ? data.year : null,
      };

      writeOfflineCache(offlineCacheKey, payload);
      return payload;
    },
  });
}

