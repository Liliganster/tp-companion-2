import { getCountryCode } from "@/lib/country-mapping";

type UserProfileLike = {
  baseAddress?: string | null;
  city?: string | null;
  country?: string | null;
};

export async function optimizeCallsheetLocationsAndDistance(args: {
  profile: UserProfileLike;
  rawLocations: string[];
}): Promise<{ locations: string[]; distanceKm: number | null }> {
  const { profile, rawLocations } = args;

  const baseAddress = (profile.baseAddress ?? "").trim();
  const city = (profile.city ?? "").trim();
  const country = (profile.country ?? "").trim();

  const currentLocs = rawLocations.map((l) => (l ?? "").trim()).filter(Boolean);
  if (currentLocs.length === 0) return { locations: [], distanceKm: null };

  const region = getCountryCode(country);

  const normalizedLocs: string[] = [];
  for (const locStr of currentLocs) {
    let query = locStr;

    const lower = locStr.toLowerCase();
    const hasCity = city && lower.includes(city.toLowerCase());
    const hasCountry = country && lower.includes(country.toLowerCase());
    const hasContext = Boolean(hasCity || hasCountry);

    if (!hasContext && city && country) {
      query = `${locStr}, ${city}, ${country}`;
    }

    try {
      const res = await fetch("/api/google/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: query, region }),
      });

      const data = (await res.json().catch(() => null)) as { formattedAddress?: string } | null;

      if (res.ok && data?.formattedAddress) {
        normalizedLocs.push(data.formattedAddress);
      } else {
        normalizedLocs.push(locStr);
      }
    } catch {
      normalizedLocs.push(locStr);
    }
  }

  let distanceKm: number | null = null;

  if (baseAddress) {
    try {
      const res = await fetch("/api/google/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: baseAddress,
          destination: baseAddress,
          waypoints: normalizedLocs,
          region,
        }),
      });

      const data = (await res.json().catch(() => null)) as { totalDistanceMeters?: number } | null;
      if (res.ok && typeof data?.totalDistanceMeters === "number") {
        distanceKm = Math.round((data.totalDistanceMeters / 1000) * 10) / 10;
      }
    } catch {
      distanceKm = null;
    }
  }

  return { locations: normalizedLocs, distanceKm };
}
