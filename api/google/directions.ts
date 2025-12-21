const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";

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
  const language = typeof body?.language === "string" ? body.language : undefined;

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
  });
  if (language) params.set("language", language);
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
      }))
    : [];

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      overviewPolyline: route?.overview_polyline?.points ?? "",
      bounds: route?.bounds ?? null,
      legs,
    }),
  );
}

