import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { UPLOAD_LIMITS, validateUploadBytes, validateUploadMetadata, type UploadBucket } from "../../src/lib/uploadPolicy.js";
import { requireSupabaseUser, sendJson } from "./supabase.js";
import { enforceRateLimit } from "./rateLimit.js";

const STAGING = "upload_quarantine";
type Ticket = { userId: string; bucket: UploadBucket; path: string; staging: string; mime: string; size: number; expires: number };
function sign(value: string): Buffer {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update("upload-v1:" + value).digest();
}
export function encodeUploadTicket(ticket: Ticket): string {
  const value = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${value}.${sign(value).toString("base64url")}`;
}
export function decodeUploadTicket(token: string, userId: string): Ticket {
  if (typeof token !== "string" || token.length > 4096) throw new Error("Autorización de subida inválida.");
  const parts = token.split(".");
  const signature = Buffer.from(parts[1] || "", "base64url");
  const expected = sign(parts[0]);
  if (parts.length !== 2 || signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error("Autorización de subida inválida.");
  const ticket = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Ticket;
  if (ticket.userId !== userId || ticket.expires < Date.now()) throw new Error("La autorización de subida ha caducado o pertenece a otra cuenta.");
  return ticket;
}

export async function handleSecureUpload(req: any, res: any, finalize: boolean) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  const allowed = await enforceRateLimit({ req, res, name: finalize ? "upload-finalize" : "upload-prepare", limit: 30, windowMs: 60_000, identifier: user.id });
  if (!allowed) return;
  res.setHeader("Cache-Control", "no-store");
  let cleanupPath: string | undefined;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!finalize) {
      const { bucket, path, contentType, size } = body ?? {};
      if (bucket !== "callsheets" && bucket !== "project_documents") throw new Error("Destino no permitido.");
      if (typeof path !== "string" || path.length > 350 || !path.startsWith(user.id + "/") || path.split("/").some((part: string) => !part || part === "." || part === "..") || /[\\\x00-\x1f?#%]/.test(path)) throw new Error("Ruta de archivo inválida.");
      if (typeof contentType !== "string") throw new Error("Falta el tipo de archivo.");
      const mime = validateUploadMetadata(bucket, path, contentType, size);
      if (bucket === "callsheets") {
        const jobId = path.split("/")[1];
        if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Documento inválido.");
        const { data, error } = await supabaseAdmin.from("callsheet_jobs").select("id").eq("id", jobId).eq("user_id", user.id).maybeSingle();
        if (error || !data) throw new Error("Documento no encontrado.");
      }
      // Opportunistic cleanup of abandoned signed uploads after their 2h URL lifetime.
      const { data: oldFiles } = await supabaseAdmin.storage.from(STAGING).list(user.id, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
      const expired = (oldFiles ?? []).filter(f => f.created_at && Date.parse(f.created_at) < Date.now() - 3 * 60 * 60_000).map(f => `${user.id}/${f.name}`);
      if (expired.length) await supabaseAdmin.storage.from(STAGING).remove(expired);
      const staging = `${user.id}/${randomUUID()}.${path.split(".").pop()!.toLowerCase()}`;
      const { data, error } = await supabaseAdmin.storage.from(STAGING).createSignedUploadUrl(staging, { upsert: false });
      if (error || !data) throw new Error("No se pudo preparar la subida.");
      const ticket = encodeUploadTicket({ userId: user.id, bucket, path, staging, mime, size, expires: Date.now() + 30 * 60_000 });
      return sendJson(res, 200, { token: data.token, path: staging, ticket });
    }
    const ticket = decodeUploadTicket(body?.ticket, user.id);
    cleanupPath = ticket.staging;
    const { data: file, error } = await supabaseAdmin.storage.from(STAGING).download(ticket.staging);
    if (error || !file) throw new Error("No se encontró la subida temporal. Vuelve a intentarlo.");
    if (file.size !== ticket.size || file.size > UPLOAD_LIMITS[ticket.bucket]) throw new Error("El tamaño del archivo no coincide con el autorizado.");
    validateUploadMetadata(ticket.bucket, ticket.path, file.type, file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    validateUploadBytes(bytes, ticket.mime);
    // Upload the exact validated buffer. No mutable staging object is copied or moved.
    const { error: saveError } = await supabaseAdmin.storage.from(ticket.bucket).upload(ticket.path, bytes, { contentType: ticket.mime, upsert: false });
    if (saveError) throw new Error("No se pudo guardar el archivo validado. No se sobrescribió ningún documento.");
    return sendJson(res, 200, { path: ticket.path });
  } catch (error) {
    return sendJson(res, 400, { error: "upload_rejected", message: error instanceof Error ? error.message : "Archivo rechazado." });
  } finally {
    if (cleanupPath) await supabaseAdmin.storage.from(STAGING).remove([cleanupPath]).catch(() => undefined);
  }
}
