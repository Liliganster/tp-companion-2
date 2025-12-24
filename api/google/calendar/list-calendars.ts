import { requireSupabaseUser, sendJson } from "../../_utils/supabase.js";
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

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);

    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data: any = await response.json().catch(() => null);
    if (!response.ok) {
      return sendJson(res, 400, { error: "calendar_error", message: data?.error?.message });
    }

    const items = Array.isArray(data?.items) ? data.items : [];

    return sendJson(res, 200, {
      items: items.map((c: any) => ({
        id: String(c?.id ?? ""),
        summary: String(c?.summary ?? ""),
        primary: Boolean(c?.primary),
        accessRole: String(c?.accessRole ?? ""),
      })),
    });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}
