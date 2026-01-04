import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { isOffline, readOfflineCache, writeOfflineCache } from "@/lib/offlineCache";

export type ClimatiqFuelFactor = {
  fuelType: "gasoline" | "diesel";
  kgCo2ePerLiter: number;
  region: string | null;
  source?: string;
  year?: number | null;
  activityId?: string;
  dataVersion?: string;
};

export function useClimatiqFuelFactor(fuelType: ClimatiqFuelFactor["fuelType"] | null, opts?: { enabled?: boolean }) {
  const { user, getAccessToken } = useAuth();
  const enabled = Boolean(user) && Boolean(fuelType) && (opts?.enabled ?? true);

  const offlineCacheKey = `cache:climatiq:fuelFactor:v1:${fuelType ?? "none"}`;
  const offlineCacheTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  return useQuery({
    queryKey: ["climatiq", "fuelFactor", fuelType] as const,
    enabled,
    staleTime: 24 * 60 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ClimatiqFuelFactor | null> => {
      const cached = readOfflineCache<ClimatiqFuelFactor>(offlineCacheKey, offlineCacheTtlMs);
      if (isOffline()) return cached ?? null;

      const token = await getAccessToken();
      if (!token || !fuelType) return cached ?? null;

      const params = new URLSearchParams({ fuelType });

      const res = await fetch(`/api/climatiq/fuel-factor?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data) return cached ?? null;

      const kg = Number(data?.kgCo2ePerLiter);
      if (!Number.isFinite(kg) || kg <= 0) return cached ?? null;

      const payload: ClimatiqFuelFactor = {
        fuelType,
        kgCo2ePerLiter: kg,
        region: typeof data?.region === "string" ? data.region : null,
        source: typeof data?.source === "string" ? data.source : undefined,
        year: typeof data?.year === "number" ? data.year : null,
        activityId: typeof data?.activityId === "string" ? data.activityId : undefined,
        dataVersion: typeof data?.dataVersion === "string" ? data.dataVersion : undefined,
      };

      writeOfflineCache(offlineCacheKey, payload);
      return payload;
    },
  });
}

