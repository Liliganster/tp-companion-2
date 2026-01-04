import { requireSupabaseUser, sendJson } from "../../_utils/supabase.js";
import { enforceRateLimit } from "../../_utils/rateLimit.js";
import { getGoogleAccessTokenForUser } from "../_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const allowed = await enforceRateLimit({
    req,
    res,
    name: "google_oauth_access_token",
    identifier: user.id,
    limit: 120,
    windowMs: 60_000,
  });
  if (!allowed) return;

  try {
    const { accessToken, expiresAt } = await getGoogleAccessTokenForUser(user.id);
    return sendJson(res, 200, { accessToken, expiresAt });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

