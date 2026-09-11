import { supabaseAdmin } from '../../src/lib/supabaseServer.js';
import { assertStorageOwnership } from './storageOwnership.js';
import { toStorageFileName } from '../../src/lib/uploadFileName.js';

export class CallsheetUploadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function ownedJob(userId: string, jobId: string) {
  const { data, error } = await supabaseAdmin.from('callsheet_jobs')
    .select('id, status, storage_path').eq('id', jobId).eq('user_id', userId).maybeSingle();
  if (error) throw new CallsheetUploadError(503, 'No se pudo consultar el documento.');
  if (!data) throw new CallsheetUploadError(404, 'Documento no encontrado.');
  return data;
}

export async function signRegisteredCallsheetUpload(userId: string, jobId: string, filename: string) {
  const job = await ownedJob(userId, jobId);
  const path = `${userId}/${jobId}/${toStorageFileName(filename)}`;
  if (job.status !== 'created' || job.storage_path !== path) throw new CallsheetUploadError(409, 'El documento ya cambió de estado o de ruta.');
  const signed = await supabaseAdmin.storage.from('callsheets').createSignedUploadUrl(path);
  if (signed.error || !signed.data?.signedUrl) throw new CallsheetUploadError(503, 'No se pudo preparar la subida.');
  return { jobId, path, uploadUrl: signed.data.signedUrl };
}

export async function finalizeRegisteredCallsheetUpload(userId: string, jobId: string, size?: number, enqueue = true) {
  const job = await ownedJob(userId, jobId);
  if (['queued', 'processing', 'done', 'needs_review'].includes(job.status)) return { ok: true, jobId, status: job.status, alreadyQueued: true };
  if (!['created', 'failed'].includes(job.status)) throw new CallsheetUploadError(409, 'La carga está cancelada o no se puede poner en cola.');
  const info = await supabaseAdmin.storage.from('callsheets').info(job.storage_path);
  if (info.error) {
    const missing = String(info.error.statusCode) === '404';
    throw new CallsheetUploadError(missing ? 409 : 503, missing ? 'El archivo todavía no está en el almacenamiento.' : 'No se pudo verificar el archivo subido.');
  }
  await assertStorageOwnership(userId, 'callsheets', job.storage_path);
  if (size !== undefined && info.data.size !== size) throw new CallsheetUploadError(409, 'El archivo subido está incompleto.');
  const status = enqueue ? 'queued' : 'created';
  const saved = await supabaseAdmin.from('callsheet_jobs').update({ status, needs_review_reason: null })
    .eq('id', jobId).eq('user_id', userId).in('status', ['created', 'failed']).select('status').maybeSingle();
  if (saved.error) throw new CallsheetUploadError(503, 'No se pudo confirmar la subida. El archivo se conserva.');
  if (!saved.data) {
    const latest = await ownedJob(userId, jobId);
    if (['queued', 'processing', 'done', 'needs_review'].includes(latest.status)) return { ok: true, jobId, status: latest.status, alreadyQueued: true };
    throw new CallsheetUploadError(409, 'La carga cambió de estado.');
  }
  return { ok: true, jobId, status: saved.data.status };
}

export async function recordRegisteredUploadFailure(userId: string, jobId: string, reason: string) {
  const result = await supabaseAdmin.from('callsheet_jobs').update({ status: 'failed', needs_review_reason: reason })
    .eq('id', jobId).eq('user_id', userId).eq('status', 'created');
  if (result.error) throw new CallsheetUploadError(503, 'No se pudo registrar el fallo de subida.');
}
