import type { SupabaseClient } from '@supabase/supabase-js';
import { compactCallsheetReviewReason } from './callsheetReview';
import { toStorageFileName } from './uploadFileName';
import { CallsheetFileReadError, prepareCallsheetUploadBody } from './callsheetUploadBody';
import { finalizeCallsheetUpload, recordCallsheetUploadFailure, uploadSignedCallsheet } from './callsheetUploadTransport';

/** One result per selected file, including upload/queue failures. Never deletes evidence. */
export async function uploadCallsheetFile(client: SupabaseClient, userId: string, file: File, id: string, isCancelled = () => false, options: { projectId?: string; autoQueue?: boolean } = {}) {
  const storagePath = `${userId}/${id}/${toStorageFileName(file.name)}`;
  let persisted = false;
  let uploaded = false;
  let stage = 'No se pudo registrar el documento';
  try {
    const inserted = await client.from('callsheet_jobs').insert({ id, user_id: userId, storage_path: storagePath, status: 'created', ...(options.projectId ? { project_id: options.projectId } : {}) }).select('id').single();
    if (inserted.error) throw inserted.error;
    persisted = true;
    if (isCancelled()) throw new Error('Carga interrumpida');
    const body = await prepareCallsheetUploadBody(file);
    if (isCancelled()) throw new Error('Carga interrumpida');
    stage = 'No se pudo subir el documento; vuelve a seleccionarlo';
    await uploadSignedCallsheet(client, id, file.name, storagePath, body, isCancelled);
    uploaded = true;
    if (isCancelled()) throw new Error('Carga interrumpida');
    stage = 'No se pudo iniciar la extracción';
    await finalizeCallsheetUpload(client, id, body.size, options.autoQueue !== false, isCancelled);
    return { id, storagePath, persisted, uploaded, status: options.autoQueue === false ? 'created' as const : 'queued' as const, reason: null };
  } catch (error) {
    const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    const reason = compactCallsheetReviewReason(isCancelled() ? 'Carga interrumpida. Revisa el documento o vuelve a subirlo.' : error instanceof CallsheetFileReadError ? error.message : `${stage}: ${detail}`);
    let persistenceError: unknown = null;
    if (persisted) {
      // A late upload response cannot overwrite a claimed or completed extraction.
      try {
        await recordCallsheetUploadFailure(client, id, reason);
      } catch (saveError) { persistenceError = saveError; }
    }
    return { id, storagePath, persisted, uploaded, status: 'failed' as const, reason, persistenceError };
  }
}
