import { requireSupabaseUser, sendJson } from "../../_utils/supabase";
import { getGoogleAccessTokenForUser } from "../_utils";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const fileId = typeof req.query?.fileId === "string" ? req.query.fileId : "";
  const name = typeof req.query?.name === "string" ? req.query.name : "document";
  if (!fileId) return sendJson(res, 400, { error: "fileId required" });

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return sendJson(res, 400, { error: "drive_error", message: text });
    }

    res.statusCode = 200;
    res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/\"/g, "")}"`);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");

    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}

