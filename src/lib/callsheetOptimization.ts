import { getCountryCode } from "@/lib/country-mapping";
import { callsheetAddressKey, normalizeCallsheetAddress } from './callsheetAddress';

type UserProfileLike = {
  baseAddress?: string | null;
  city?: string | null;
  country?: string | null;
};

export function buildBaseRouteAddress(profile: UserProfileLike): string {
  const baseAddress = (profile.baseAddress ?? "").trim();
  const city = (profile.city ?? "").trim();
  const country = (profile.country ?? "").trim();

  if (!baseAddress) return "";

  const lowerBase = baseAddress.toLowerCase();
  const parts = [baseAddress];

  if (city && !lowerBase.includes(city.toLowerCase())) {
    parts.push(city);
  }

  const joined = parts.join(", ");
  if (country && !joined.toLowerCase().includes(country.toLowerCase())) {
    parts.push(country);
  }

  return parts.join(", ");
}

export async function optimizeCallsheetLocationsAndDistance(args: {
  profile: UserProfileLike;
  rawLocations: string[];
  accessToken?: string | null;
  signal?: AbortSignal;
  geocodeTimeoutMs?: number;
  directionsTimeoutMs?: number;
}): Promise<{ locations: string[]; distanceKm: number | null }> {
  const { profile, rawLocations, accessToken, signal } = args;
  const directionsTimeoutMs =
    typeof args.directionsTimeoutMs === "number" && args.directionsTimeoutMs > 0 ? args.directionsTimeoutMs : 15_000;

  async function fetchJsonWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();

    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      const data = await res.json().catch(() => null);
      return { res, data };
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  const baseAddress = buildBaseRouteAddress(profile);
  const country = (profile.country ?? "").trim();

  const seen = new Set<string>();
  const currentLocs = rawLocations.map(normalizeCallsheetAddress).filter(l => {
    const key = callsheetAddressKey(l);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (currentLocs.length === 0) return { locations: [], distanceKm: null };

  if (!accessToken) return { locations: currentLocs, distanceKm: null };

  const region = getCountryCode(country);

  const normalizedLocs: string[] = [];
  const waypoints: string[] = [];
  const places = new Set<string>();
  for (const address of currentLocs) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let display = address;
    let waypoint = address;
    let identity = callsheetAddressKey(address);
    // Coordinates and Maps links already identify a destination; do not geocode them as prose.
    if (!/^https?:\/\//i.test(address) && !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(address)) {
      try {
        const { res, data } = await fetchJsonWithTimeout('/api/google/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ address, region }),
        }, args.geocodeTimeoutMs ?? 8_000);
        if (res.ok && data?.resultCount === 1 && data?.partialMatch === false &&
            data?.placeId && data?.postalAddress &&
            ['street_address', 'premise', 'subpremise', 'point_of_interest', 'establishment', 'park', 'intersection'].some(t => data.types?.includes(t))) {
          display = data.postalAddress;
          waypoint = `place_id:${data.placeId}`;
          identity = waypoint;
        }
      } catch {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      }
    }
    if (places.has(identity)) continue;
    places.add(identity);
    normalizedLocs.push(display);
    waypoints.push(waypoint);
  }

  let distanceKm: number | null = null;

  if (baseAddress) {
    try {
      const { res, data } = await fetchJsonWithTimeout(
        "/api/google/directions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            origin: baseAddress,
            destination: baseAddress,
            waypoints,
            region,
          }),
        },
        directionsTimeoutMs,
      );

      if (res.ok && typeof (data as any)?.totalDistanceMeters === "number") {
        distanceKm = Math.round((((data as any).totalDistanceMeters as number) / 1000) * 10) / 10;
      }
    } catch {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      distanceKm = null;
    }
  }

  return { locations: normalizedLocs, distanceKm };
}
