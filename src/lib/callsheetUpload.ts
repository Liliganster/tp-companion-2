import type { SupabaseClient } from '@supabase/supabase-js';
import { compactCallsheetReviewReason } from './callsheetReview';
import { toStorageFileName } from './uploadFileName';
import { CallsheetFileReadError, prepareCallsheetUploadBody } from './callsheetUploadBody';

/** One result per selected file, including upload/queue failures. Never deletes evidence. */
export async function uploadCallsheetFile(client: SupabaseClient, userId: string, file: File, id: string, isCancelled = () => false) {
  const storagePath = `${userId}/${id}/${toStorageFileName(file.name)}`;
  let persisted = false;
  let uploaded = false;
  let stage = 'No se pudo registrar el documento';
  try {
    const inserted = await client.from('callsheet_jobs').insert({ id, user_id: userId, storage_path: storagePath, status: 'created' }).select('id').single();
    if (inserted.error) throw inserted.error;
    persisted = true;
    if (isCancelled()) throw new Error('Carga interrumpida');
    const body = await prepareCallsheetUploadBody(file);
    if (isCancelled()) throw new Error('Carga interrumpida');
    stage = 'No se pudo subir el documento; vuelve a seleccionarlo';
    const upload = await client.storage.from('callsheets').upload(storagePath, body, { contentType: body.type, metadata: { originalName: file.name } });
    if (upload.error) throw upload.error;
    uploaded = true;
    if (isCancelled()) throw new Error('Carga interrumpida');
    stage = 'No se pudo iniciar la extracción';
    const queued = await client.from('callsheet_jobs').update({ status: 'queued' }).eq('id', id).eq('user_id', userId).eq('status', 'created').select('id').single();
    if (queued.error) throw queued.error;
    return { id, storagePath, persisted, uploaded, status: 'queued' as const, reason: null };
  } catch (error) {
    const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    const reason = compactCallsheetReviewReason(isCancelled() ? 'Carga interrumpida. Revisa el documento o vuelve a subirlo.' : error instanceof CallsheetFileReadError ? error.message : `${stage}: ${detail}`);
    let persistenceError: unknown = null;
    if (persisted) {
      // A late upload response cannot overwrite a claimed or completed extraction.
      try {
        const saved = await client.from('callsheet_jobs').update({ status: 'failed', needs_review_reason: reason }).eq('id', id).eq('user_id', userId).in('status', ['created', 'queued']);
        persistenceError = saved.error;
      } catch (saveError) { persistenceError = saveError; }
    }
    return { id, storagePath, persisted, uploaded, status: 'failed' as const, reason, persistenceError };
  }
}
