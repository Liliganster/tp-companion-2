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
  const input = body?.input;
  const language = typeof body?.language === "string" ? body.language : undefined;

  if (typeof input !== "string" || !input.trim()) return badRequest(res, "input is required");
  if (input.length > 120) return badRequest(res, "input too long");

  const params = new URLSearchParams({
    input,
    key,
    types: "address",
  });
  if (language) params.set("language", language);

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

