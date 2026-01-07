import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isOffline, readOfflineCache, readOfflineCacheEntry, writeOfflineCache } from "@/lib/offlineCache";

export type ClimatiqFuelFactor = {
  fuelType: "diesel";
  kgCo2ePerLiter?: number;  // For diesel (volume-based)
  kgCo2ePerKm?: number;     // For distance-based (future use)
  region: string | null;
  source?: string;
  year?: number | null;
  activityId?: string;
  dataVersion?: string;
  cachedTtlSeconds?: number;
  method?: string;
  fallback?: boolean;
  apiPayload?: unknown;
  cachedAt?: string;  // When it was cached
};

export function useClimatiqFuelFactor(fuelType: ClimatiqFuelFactor["fuelType"] | null, opts?: { enabled?: boolean }) {
  const { user, getAccessToken } = useAuth();
  const enabled = Boolean(user) && Boolean(fuelType) && (opts?.enabled ?? true);

  // No long-term offline cache used to prevent 'stuck' stale data.
  // We rely on React Query's in-memory cache for the session.
  
  return useQuery({
    queryKey: ["climatiq", "fuelFactor", fuelType] as const,
    enabled,
    staleTime: 0, // No cache - always fetch fresh data
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ClimatiqFuelFactor | null> => {
      if (isOffline()) return null; // No offline cache fallback for now as requested

      if (!user || !fuelType) return null;

      try {
        const token = await getAccessToken();
        if (!token) return null;

        const params = new URLSearchParams({ fuelType });
        const res = await fetch(`/api/climatiq/fuel-factor?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data) return null;

        // Check for either volume or distance based value
        const kgLiter = Number(data?.kgCo2ePerLiter);
        const kgKm = Number(data?.kgCo2ePerKm);
        const hasValidValue = (Number.isFinite(kgLiter) && kgLiter > 0) || (Number.isFinite(kgKm) && kgKm > 0);
        if (!hasValidValue) return null;

        const payload: ClimatiqFuelFactor = {
          fuelType,
          ...(Number.isFinite(kgLiter) && kgLiter > 0 ? { kgCo2ePerLiter: kgLiter } : {}),
          ...(Number.isFinite(kgKm) && kgKm > 0 ? { kgCo2ePerKm: kgKm } : {}),
          region: typeof data?.region === "string" ? data.region : null,
          source: typeof data?.source === "string" ? data.source : undefined,
          year: typeof data?.year === "number" ? data.year : null,
          activityId: typeof data?.activityId === "string" ? data.activityId : undefined,
          dataVersion: typeof data?.dataVersion === "string" ? data.dataVersion : undefined,
          cachedAt: new Date().toISOString(),
          apiPayload: data,
        };

        console.log(`[useClimatiqFuelFactor] Fetched data for ${fuelType}`);
        return payload;
      } catch (error) {
        console.error(`[useClimatiqFuelFactor] Error:`, error);
        return null;
      }
    },
  });
}
