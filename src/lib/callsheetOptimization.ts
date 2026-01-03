import { getCountryCode } from "@/lib/country-mapping";

type UserProfileLike = {
  baseAddress?: string | null;
  city?: string | null;
  country?: string | null;
};

export async function optimizeCallsheetLocationsAndDistance(args: {
  profile: UserProfileLike;
  rawLocations: string[];
  accessToken?: string | null;
  signal?: AbortSignal;
  geocodeTimeoutMs?: number;
  directionsTimeoutMs?: number;
}): Promise<{ locations: string[]; distanceKm: number | null }> {
  const { profile, rawLocations, accessToken, signal } = args;
  const geocodeTimeoutMs = typeof args.geocodeTimeoutMs === "number" && args.geocodeTimeoutMs > 0 ? args.geocodeTimeoutMs : 10_000;
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

  const baseAddress = (profile.baseAddress ?? "").trim();
  const city = (profile.city ?? "").trim();
  const country = (profile.country ?? "").trim();

  const currentLocs = rawLocations.map((l) => (l ?? "").trim()).filter(Boolean);
  if (currentLocs.length === 0) return { locations: [], distanceKm: null };

  if (!accessToken) return { locations: currentLocs, distanceKm: null };

  const region = getCountryCode(country);

  const normalizedLocs: string[] = [];
  for (const locStr of currentLocs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let query = locStr;

    const lower = locStr.toLowerCase();
    const hasCity = city && lower.includes(city.toLowerCase());
    const hasCountry = country && lower.includes(country.toLowerCase());
    const hasContext = Boolean(hasCity || hasCountry);

    if (!hasContext && city && country) {
      query = `${locStr}, ${city}, ${country}`;
    }

    try {
      const { res, data } = await fetchJsonWithTimeout(
        "/api/google/geocode",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ address: query, region }),
        },
        geocodeTimeoutMs,
      );

      if (res.ok && (data as any)?.formattedAddress) {
        normalizedLocs.push(data.formattedAddress);
      } else {
        normalizedLocs.push(locStr);
      }
    } catch {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      normalizedLocs.push(locStr);
    }
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
