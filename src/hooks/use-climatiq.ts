import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isOffline, readOfflineCache, readOfflineCacheEntry, writeOfflineCache } from "@/lib/offlineCache";

export type ClimatiqFuelFactor = {
  fuelType: "gasoline" | "diesel";
  kgCo2ePerLiter?: number;  // For diesel (volume-based)
  kgCo2ePerKm?: number;     // For gasoline (distance-based)
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

  const offlineCacheKey = `cache:climatiq:fuelFactor:v4:${fuelType ?? "none"}`;
  const offlineCacheTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  const cachedEntry = readOfflineCacheEntry<ClimatiqFuelFactor>(offlineCacheKey, offlineCacheTtlMs);

  return useQuery({
    queryKey: ["climatiq", "fuelFactor", fuelType] as const,
    enabled,
    staleTime: offlineCacheTtlMs,
    retry: 1,
    refetchOnWindowFocus: false,
    initialData: cachedEntry?.data,
    initialDataUpdatedAt: cachedEntry?.ts,
    queryFn: async (): Promise<ClimatiqFuelFactor | null> => {
      const cached = readOfflineCache<ClimatiqFuelFactor>(offlineCacheKey, offlineCacheTtlMs);
      if (isOffline()) return cached ?? null;

      if (!user || !fuelType || !supabase) return cached ?? null;

      try {
        // 1. Check database cache first
        const now = new Date();
        const { data: dbCache, error: dbError } = await supabase
          .from("climatiq_cache")
          .select("*")
          .eq("user_id", user.id)
          .eq("fuel_type", fuelType)
          .single();

        // If cache exists and hasn't expired, use it
        if (dbCache && !dbError) {
          const expiresAt = new Date(dbCache.expires_at);
          if (now < expiresAt) {
            const payload: ClimatiqFuelFactor = {
              fuelType,
              kgCo2ePerLiter: dbCache.kg_co2e_per_liter || undefined,
              kgCo2ePerKm: dbCache.kg_co2e_per_km || undefined,
              region: dbCache.region || null,
              source: dbCache.source || undefined,
              year: dbCache.year || null,
              activityId: dbCache.activity_id || undefined,
              dataVersion: dbCache.data_version || undefined,
              cachedAt: dbCache.cached_at,
              apiPayload: dbCache.raw_response,
            };
            writeOfflineCache(offlineCacheKey, payload);
            console.log(`[useClimatiqFuelFactor] Using cached data for ${fuelType}`);
            return payload;
          }
        }

        // 2. Cache expired or doesn't exist - fetch from API
        const token = await getAccessToken();
        if (!token) return cached ?? null;

        const params = new URLSearchParams({ fuelType });
        const res = await fetch(`/api/climatiq/fuel-factor?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data: any = await res.json().catch(() => null);
        if (!res.ok || !data) return cached ?? null;

        // Check for either volume or distance based value
        const kgLiter = Number(data?.kgCo2ePerLiter);
        const kgKm = Number(data?.kgCo2ePerKm);
        const hasValidValue = (Number.isFinite(kgLiter) && kgLiter > 0) || (Number.isFinite(kgKm) && kgKm > 0);
        if (!hasValidValue) return cached ?? null;

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

        // 3. Save to database for next time
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        if (dbCache) {
          // Update existing cache
          await supabase
            .from("climatiq_cache")
            .update({
              kg_co2e_per_liter: payload.kgCo2ePerLiter || null,
              kg_co2e_per_km: payload.kgCo2ePerKm || null,
              region: payload.region || null,
              source: payload.source || null,
              year: payload.year || null,
              activity_id: payload.activityId || null,
              data_version: payload.dataVersion || null,
              cached_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
              raw_response: data,
              updated_at: new Date().toISOString(),
            })
            .eq("id", dbCache.id);
        } else {
          // Insert new cache
          await supabase
            .from("climatiq_cache")
            .insert({
              user_id: user.id,
              fuel_type: fuelType,
              kg_co2e_per_liter: payload.kgCo2ePerLiter || null,
              kg_co2e_per_km: payload.kgCo2ePerKm || null,
              region: payload.region || null,
              source: payload.source || null,
              year: payload.year || null,
              activity_id: payload.activityId || null,
              data_version: payload.dataVersion || null,
              cached_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
              raw_response: data,
            });
        }

        writeOfflineCache(offlineCacheKey, payload);
        console.log(`[useClimatiqFuelFactor] Fetched and cached data for ${fuelType}`);
        return payload;
      } catch (error) {
        console.error(`[useClimatiqFuelFactor] Error:`, error);
        return cached ?? null;
      }
    },
  });
}
