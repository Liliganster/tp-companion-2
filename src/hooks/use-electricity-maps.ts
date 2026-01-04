import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { isOffline, readOfflineCache, writeOfflineCache } from "@/lib/offlineCache";

export type ElectricityMapsCarbonIntensity = {
  zone: string;
  gCo2PerKwh: number;
  kgCo2PerKwh: number;
  datetime: string | null;
};

export function useElectricityMapsCarbonIntensity(zone = "AT", opts?: { enabled?: boolean }) {
  const { user, getAccessToken } = useAuth();
  const enabled = Boolean(user) && (opts?.enabled ?? true);
  const offlineCacheKey = `cache:electricityMaps:carbonIntensity:v1:${zone}`;
  const offlineCacheTtlMs = 24 * 60 * 60 * 1000; // 24h

  return useQuery({
    queryKey: ["electricityMaps", "carbonIntensity", zone] as const,
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ElectricityMapsCarbonIntensity | null> => {
      const cached = readOfflineCache<ElectricityMapsCarbonIntensity>(offlineCacheKey, offlineCacheTtlMs);
      if (isOffline()) return cached ?? null;

      const token = await getAccessToken();
      if (!token) return cached ?? null;

      const res = await fetch(`/api/electricity-maps/carbon-intensity?zone=${encodeURIComponent(zone)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data) return cached ?? null;

      const kg = Number(data?.kgCo2PerKwh);
      const g = Number(data?.gCo2PerKwh);
      if (!Number.isFinite(kg) || kg <= 0) return cached ?? null;
      if (!Number.isFinite(g) || g <= 0) return cached ?? null;

      const payload: ElectricityMapsCarbonIntensity = {
        zone: typeof data?.zone === "string" ? data.zone : zone,
        gCo2PerKwh: g,
        kgCo2PerKwh: kg,
        datetime: typeof data?.datetime === "string" ? data.datetime : null,
      };

      writeOfflineCache(offlineCacheKey, payload);
      return payload;
    },
  });
}
