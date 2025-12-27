import { refreshAccessToken } from "../_utils/googleOAuth.js";
import { supabaseGetGoogleConnection, supabaseUpsertGoogleConnection } from "../_utils/supabase.js";

export async function getGoogleAccessTokenForUser(userId: string) {
  const row = await supabaseGetGoogleConnection(userId);
  const refreshToken = row?.refresh_token;
  if (!refreshToken) throw new Error("Google not connected");

  const storedAccessToken = typeof row?.access_token === "string" ? row.access_token : "";
  const storedExpiresAt = typeof row?.expires_at === "string" ? row.expires_at : "";

  if (storedAccessToken && storedExpiresAt) {
    const expiresMs = Date.parse(storedExpiresAt);
    // Keep a small buffer so we don't start a request with a nearly-expired token.
    if (Number.isFinite(expiresMs) && Date.now() + 60_000 < expiresMs) {
      return { accessToken: storedAccessToken, expiresAt: storedExpiresAt };
    }
  }

  const refreshed = await refreshAccessToken(refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  // Best-effort persist, so subsequent calls don't refresh again.
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
