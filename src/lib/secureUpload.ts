import { supabase } from "./supabaseClient";
import { validateUploadBytes, validateUploadMetadata, type UploadBucket } from "./uploadPolicy";

export async function secureUpload(bucket: UploadBucket, path: string, file: Blob): Promise<void> {
  const mime = validateUploadMetadata(bucket, path, file.type, file.size);
  validateUploadBytes(new Uint8Array(await file.arrayBuffer()), mime);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Vuelve a iniciar sesión para subir archivos.");
  const call = async (action: string, body: unknown) => {
    const response = await fetch(`/api/callsheets/upload-${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "No se pudo subir el archivo.");
    return result;
  };
  const prepared = await call("prepare", { bucket, path, contentType: mime, size: file.size });
  const { error } = await supabase.storage.from("upload_quarantine").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: mime });
  if (error) throw error;
  await call("finalize", { ticket: prepared.ticket });
}
