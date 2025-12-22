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
    const placeId = body?.placeId;
    const language = typeof body?.language === "string" ? body.language : undefined;

    if (typeof placeId !== "string" || !placeId.trim()) return badRequest(res, "placeId is required");

    const params = new URLSearchParams({
        place_id: placeId,
        key,
        fields: "formatted_address",
    });
    if (language) params.set("language", language);

    const url = `${GOOGLE_BASE}/place/details/json?${params.toString()}`;
    const response = await fetch(url);
    const data: any = await response.json().catch(() => null);

    if (!response.ok || !data) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Failed to contact Google Places API" }));
        return;
    }

    if (data.status !== "OK") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: data.status ?? "UNKNOWN", message: data.error_message }));
        return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
        formattedAddress: data.result?.formatted_address ?? ""
    }));
}
