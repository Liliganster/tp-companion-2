import { requireSupabaseUser, sendJson } from "../../_utils/supabase.js";
import { getGoogleAccessTokenForUser } from "../_utils.js";
import { enforceRateLimit } from "../../_utils/rateLimit.js";

function safeFilename(input: string) {
  const cleaned = String(input ?? "document")
    .replace(/[\r\n]/g, "")
    .replace(/["]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  const name = cleaned || "document";
  return name.length > 150 ? name.slice(0, 150) : name;
}

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
    name: "google_drive_download",
    identifier: user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!allowed) return;

  const fileId = typeof req.query?.fileId === "string" ? req.query.fileId : "";
  const name = typeof req.query?.name === "string" ? req.query.name : "document";
  const exportMimeType = typeof req.query?.exportMimeType === "string" ? req.query.exportMimeType : "";
  if (!fileId) return sendJson(res, 400, { error: "fileId required" });

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);
    const isExport = Boolean(exportMimeType);
    const url = isExport
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType)}`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return sendJson(res, 400, { error: "drive_error", message: text });
    }

    res.statusCode = 200;
    const outName =
      exportMimeType === "text/csv" && !String(name).toLowerCase().endsWith(".csv") ? `${name}.csv` : name;
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename(outName)}"`);
    res.setHeader("Content-Type", exportMimeType || response.headers.get("content-type") || "application/octet-stream");

    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}
