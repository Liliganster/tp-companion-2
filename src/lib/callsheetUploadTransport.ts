import type { SupabaseClient } from '@supabase/supabase-js';

class UploadHttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

// Only idempotent upload/queue operations use this retry. Never invokes the AI.
async function uploadRequest(url: string, init: RequestInit, cancelled = () => false) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (cancelled()) throw new Error('Carga interrumpida');
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new UploadHttpError(response.status, payload.message || payload.error || `HTTP ${response.status}`, payload.code);
      return payload;
    } catch (error) {
      const retryable = !(error instanceof UploadHttpError) || error.status >= 500;
      if (attempt || !retryable || cancelled()) throw error;
    }
  }
  throw new Error('upload_unavailable');
}

async function authorization(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.');
  return { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
}

export async function uploadSignedCallsheet(client: SupabaseClient, jobId: string, filename: string, path: string, body: Blob, cancelled = () => false) {
  const signed = await uploadRequest('/api/callsheets/create-upload', {
    method: 'POST', headers: await authorization(client),
    body: JSON.stringify({ jobId, filename, size: body.size, contentType: body.type }),
  }, cancelled);
  if (signed.path !== path || !signed.uploadUrl) throw new Error('La ruta de subida no coincide con el documento.');
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', body);
  try {
    await uploadRequest(signed.uploadUrl, { method: 'PUT', body: form }, cancelled);
  } catch (error) {
    // A lost success response may make the same-key retry report a duplicate.
    // The server must verify the existing object's owner and size before queueing.
    if (!(error instanceof UploadHttpError) || (error.status !== 409 && error.code !== 'KeyAlreadyExists')) throw error;
  }
}

export async function finalizeCallsheetUpload(client: SupabaseClient, jobId: string, size: number, enqueue = true, cancelled = () => false) {
  return uploadRequest('/api/callsheets/queue', {
    method: 'POST', headers: await authorization(client), body: JSON.stringify({ jobId, size, enqueue }),
  }, cancelled);
}

export async function recordCallsheetUploadFailure(client: SupabaseClient, jobId: string, reason: string) {
  return uploadRequest('/api/callsheets/upload-failed', {
    method: 'POST', headers: await authorization(client), body: JSON.stringify({ jobId, reason: reason.slice(0, 300) }),
  });
}
