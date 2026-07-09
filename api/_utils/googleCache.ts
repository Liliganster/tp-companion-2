/**
 * Caché de Google Maps en Supabase (tabla google_api_cache) — Fase 2.
 *
 * Los rodajes repiten localizaciones durante semanas: cachear geocodes y
 * rutas recorta el mayor coste variable de la app. Todo es best-effort:
 * si la tabla no existe todavía (migración sin aplicar) o Supabase falla,
 * se llama a Google como siempre.
 *
 * Solo se cachean respuestas OK — un fallo (errata, ZERO_RESULTS) se
 * reintenta en la siguiente ocasión.
 */
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { logger } from "./observability.js";
import {
  GEOCODE_CACHE_TTL_MS,
  buildGeocodeCacheKey,
  isGeocodableAddress,
  normalizeAddressForGeocoding,
} from "./geocode.js";

export type GeocodeResult = {
  formatted_address: string;
  lat: number;
  lng: number;
  place_id: string | null;
  quality: string;
};

export async function cacheGet(cacheKey: string, ttlMs: number): Promise<any | null> {
  try {
    const { data } = await supabaseAdmin
      .from("google_api_cache")
      .select("response, updated_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (!data?.response) return null;
    const updatedAt = Date.parse(String((data as any).updated_at ?? ""));
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > ttlMs) return null;
    return (data as any).response;
  } catch {
    return null;
  }
}

export async function cacheSet(cacheKey: string, kind: string, response: any): Promise<void> {
  try {
    await supabaseAdmin.from("google_api_cache").upsert(
      {
        cache_key: cacheKey,
        kind,
        response,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "cache_key" } as any,
    );
  } catch {
    // best-effort: sin caché se sigue funcionando
  }
}

/**
 * Geocodificación del extractor de callsheets (worker + process), con caché
 * y las reglas de la Fase 2: sesgo region=at, idioma de, "Ecke" → "&",
 * centinela sin geocodificar.
 */
export async function geocodeAddressCached(address: string): Promise<GeocodeResult | null> {
  if (!isGeocodableAddress(address)) return null;

  const cacheKey = buildGeocodeCacheKey(address);
  const cached = await cacheGet(cacheKey, GEOCODE_CACHE_TTL_MS);
  if (cached) return cached as GeocodeResult;

  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    logger.warn("Missing GOOGLE_MAPS_SERVER_KEY");
    return null;
  }

  try {
    const params = new URLSearchParams({
      address: normalizeAddressForGeocoding(address),
      key: apiKey,
      region: "at", // sesgo, nunca restricción: los rodajes cruzan fronteras
      language: "de",
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
    const data: any = await response.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const first = data.results[0];
      const result: GeocodeResult = {
        formatted_address: first.formatted_address,
        lat: first.geometry.location.lat,
        lng: first.geometry.location.lng,
        place_id: first.place_id ?? null,
        quality: first.geometry.location_type,
      };
      await cacheSet(cacheKey, "geocode", result);
      return result;
    }
    return null;
  } catch (error) {
    logger.error({ err: error }, "Geocoding error");
    return null;
  }
}
