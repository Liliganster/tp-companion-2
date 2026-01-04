import { exchangeCodeForTokens, getGoogleAccountEmail, verifySignedState } from "../../_utils/googleOAuth.js";
import { sendJson, supabaseGetGoogleConnection, supabaseUpsertGoogleConnection } from "../../_utils/supabase.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end();
    return;
  }

  const code = typeof req.query?.code === "string" ? req.query.code : null;
  const stateRaw = typeof req.query?.state === "string" ? req.query.state : null;
  if (!code || !stateRaw) return sendJson(res, 400, { error: "Missing code/state" });

  let state: any;
  try {
    state = verifySignedState(stateRaw);
  } catch (e: any) {
    return sendJson(res, 400, { error: e?.message ?? "Invalid state" });
  }

  if (!state?.userId || typeof state.userId !== "string") return sendJson(res, 400, { error: "Invalid state" });
  if (typeof state.exp === "number" && Date.now() > state.exp) return sendJson(res, 400, { error: "State expired" });

  const tokens = await exchangeCodeForTokens(code);
  const providerAccountEmail = await getGoogleAccountEmail(tokens.access_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const existing = await supabaseGetGoogleConnection(state.userId).catch(() => null);

  // Preserve refresh_token if Google doesn't send it again.
  let refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    refreshToken = existing?.refresh_token ?? undefined;
  }

  const existingScopes = typeof existing?.scopes === "string" ? existing.scopes : "";
  const nextScopes = Array.isArray(state.scopes) ? state.scopes : [];
  const mergedScopes = Array.from(
    new Set(
      [
        ...existingScopes.split(",").map((s) => s.trim()),
        ...nextScopes.map((s: any) => String(s).trim()),
      ].filter(Boolean),
    ),
  ).join(",");

  await supabaseUpsertGoogleConnection({
    userId: state.userId,
    providerAccountEmail: providerAccountEmail ?? undefined,
    refreshToken,
    accessToken: tokens.access_token,
    expiresAt,
    scopes: mergedScopes,
  });

  const rawReturnTo = typeof state.returnTo === "string" ? state.returnTo : "/";
  let returnTo = "/";
  if (rawReturnTo.startsWith("/")) {
    returnTo = rawReturnTo;
  } else {
    try {
      const url = new URL(rawReturnTo);
      if (url.protocol === "https:" || url.protocol === "http:") {
        returnTo = url.toString();
      }
    } catch {
      // ignore
    }
  }
  res.statusCode = 302;
  res.setHeader("Location", returnTo);
  res.end();
}
