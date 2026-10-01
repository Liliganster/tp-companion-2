import { callsheetAddressKey } from './callsheetAddress';

export type UserProfileLike = {
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


/** Match only the configured base or its explicit city/country-expanded form. */
export function isBaseRouteAddress(profile: UserProfileLike, address: string): boolean {
  const key = callsheetAddressKey(address);
  return Boolean(key && profile.baseAddress?.trim()) &&
    [profile.baseAddress ?? '', buildBaseRouteAddress(profile)].some(value => callsheetAddressKey(value) === key);
}

/** Build a journey, not extraction evidence: collapse consecutive repeats only.
 * A -> B -> A is a real return visit and must remain in its original order. */
export function buildCallsheetRoute(profile: UserProfileLike, locations: readonly string[]): string[] {
  const base = buildBaseRouteAddress(profile);
  const stops = locations.map(value => value.trim()).filter(Boolean)
    .map(value => isBaseRouteAddress(profile, value) ? base : value);
  const route = base ? [base, ...stops, base] : stops;
  return route.filter((value, index) => index === 0 || callsheetAddressKey(value) !== callsheetAddressKey(route[index - 1]));
}
