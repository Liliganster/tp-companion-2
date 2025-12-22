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

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  return { mime, b64 };
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
  const name = typeof body?.name === "string" ? body.name : "document";
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";

  if (!dataUrl) return sendJson(res, 400, { error: "dataUrl required" });

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return sendJson(res, 400, { error: "invalid dataUrl" });

  // ~3MB max raw (Vercel/serverless friendly)
  if (parsed.b64.length > 4_200_000) return sendJson(res, 413, { error: "file too large" });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(parsed.b64, "base64");
  } catch {
    return sendJson(res, 400, { error: "invalid base64" });
  }

  try {
    const { accessToken } = await getGoogleAccessTokenForUser(user.id);

    const boundary = `----fbp_${Math.random().toString(16).slice(2)}`;
    const metadata = { name };

    const pre = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${parsed.mime}\r\n\r\n`,
      "utf8",
    );
    const post = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const bodyBuffer = Buffer.concat([pre, buffer, post]);

    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });

    const data: any = await response.json().catch(() => null);
    if (!response.ok) {
      return sendJson(res, 400, { error: "drive_error", message: data?.error?.message });
    }

    return sendJson(res, 200, { fileId: data?.id, name: data?.name, mimeType: data?.mimeType });
  } catch (e: any) {
    return sendJson(res, 400, { error: "not_connected", message: e?.message ?? "Google not connected" });
  }
}
