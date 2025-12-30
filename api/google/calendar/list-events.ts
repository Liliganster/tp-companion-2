import { requireSupabaseUser, sendJson } from "../../_utils/supabase.js";
import { getGoogleAccessTokenForUser } from "../_utils.js";
import { enforceRateLimit } from "../../_utils/rateLimit.js";

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
    name: "google_calendar_list_events",
    identifier: user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!allowed) return;

  const timeMin = typeof req.query?.timeMin === "string" ? req.query.timeMin : null;
  const timeMax = typeof req.query?.timeMax === "string" ? req.query.timeMax : null;
  const calendarId = typeof req.query?.calendarId === "string" && req.query.calendarId.trim()
    ? req.query.calendarId.trim()
    : "primary";

  if (!timeMin || !timeMax) return sendJson(res, 400, { error: "timeMin/timeMax required" });

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "2500");

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
      calendarId,
      items: items.map((e: any) => ({
        id: e?.id ?? "",
        summary: e?.summary ?? "",
        location: e?.location ?? "",
        description: e?.description ?? "",
        start: e?.start ?? null,
        end: e?.end ?? null,
        htmlLink: e?.htmlLink ?? null,
      })),
    });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}
