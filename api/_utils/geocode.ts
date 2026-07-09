/**
 * Helpers puros de geocodificación — Fase 2 del PLAN.md.
 *
 * Reglas: sesgo region=at (sesgo, NUNCA restricción por país — los rodajes
 * cruzan a DE/CZ/HU), "Ecke" → "&" (Google entiende mejor la intersección),
 * y el centinela "No location found" no se geocodifica (antes gastaba una
 * llamada y podía devolver un lugar aleatorio).
 *
 * Las claves de caché normalizan diacríticos y puntuación para que la misma
 * localización escrita distinto (Führichgasse / Fuhrichgasse) comparta entrada.
 * La parte con red y Supabase vive en googleCache.ts; esto se testea puro.
 */

/** Los geocodes casi no caducan; las rutas sí (obras, cortes): TTLs distintos. */
export const GEOCODE_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const DIRECTIONS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isGeocodableAddress(address: string): boolean {
  const trimmed = String(address ?? "").trim();
  if (!trimmed) return false;
  return trimmed.toLowerCase() !== "no location found";
}

/** "Lichtenfelsgasse Ecke Rathausplatz" → "Lichtenfelsgasse & Rathausplatz". */
export function normalizeAddressForGeocoding(address: string): string {
  return String(address ?? "")
    .replace(/\s+ecke\s+/gi, " & ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeKeyPart(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
}

export function buildGeocodeCacheKey(address: string): string {
  return `geocode:${normalizeKeyPart(normalizeAddressForGeocoding(address))}`;
}

/** Clave del endpoint /api/google/geocode (región/components del cliente). */
export function buildApiGeocodeCacheKey(args: { address: string; region?: string; components?: string }): string {
  const region = String(args.region ?? "").trim().toLowerCase();
  const components = String(args.components ?? "").trim().toLowerCase();
  return `geocode_api:${region}:${components}:${normalizeKeyPart(normalizeAddressForGeocoding(args.address))}`;
}

export function buildDirectionsCacheKey(args: {
  origin: string;
  destination: string;
  waypoints?: string[];
  region?: string;
}): string {
  const region = String(args.region ?? "").trim().toLowerCase();
  const waypoints = (args.waypoints ?? []).map(normalizeKeyPart).join(">");
  return `directions:${region}:${normalizeKeyPart(args.origin)}|${waypoints}|${normalizeKeyPart(args.destination)}`;
}
