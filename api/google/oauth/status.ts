import { requireSupabaseUser, sendJson, supabaseGetGoogleConnection } from "../../_utils/supabase.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const row = await supabaseGetGoogleConnection(user.id).catch(() => null);
  if (!row?.refresh_token) return sendJson(res, 200, { connected: false });

  sendJson(res, 200, {
    connected: true,
    email: row.provider_account_email ?? null,
    scopes: typeof row.scopes === "string" ? row.scopes : "",
  });
}

