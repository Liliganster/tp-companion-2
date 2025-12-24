import { requireSupabaseUser, sendJson } from "../../_utils/supabase.js";
import { buildGoogleAuthUrl, buildSignedState } from "../../_utils/googleOAuth.js";

function readBody(req: any) {
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const body = readBody(req);
  const returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/";
  const scopes = Array.isArray(body?.scopes) ? body.scopes : [];

  const requested = new Set<string>();
  for (const s of scopes) {
    if (s === "calendar") requested.add("calendar");
    if (s === "drive") requested.add("drive");
  }

  // Minimal scopes
  const googleScopes = ["openid", "email", "profile"];
  if (requested.has("calendar")) {
    // Needed for calendarList + reading events across calendars
    googleScopes.push("https://www.googleapis.com/auth/calendar.readonly");
    // Needed to create events
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

