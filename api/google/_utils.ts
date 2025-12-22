import { refreshAccessToken } from "../_utils/googleOAuth";
import { supabaseGetGoogleConnection } from "../_utils/supabase";

export async function getGoogleAccessTokenForUser(userId: string) {
  const row = await supabaseGetGoogleConnection(userId);
  const refreshToken = row?.refresh_token;
  if (!refreshToken) throw new Error("Google not connected");

  const refreshed = await refreshAccessToken(refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  return { accessToken: refreshed.access_token, expiresAt };
}

