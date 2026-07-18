export const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
export const PLACES_AUTOCOMPLETE_API_URL = "https://places.googleapis.com/v1/places:autocomplete";

export const ROUTES_FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.staticDuration",
  "routes.polyline.encodedPolyline",
  "routes.viewport",
  "routes.legs.distanceMeters",
  "routes.legs.duration",
  "routes.legs.staticDuration",
  "routes.legs.startLocation",
  "routes.legs.endLocation",
].join(",");

export const PLACES_AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text.text",
].join(",");

type RoutesRequestInput = {
  origin: string;
  destination: string;
  waypoints: string[];
  region?: string;
  language?: string;
};

export function buildRoutesApiRequest(input: RoutesRequestInput) {
  return {
    origin: { address: input.origin.trim() },
    destination: { address: input.destination.trim() },
    intermediates: input.waypoints.map((address) => ({ address: address.trim() })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    polylineQuality: "OVERVIEW",
    polylineEncoding: "ENCODED_POLYLINE",
    units: "METRIC",
    ...(input.language ? { languageCode: input.language } : {}),
    ...(input.region ? { regionCode: input.region } : {}),
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseGoogleDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

function toLegacyLatLng(location: any) {
  const latitude = finiteNumber(location?.latLng?.latitude);
  const longitude = finiteNumber(location?.latLng?.longitude);
  return latitude == null || longitude == null ? null : { lat: latitude, lng: longitude };
}

function toLegacyBounds(viewport: any) {
  const southwest = {
    lat: finiteNumber(viewport?.low?.latitude),
    lng: finiteNumber(viewport?.low?.longitude),
  };
  const northeast = {
    lat: finiteNumber(viewport?.high?.latitude),
    lng: finiteNumber(viewport?.high?.longitude),
  };
  if (southwest.lat == null || southwest.lng == null || northeast.lat == null || northeast.lng == null) return null;
  return { southwest, northeast };
}

export function adaptRoutesApiResponse(data: any) {
  const route = Array.isArray(data?.routes) ? data.routes[0] : null;
  if (!route) return null;

  const legs = Array.isArray(route.legs)
    ? route.legs.map((leg: any) => {
        const staticDuration = parseGoogleDurationSeconds(leg?.staticDuration);
        const trafficDuration = parseGoogleDurationSeconds(leg?.duration);
        return {
          startLocation: toLegacyLatLng(leg?.startLocation),
          endLocation: toLegacyLatLng(leg?.endLocation),
          distanceMeters: finiteNumber(leg?.distanceMeters),
          durationSeconds: staticDuration ?? trafficDuration,
          durationInTrafficSeconds: trafficDuration,
        };
      })
    : [];

  const legDistance = legs.reduce(
    (total: number, leg: any) => total + (typeof leg.distanceMeters === "number" ? leg.distanceMeters : 0),
    0,
  );
  const routeDistance = finiteNumber(route?.distanceMeters);

  return {
    overviewPolyline: typeof route?.polyline?.encodedPolyline === "string" ? route.polyline.encodedPolyline : "",
    bounds: toLegacyBounds(route?.viewport),
    legs,
    totalDistanceMeters: routeDistance ?? legDistance,
  };
}

type PlacesAutocompleteRequestInput = {
  input: string;
  components?: string;
  region?: string;
  language?: string;
  sessionToken?: string;
  location?: string;
  radius?: number;
  strictBounds?: boolean;
};

function componentRegions(components: string | undefined): string[] {
  if (!components) return [];
  return components
    .split("|")
    .map((part) => part.trim().toLowerCase().match(/^country:([a-z]{2})$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .slice(0, 15);
}

function parseLatLng(value: string | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function buildPlacesAutocompleteApiRequest(input: PlacesAutocompleteRequestInput) {
  const includedRegionCodes = componentRegions(input.components);
  const center = parseLatLng(input.location);
  const radius = typeof input.radius === "number" && Number.isFinite(input.radius)
    ? Math.min(50_000, Math.max(1, input.radius))
    : 50_000;
  const circle = center ? { circle: { center, radius } } : null;

  return {
    input: input.input.trim(),
    ...(input.language ? { languageCode: input.language } : {}),
    ...(input.region ? { regionCode: input.region } : {}),
    ...(includedRegionCodes.length ? { includedRegionCodes } : {}),
    ...(input.sessionToken ? { sessionToken: input.sessionToken } : {}),
    ...(circle ? (input.strictBounds ? { locationRestriction: circle } : { locationBias: circle }) : {}),
  };
}

export function adaptPlacesAutocompleteApiResponse(data: any) {
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  const predictions = suggestions
    .map((suggestion: any) => suggestion?.placePrediction)
    .filter(Boolean)
    .map((prediction: any) => ({
      description: typeof prediction?.text?.text === "string" ? prediction.text.text : "",
      placeId: typeof prediction?.placeId === "string" ? prediction.placeId : "",
    }))
    .filter((prediction: any) => prediction.description && prediction.placeId)
    .slice(0, 8);
  return { predictions };
}

export function buildPlaceDetailsApiUrl(placeId: string, options: { language?: string; region?: string; sessionToken?: string }) {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId.trim())}`);
  if (options.language) url.searchParams.set("languageCode", options.language);
  if (options.region) url.searchParams.set("regionCode", options.region);
  if (options.sessionToken) url.searchParams.set("sessionToken", options.sessionToken);
  return url.toString();
}

export function getGoogleApiError(data: any, fallback: string) {
  const status = typeof data?.error?.status === "string" ? data.error.status : "GOOGLE_API_ERROR";
  const message = typeof data?.error?.message === "string" ? data.error.message : fallback;
  return { error: status, message };
}
