import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isOffline, readOfflineCache, readOfflineCacheEntry, writeOfflineCache } from "@/lib/offlineCache";
import { logger } from "@/lib/logger";

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
  const { user, getAccessToken } = useAuth();
  const enabled = Boolean(user) && Boolean(fuelType) && (opts?.enabled ?? true);

  // Use React Query cache with 30 day stale time to match backend cache
  // Note: timers in JS are limited to ~24.8 days (2^31-1 ms). Keep below that to avoid overflow in some runtimes.
  const SAFE_CACHE_MS = 2147483647;
  const CACHE_MS = Math.min(30 * 24 * 60 * 60 * 1000, SAFE_CACHE_MS);
  
  return useQuery({
    queryKey: ["climatiq", "fuelFactor", fuelType] as const,
    enabled,
    staleTime: CACHE_MS,
    gcTime: CACHE_MS,
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

        logger.debug(`[useClimatiqFuelFactor] Fetched data for ${fuelType}`);
        return payload;
      } catch (error) {
        logger.debug(`[useClimatiqFuelFactor] Error`, error);
        return null;
      }
    },
  });
}
