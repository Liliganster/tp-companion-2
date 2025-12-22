import crypto from "crypto";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI;
const STATE_SECRET = process.env.GOOGLE_OAUTH_STATE_SECRET;

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlJson(obj: unknown) {
  return base64url(JSON.stringify(obj));
}

function hmac(data: string) {
  if (!STATE_SECRET) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET");
  return base64url(crypto.createHmac("sha256", STATE_SECRET).update(data).digest());
}

export function buildSignedState(payload: Record<string, unknown>) {
  const body = base64urlJson(payload);
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verifySignedState<T extends Record<string, unknown>>(state: string): T {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Invalid state");
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid state");
  const json = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json) as T;
}

export function requireGoogleOAuthEnv() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET or GOOGLE_OAUTH_REDIRECT_URI");
  }
  if (!STATE_SECRET) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET");
  return { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI };
}

export function buildGoogleAuthUrl(params: {
  scopes: string[];
  state: string;
}) {
  const { CLIENT_ID, REDIRECT_URI } = requireGoogleOAuthEnv();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeCodeForTokens(code: string) {
  const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = requireGoogleOAuthEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !data?.access_token) {
    const err = data as any;
    throw new Error(err?.error_description || err?.error || "Token exchange failed");
  }
  return data;
}

export async function refreshAccessToken(refreshToken: string) {
  const { CLIENT_ID, CLIENT_SECRET } = requireGoogleOAuthEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !data?.access_token) {
    const err = data as any;
    throw new Error(err?.error_description || err?.error || "Token refresh failed");
  }
  return data;
}

export async function getGoogleAccountEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data) return null;
  if (typeof data.email === "string") return data.email;
  return null;
}

