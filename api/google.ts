/**
 * Consolidated router for all /api/google/* routes.
 * Routes are dispatched by URL path — handler logic is verbatim from original files.
 */

import { requireSupabaseUser, sendJson, supabaseGetGoogleConnection, supabaseUpsertGoogleConnection, supabaseDeleteGoogleConnection } from "./_utils/supabase.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { buildGoogleAuthUrl, buildSignedState, verifySignedState, exchangeCodeForTokens, getGoogleAccountEmail, refreshAccessToken } from "./_utils/googleOAuth.js";

// ─── shared helper (was google/_utils.ts) ───────────────────────────────────
async function getGoogleAccessTokenForUser(userId: string) {
  const row = await supabaseGetGoogleConnection(userId);
  const refreshToken = row?.refresh_token;
  if (!refreshToken) throw new Error("Google not connected");

  const storedAccessToken = typeof row?.access_token === "string" ? row.access_token : "";
  const storedExpiresAt = typeof row?.expires_at === "string" ? row.expires_at : "";

  if (storedAccessToken && storedExpiresAt) {
    const expiresMs = Date.parse(storedExpiresAt);
    if (Number.isFinite(expiresMs) && Date.now() + 60_000 < expiresMs) {
      return { accessToken: storedAccessToken, expiresAt: storedExpiresAt };
    }
  }

  const refreshed = await refreshAccessToken(refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabaseUpsertGoogleConnection({
    userId,
    providerAccountEmail: typeof row?.provider_account_email === "string" ? row.provider_account_email : undefined,
    refreshToken,
    accessToken: refreshed.access_token,
    expiresAt,
    scopes: typeof row?.scopes === "string" ? row.scopes : "",
  }).catch(() => null);

  return { accessToken: refreshed.access_token, expiresAt };
}

// ─── shared helpers ──────────────────────────────────────────────────────────
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
    case "at": case "de": return "de";
    case "es": return "es";
    case "it": return "it";
    case "fr": return "fr";
    case "pt": return "pt";
    case "nl": return "nl";
    case "gb": case "us": return "en";
    case "pl": return "pl";
    case "cz": return "cs";
    case "hu": return "hu";
    case "sk": return "sk";
    case "si": return "sl";
    case "hr": return "hr";
    default: return undefined;
  }
}

function getBody(req: any) {
  if (req?.body == null) return null;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

function badRequest(res: any, message: string) {
  res.statusCode = 400;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

function readBody(req: any) {
  if (req?.body == null) return null;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

// ─── /api/google/geocode ─────────────────────────────────────────────────────
async function handleGeocode(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_geocode", identifier: user.id, limit: 120, windowMs: 60_000 });
  if (!allowed) return;

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    res.statusCode = 500; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing GOOGLE_MAPS_SERVER_KEY" })); return;
  }

  const body = getBody(req);
  const address = body?.address;
  const region = normalizeRegion(body?.region) ?? regionFromComponents(body?.components);
  const components = typeof body?.components === "string" ? body.components : undefined;

  if (typeof address !== "string" || !address.trim()) return badRequest(res, "address is required");
  if (address.length > 220) return badRequest(res, "address too long");

  const params = new URLSearchParams({ address, key });
  const derivedLanguage = languageForRegion(region);
  if (derivedLanguage) params.set("language", derivedLanguage);
  if (region) params.set("region", region);
  if (components) params.set("components", components);

  const url = `${GOOGLE_BASE}/geocode/json?${params.toString()}`;
  const response = await fetch(url);
  const data: any = await response.json().catch(() => null);

  if (!response.ok || !data) {
    res.statusCode = 502; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to contact Google Geocoding API" })); return;
  }
  if (data.status !== "OK" || !data.results?.[0]) {
    res.statusCode = 400; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: data.status ?? "UNKNOWN", message: data.error_message })); return;
  }
  const result = data.results[0];
  res.statusCode = 200; res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ location: result?.geometry?.location ?? null, formattedAddress: result?.formatted_address ?? "", placeId: result?.place_id ?? "" }));
}

// ─── /api/google/directions ──────────────────────────────────────────────────
async function handleDirections(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_directions", identifier: user.id, limit: 60, windowMs: 60_000 });
  if (!allowed) return;

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    res.statusCode = 500; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing GOOGLE_MAPS_SERVER_KEY" })); return;
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

  const params = new URLSearchParams({ origin, destination, key, mode: "driving", units: "metric", departure_time: "now" });
  const derivedLanguage = languageForRegion(region);
  if (derivedLanguage) params.set("language", derivedLanguage);
  if (region) params.set("region", region);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));

  const url = `${GOOGLE_BASE}/directions/json?${params.toString()}`;
  const response = await fetch(url);
  const data: any = await response.json().catch(() => null);

  if (!response.ok || !data) {
    res.statusCode = 502; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to contact Google Directions API" })); return;
  }
  if (data.status !== "OK" || !data.routes?.[0]) {
    res.statusCode = 400; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: data.status ?? "UNKNOWN", message: data.error_message })); return;
  }

  const route = data.routes[0];
  const legs = Array.isArray(route.legs)
    ? route.legs.map((leg: any) => ({
        startLocation: leg?.start_location, endLocation: leg?.end_location,
        distanceMeters: typeof leg?.distance?.value === "number" ? leg.distance.value : null,
        durationSeconds: typeof leg?.duration?.value === "number" ? leg.duration.value : null,
        durationInTrafficSeconds: typeof leg?.duration_in_traffic?.value === "number" ? leg.duration_in_traffic.value : null,
      }))
    : [];
  const totalDistanceMeters = legs.reduce((acc: number, leg: any) => acc + (typeof leg?.distanceMeters === "number" ? leg.distanceMeters : 0), 0);

  res.statusCode = 200; res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ overviewPolyline: route?.overview_polyline?.points ?? "", bounds: route?.bounds ?? null, legs, totalDistanceMeters }));
}

// ─── /api/google/places-autocomplete ────────────────────────────────────────
async function handlePlacesAutocomplete(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_places_autocomplete", identifier: user.id, limit: 300, windowMs: 60_000 });
  if (!allowed) return;

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    res.statusCode = 500; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing GOOGLE_MAPS_SERVER_KEY" })); return;
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

  const params = new URLSearchParams({ input, key, types: "address" });
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
    res.statusCode = 502; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to contact Google Places API" })); return;
  }
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    res.statusCode = 400; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: data.status ?? "UNKNOWN", message: data.error_message })); return;
  }

  const predictions = Array.isArray(data.predictions)
    ? data.predictions.slice(0, 8).map((p: any) => ({ description: p?.description ?? "", placeId: p?.place_id ?? "" }))
    : [];
  res.statusCode = 200; res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ predictions }));
}

// ─── /api/google/place-details ───────────────────────────────────────────────
async function handlePlaceDetails(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_place_details", identifier: user.id, limit: 120, windowMs: 60_000 });
  if (!allowed) return;

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    res.statusCode = 500; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing GOOGLE_MAPS_SERVER_KEY" })); return;
  }

  const body = getBody(req);
  const placeId = body?.placeId;
  const region = normalizeRegion(body?.region);

  if (typeof placeId !== "string" || !placeId.trim()) return badRequest(res, "placeId is required");

  const params = new URLSearchParams({ place_id: placeId, key, fields: "formatted_address" });
  const derivedLanguage = languageForRegion(region);
  if (derivedLanguage) params.set("language", derivedLanguage);

  const url = `${GOOGLE_BASE}/place/details/json?${params.toString()}`;
  const response = await fetch(url);
  const data: any = await response.json().catch(() => null);

  if (!response.ok || !data) {
    res.statusCode = 502; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to contact Google Places API" })); return;
  }
  if (data.status !== "OK") {
    res.statusCode = 400; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: data.status ?? "UNKNOWN", message: data.error_message })); return;
  }
  res.statusCode = 200; res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ formattedAddress: data.result?.formatted_address ?? "" }));
}

// ─── /api/google/oauth/start ─────────────────────────────────────────────────
async function handleOAuthStart(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const protoRaw = req?.headers?.["x-forwarded-proto"] ?? req?.headers?.["x-forwarded-protocol"];
  const hostRaw = req?.headers?.["x-forwarded-host"] ?? req?.headers?.host;
  const proto = String(Array.isArray(protoRaw) ? protoRaw[0] : protoRaw || "https").split(",")[0].trim().toLowerCase();
  const host = String(Array.isArray(hostRaw) ? hostRaw[0] : hostRaw || "").split(",")[0].trim();
  const scheme = proto === "http" || proto === "https" ? proto : "https";
  const baseUrl = host ? `${scheme}://${host}` : "";

  const body = readBody(req);
  const rawReturnTo = typeof body?.returnTo === "string" ? body.returnTo : "/";
  const returnToPath = rawReturnTo.startsWith("/") ? rawReturnTo : "/";
  const returnTo = baseUrl ? `${baseUrl}${returnToPath}` : returnToPath;
  const scopes = Array.isArray(body?.scopes) ? body.scopes : [];

  const requested = new Set<string>();
  for (const s of scopes) {
    if (s === "calendar") requested.add("calendar");
    if (s === "drive") requested.add("drive");
  }

  const googleScopes = ["openid", "email", "profile"];
  if (requested.has("calendar")) {
    googleScopes.push("https://www.googleapis.com/auth/calendar.readonly");
    googleScopes.push("https://www.googleapis.com/auth/calendar.events");
  }
  if (requested.has("drive")) googleScopes.push("https://www.googleapis.com/auth/drive.file");

  const state = buildSignedState({
    userId: user.id,
    returnTo,
    scopes: [...requested],
    exp: Date.now() + 10 * 60 * 1000,
    nonce: Math.random().toString(16).slice(2),
  });

  const authUrl = buildGoogleAuthUrl({ scopes: googleScopes, state });
  sendJson(res, 200, { authUrl });
}

// ─── /api/google/oauth/callback ──────────────────────────────────────────────
async function handleOAuthCallback(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return;
  }

  const code = typeof req.query?.code === "string" ? req.query.code : null;
  const stateRaw = typeof req.query?.state === "string" ? req.query.state : null;
  if (!code || !stateRaw) return sendJson(res, 400, { error: "Missing code/state" });

  let state: any;
  try { state = verifySignedState(stateRaw); } catch (e: any) { return sendJson(res, 400, { error: e?.message ?? "Invalid state" }); }

  if (!state?.userId || typeof state.userId !== "string") return sendJson(res, 400, { error: "Invalid state" });
  if (typeof state.exp === "number" && Date.now() > state.exp) return sendJson(res, 400, { error: "State expired" });

  const tokens = await exchangeCodeForTokens(code);
  const providerAccountEmail = await getGoogleAccountEmail(tokens.access_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const existing = await supabaseGetGoogleConnection(state.userId).catch(() => null);
  let refreshToken = tokens.refresh_token;
  if (!refreshToken) refreshToken = existing?.refresh_token ?? undefined;

  const existingScopes = typeof existing?.scopes === "string" ? existing.scopes : "";
  const nextScopes = Array.isArray(state.scopes) ? state.scopes : [];
  const mergedScopes = Array.from(new Set([
    ...existingScopes.split(",").map((s) => s.trim()),
    ...nextScopes.map((s: any) => String(s).trim()),
  ].filter(Boolean))).join(",");

  await supabaseUpsertGoogleConnection({ userId: state.userId, providerAccountEmail: providerAccountEmail ?? undefined, refreshToken, accessToken: tokens.access_token, expiresAt, scopes: mergedScopes });

  const rawReturnTo = typeof state.returnTo === "string" ? state.returnTo : "/";
  let returnTo = "/";
  if (rawReturnTo.startsWith("/")) {
    returnTo = rawReturnTo;
  } else {
    try {
      const url = new URL(rawReturnTo);
      if (url.protocol === "https:" || url.protocol === "http:") returnTo = url.toString();
    } catch { /* ignore */ }
  }
  res.statusCode = 302; res.setHeader("Location", returnTo); res.end();
}

// ─── /api/google/oauth/status ────────────────────────────────────────────────
async function handleOAuthStatus(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const row = await supabaseGetGoogleConnection(user.id).catch(() => null);
  if (!row?.refresh_token) return sendJson(res, 200, { connected: false });
  sendJson(res, 200, { connected: true, email: row.provider_account_email ?? null, scopes: typeof row.scopes === "string" ? row.scopes : "" });
}

// ─── /api/google/oauth/disconnect ───────────────────────────────────────────
async function handleOAuthDisconnect(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  await supabaseDeleteGoogleConnection(user.id);
  return sendJson(res, 200, { ok: true });
}

// ─── /api/google/oauth/access-token ─────────────────────────────────────────
async function handleOAuthAccessToken(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_oauth_access_token", identifier: user.id, limit: 120, windowMs: 60_000 });
  if (!allowed) return;

  try {
    const { accessToken, expiresAt } = await getGoogleAccessTokenForUser(user.id);
    return sendJson(res, 200, { accessToken, expiresAt });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

// ─── /api/google/calendar/create-event ──────────────────────────────────────
async function handleCalendarCreateEvent(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_calendar_create_event", identifier: user.id, limit: 20, windowMs: 60_000 });
  if (!allowed) return;

  const body = readBody(req);
  const calendarId = typeof body?.calendarId === "string" && body.calendarId.trim() ? body.calendarId.trim() : "primary";
  const summary = typeof body?.summary === "string" ? body.summary : "";
  const description = typeof body?.description === "string" ? body.description : "";
  const location = typeof body?.location === "string" ? body.location : "";
  const start = typeof body?.start === "string" ? body.start : "";
  const end = typeof body?.end === "string" ? body.end : "";

  if (!summary.trim() || !start || !end) return sendJson(res, 400, { error: "summary/start/end required" });

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ summary, description, location, start: { dateTime: start }, end: { dateTime: end } }),
    });
    const data: any = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 400, { error: "calendar_error", message: data?.error?.message });
    return sendJson(res, 200, { id: data?.id, htmlLink: data?.htmlLink });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

// ─── /api/google/calendar/list-calendars ────────────────────────────────────
async function handleCalendarListCalendars(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_calendar_list_calendars", identifier: user.id, limit: 30, windowMs: 60_000 });
  if (!allowed) return;

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
    const data: any = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 400, { error: "calendar_error", message: data?.error?.message });
    const items = Array.isArray(data?.items) ? data.items : [];
    return sendJson(res, 200, { items: items.map((c: any) => ({ id: String(c?.id ?? ""), summary: String(c?.summary ?? ""), primary: Boolean(c?.primary), accessRole: String(c?.accessRole ?? "") })) });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

// ─── /api/google/calendar/list-events ───────────────────────────────────────
async function handleCalendarListEvents(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_calendar_list_events", identifier: user.id, limit: 20, windowMs: 60_000 });
  if (!allowed) return;

  const timeMin = typeof req.query?.timeMin === "string" ? req.query.timeMin : null;
  const timeMax = typeof req.query?.timeMax === "string" ? req.query.timeMax : null;
  const calendarId = typeof req.query?.calendarId === "string" && req.query.calendarId.trim() ? req.query.calendarId.trim() : "primary";
  if (!timeMin || !timeMax) return sendJson(res, 400, { error: "timeMin/timeMax required" });

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "2500");
    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } });
    const data: any = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 400, { error: "calendar_error", message: data?.error?.message });
    const items = Array.isArray(data?.items) ? data.items : [];
    return sendJson(res, 200, { calendarId, items: items.map((e: any) => ({ id: e?.id ?? "", summary: e?.summary ?? "", location: e?.location ?? "", description: e?.description ?? "", start: e?.start ?? null, end: e?.end ?? null, htmlLink: e?.htmlLink ?? null })) });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

// ─── /api/google/drive/download ──────────────────────────────────────────────
async function handleDriveDownload(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_drive_download", identifier: user.id, limit: 60, windowMs: 60_000 });
  if (!allowed) return;

  const fileId = typeof req.query?.fileId === "string" ? req.query.fileId : "";
  const name = typeof req.query?.name === "string" ? req.query.name : "document";
  const exportMimeType = typeof req.query?.exportMimeType === "string" ? req.query.exportMimeType : "";
  if (!fileId) return sendJson(res, 400, { error: "fileId required" });

  function safeFilename(input: string) {
    const cleaned = String(input ?? "document").replace(/[\r\n]/g, "").replace(/["]/g, "").replace(/[\\\/]/g, "_").trim();
    const n = cleaned || "document";
    return n.length > 150 ? n.slice(0, 150) : n;
  }

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);
    const isExport = Boolean(exportMimeType);
    const url = isExport
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType)}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return sendJson(res, 400, { error: "drive_error", message: text });
    }
    res.statusCode = 200;
    const outName = exportMimeType === "text/csv" && !String(name).toLowerCase().endsWith(".csv") ? `${name}.csv` : name;
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(outName)}"`);
    res.setHeader("Content-Type", exportMimeType || response.headers.get("content-type") || "application/octet-stream");
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

// ─── /api/google/drive/upload ────────────────────────────────────────────────
async function handleDriveUpload(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return;
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({ req, res, name: "google_drive_upload", identifier: user.id, limit: 20, windowMs: 60_000 });
  if (!allowed) return;

  const body = readBody(req);
  const name = typeof body?.name === "string" ? body.name : "document";
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  if (!dataUrl) return sendJson(res, 400, { error: "dataUrl required" });

  function parseDataUrl(du: string) {
    const match = du.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mime: match[1], b64: match[2] };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return sendJson(res, 400, { error: "invalid dataUrl" });
  if (parsed.b64.length > 4_200_000) return sendJson(res, 413, { error: "file too large" });

  let buffer: Buffer;
  try { buffer = Buffer.from(parsed.b64, "base64"); } catch { return sendJson(res, 400, { error: "invalid base64" }); }

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);
    const boundary = `----fbp_${Math.random().toString(16).slice(2)}`;
    const metadata = { name };
    const pre = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${parsed.mime}\r\n\r\n`, "utf8");
    const post = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const bodyBuffer = Buffer.concat([pre, buffer, post]);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: bodyBuffer,
    });
    const data: any = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 400, { error: "drive_error", message: data?.error?.message });
    return sendJson(res, 200, { fileId: data?.id, name: data?.name, mimeType: data?.mimeType });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

// ─── Main router ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");

  if (path === "/api/google/geocode")                     return handleGeocode(req, res);
  if (path === "/api/google/directions")                  return handleDirections(req, res);
  if (path === "/api/google/places-autocomplete")         return handlePlacesAutocomplete(req, res);
  if (path === "/api/google/place-details")               return handlePlaceDetails(req, res);
  if (path === "/api/google/oauth/start")                 return handleOAuthStart(req, res);
  if (path === "/api/google/oauth/callback")              return handleOAuthCallback(req, res);
  if (path === "/api/google/oauth/status")                return handleOAuthStatus(req, res);
  if (path === "/api/google/oauth/disconnect")            return handleOAuthDisconnect(req, res);
  if (path === "/api/google/oauth/access-token")          return handleOAuthAccessToken(req, res);
  if (path === "/api/google/calendar/create-event")       return handleCalendarCreateEvent(req, res);
  if (path === "/api/google/calendar/list-calendars")     return handleCalendarListCalendars(req, res);
  if (path === "/api/google/calendar/list-events")        return handleCalendarListEvents(req, res);
  if (path === "/api/google/drive/download")              return handleDriveDownload(req, res);
  if (path === "/api/google/drive/upload")                return handleDriveUpload(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found" }));
}
