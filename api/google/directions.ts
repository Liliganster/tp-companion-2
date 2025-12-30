import { requireSupabaseUser } from "../_utils/supabase.js";
import { enforceRateLimit } from "../_utils/rateLimit.js";

const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";

function normalizeRegion(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function languageForRegion(region: string | undefined) {
  switch ((region ?? "").toLowerCase()) {
    case "at":
    case "de":
      return "de";
    case "es":
      return "es";
    case "it":
      return "it";
    case "fr":
      return "fr";
    case "pt":
      return "pt";
    case "nl":
      return "nl";
    case "gb":
    case "us":
      return "en";
    case "pl":
      return "pl";
    case "cz":
      return "cs";
    case "hu":
      return "hu";
    case "sk":
      return "sk";
    case "si":
      return "sl";
    case "hr":
      return "hr";
    default:
      return undefined;
  }
}

function getBody(req: any) {
  if (req?.body == null) return null;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

function badRequest(res: any, message: string) {
  res.statusCode = 400;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({
    req,
    res,
    name: "google_directions",
    identifier: user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!allowed) return;

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing GOOGLE_MAPS_SERVER_KEY" }));
    return;
  }

  const body = getBody(req);
  const origin = body?.origin;
  const destination = body?.destination;
  const waypoints = Array.isArray(body?.waypoints) ? body.waypoints : [];
  const region = normalizeRegion(body?.region);

  if (typeof origin !== "string" || !origin.trim()) return badRequest(res, "origin is required");
  if (typeof destination !== "string" || !destination.trim()) return badRequest(res, "destination is required");
  if (waypoints.some((w: any) => typeof w !== "string")) return badRequest(res, "waypoints must be string[]");

  if (origin.length > 180 || destination.length > 180) return badRequest(res, "origin/destination too long");
  if (waypoints.length > 8) return badRequest(res, "too many waypoints");

  const params = new URLSearchParams({
    origin,
    destination,
    key,
    mode: "driving",
    units: "metric",
  });
  const derivedLanguage = languageForRegion(region);
  if (derivedLanguage) params.set("language", derivedLanguage);
  if (region) params.set("region", region);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));

  const url = `${GOOGLE_BASE}/directions/json?${params.toString()}`;
  const response = await fetch(url);
  const data: any = await response.json().catch(() => null);

  if (!response.ok || !data) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to contact Google Directions API" }));
    return;
  }

  if (data.status !== "OK" || !data.routes?.[0]) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: data.status ?? "UNKNOWN", message: data.error_message }));
    return;
  }

  const route = data.routes[0];
  const legs = Array.isArray(route.legs)
    ? route.legs.map((leg: any) => ({
        startLocation: leg?.start_location,
        endLocation: leg?.end_location,
        distanceMeters: typeof leg?.distance?.value === "number" ? leg.distance.value : null,
        durationSeconds: typeof leg?.duration?.value === "number" ? leg.duration.value : null,
      }))
    : [];

  const totalDistanceMeters = legs.reduce((acc: number, leg: any) => acc + (typeof leg?.distanceMeters === "number" ? leg.distanceMeters : 0), 0);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      overviewPolyline: route?.overview_polyline?.points ?? "",
      bounds: route?.bounds ?? null,
      legs,
      totalDistanceMeters,
    }),
  );
}
