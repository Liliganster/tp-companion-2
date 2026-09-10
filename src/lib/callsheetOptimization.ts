import { getCountryCode } from "@/lib/country-mapping";

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

  const currentLocs = rawLocations.map((l) => (l ?? "").trim()).filter(Boolean);
  if (currentLocs.length === 0) return { locations: [], distanceKm: null };

  if (!accessToken) return { locations: currentLocs, distanceKm: null };

  const region = getCountryCode(country);

  const normalizedLocs = currentLocs;

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
            waypoints: normalizedLocs,
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
