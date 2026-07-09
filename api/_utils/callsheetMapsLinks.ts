/**
 * Enlaces de Google Maps como fuente primaria de localización — Fase 2 del PLAN.md.
 *
 * Las callsheets suelen traer el enlace exacto junto al MOTIV ("Zufahrt via …
 * https://maps.app.goo.gl/…"). Ese enlace ES la verdad: apunta al sitio
 * conducible aunque el texto sea ambiguo ("1190, Wildgrubgasse" geocodifica en
 * cualquier punto de una calle de 2 km). Aquí se extraen del texto del PDF,
 * se asocian a las localizaciones extraídas por la IA y se resuelven
 * (siguiendo la redirección) a coordenadas + nombre del lugar. Resolverlos es
 * gratis: solo HTTP, sin API de Google.
 */

export type MapsLinkCandidate = {
  url: string;
  /** Texto de la línea donde apareció el enlace (sin el propio enlace). */
  context: string;
};

export type ResolvedMapsLink = {
  lat: number;
  lng: number;
  /** Nombre del lugar según Google Maps (si la URL final lo trae). */
  label: string | null;
  finalUrl: string;
};

const MAPS_LINK_RE =
  /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]{2,10}\/maps)\/?\S*/gi;

export function extractMapsLinkCandidates(pdfText: string | null | undefined): MapsLinkCandidate[] {
  const text = String(pdfText ?? "");
  if (!text) return [];

  const out: MapsLinkCandidate[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    for (const match of line.matchAll(MAPS_LINK_RE)) {
      // Recorta puntuación colgante típica de PDFs (").", ","…)
      const url = match[0].replace(/[)\],.;'"»›]+$/g, "");
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, context: line.replace(MAPS_LINK_RE, " ").replace(/\s+/g, " ").trim() });
    }
  }
  return out;
}

function tokens(s: string): Set<string> {
  return new Set(
    String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length >= 3),
  );
}

/**
 * Asocia una localización extraída con el enlace cuya línea de contexto más
 * se le parece. Con un único enlace en el documento y una única localización,
 * también se acepta (caso típico: MOTIV con su enlace).
 */
export function matchMapsLinkToLocation(
  location: string,
  candidates: MapsLinkCandidate[],
  opts?: { totalLocations?: number },
): string | null {
  if (!candidates.length) return null;

  const locTokens = tokens(location);
  let best: { url: string; score: number } | null = null;
  for (const c of candidates) {
    const ctxTokens = tokens(c.context);
    if (locTokens.size === 0 || ctxTokens.size === 0) continue;
    let common = 0;
    for (const w of locTokens) if (ctxTokens.has(w)) common++;
    const score = common / Math.min(locTokens.size, ctxTokens.size);
    if (!best || score > best.score) best = { url: c.url, score };
  }
  if (best && best.score >= 0.34) return best.url;

  // Un solo enlace y una sola localización: casi seguro que van juntos.
  if (candidates.length === 1 && (opts?.totalLocations ?? 0) === 1) return candidates[0].url;

  return null;
}

/** Extrae lat/lng y nombre del lugar de una URL final de Google Maps. */
export function parseResolvedMapsUrl(finalUrl: string): ResolvedMapsLink | null {
  const url = String(finalUrl ?? "");

  // Nombre del lugar: /maps/place/<NAME>/...
  let label: string | null = null;
  const placeMatch = /\/maps\/place\/([^/@?]+)/.exec(url);
  if (placeMatch) {
    try {
      label = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim() || null;
    } catch {
      label = placeMatch[1].replace(/\+/g, " ").trim() || null;
    }
  }

  // Coordenadas: @lat,lng | /search/lat,+lng | query=lat,lng | !3dlat!4dlng
  const at = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(url);
  const search = /\/maps\/search\/(-?\d{1,3}\.\d+),\s*\+?(-?\d{1,3}\.\d+)/.exec(url);
  const query = /[?&]query=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/.exec(url);
  const data = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(url);
  // !3d/!4d es el pin exacto del lugar; @ es solo el centro del mapa.
  const m = data ?? at ?? search ?? query;
  if (!m) return null;

  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng, label, finalUrl: url };
}

/** Sigue las redirecciones del enlace corto (sin ejecutar nada) y parsea el destino. */
export async function resolveMapsLink(
  url: string,
  opts?: { timeoutMs?: number; maxRedirects?: number },
): Promise<ResolvedMapsLink | null> {
  const timeoutMs = opts?.timeoutMs ?? 6_000;
  const maxRedirects = opts?.maxRedirects ?? 5;

  let current = url;
  try {
    for (let i = 0; i < maxRedirects; i += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(current, { method: "GET", redirect: "manual", signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).toString();
        // Si ya es una URL de Maps con coordenadas, no hace falta seguir.
        const parsed = parseResolvedMapsUrl(current);
        if (parsed) return parsed;
        continue;
      }
      break;
    }
  } catch {
    return null;
  }
  return parseResolvedMapsUrl(current);
}
