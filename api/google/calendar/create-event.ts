import { requireSupabaseUser, sendJson } from "../../_utils/supabase.js";
import { getGoogleAccessTokenForUser } from "../_utils.js";

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
  const summary = typeof body?.summary === "string" ? body.summary : "";
  const description = typeof body?.description === "string" ? body.description : "";
  const location = typeof body?.location === "string" ? body.location : "";
  const start = typeof body?.start === "string" ? body.start : "";
  const end = typeof body?.end === "string" ? body.end : "";

  if (!summary.trim() || !start || !end) return sendJson(res, 400, { error: "summary/start/end required" });

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);

    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        location,
        start: { dateTime: start },
        end: { dateTime: end },
      }),
    });
    const data: any = await response.json().catch(() => null);
    if (!response.ok) {
      return sendJson(res, 400, { error: "calendar_error", message: data?.error?.message });
    }
    return sendJson(res, 200, { id: data?.id, htmlLink: data?.htmlLink });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

