import { requireSupabaseUser } from "../_utils/supabase.js";

const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";

function normalizeRegion(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function regionFromComponents(components: unknown) {
  if (typeof components !== "string") return undefined;
  const match = components.toLowerCase().match(/(?:^|\|)country:([a-z]{2})(?:$|\|)/);
  return match?.[1] ?? undefined;
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

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing GOOGLE_MAPS_SERVER_KEY" }));
    return;
  }

  const body = getBody(req);
  const input = body?.input;
  const components = typeof body?.components === "string" ? body.components : undefined;
  const region = normalizeRegion(body?.region) ?? regionFromComponents(components);
  const sessiontoken = typeof body?.sessiontoken === "string" ? body.sessiontoken : undefined;
  const location = typeof body?.location === "string" ? body.location : undefined;
  const radius = typeof body?.radius === "number" ? body.radius : undefined;
  const strictbounds = body?.strictbounds === true;

  if (typeof input !== "string" || !input.trim()) return badRequest(res, "input is required");
  if (input.length > 120) return badRequest(res, "input too long");

  const params = new URLSearchParams({
    input,
    key,
    types: "address",
  });
  const derivedLanguage = languageForRegion(region);
  if (derivedLanguage) params.set("language", derivedLanguage);
  if (components) params.set("components", components);
  if (region) params.set("region", region);
  if (sessiontoken) params.set("sessiontoken", sessiontoken);
  if (location) params.set("location", location);
  if (radius) params.set("radius", String(radius));
  if (strictbounds) params.set("strictbounds", "true");

  const url = `${GOOGLE_BASE}/place/autocomplete/json?${params.toString()}`;
  const response = await fetch(url);
  const data: any = await response.json().catch(() => null);

  if (!response.ok || !data) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to contact Google Places API" }));
    return;
  }

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: data.status ?? "UNKNOWN", message: data.error_message }));
    return;
  }

  const predictions = Array.isArray(data.predictions)
    ? data.predictions.slice(0, 8).map((p: any) => ({
        description: p?.description ?? "",
        placeId: p?.place_id ?? "",
      }))
    : [];

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ predictions }));
}
