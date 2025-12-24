import { requireSupabaseUser, sendJson } from "../../_utils/supabase.js";
import { supabaseDeleteGoogleConnection } from "../../_utils/supabase.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  await supabaseDeleteGoogleConnection(user.id);
  return sendJson(res, 200, { ok: true });
}
