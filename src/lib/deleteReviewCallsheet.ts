import { resolveCallsheetProcessingState } from './callsheetProcessingState';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function deleteReviewCallsheet(supabase: SupabaseClient, jobId: string) {
  const { data: job, error } = await supabase.from('callsheet_jobs')
    .select('id, storage_path, status, created_at, processing_started_at, processed_at').eq('id', jobId).maybeSingle();
  if (error) throw error;
  if (!job) return; // Another selected project's cascade may already have removed it.
  const displayState = resolveCallsheetProcessingState(job, false);
  if (!['failed', 'needs_review', 'out_of_quota', 'cancelled'].includes(displayState.status)) throw new Error('review_status_changed');
  const { data: trip, error: tripError } = await supabase.from('trips')
    .select('id').eq('callsheet_job_id', jobId).limit(1).maybeSingle();
  if (tripError) throw tripError;
  if (trip) throw new Error('review_already_saved_as_trip');
  if (displayState.status !== job.status) {
    // Claim only this expired attempt. A worker that has restarted it or completed
    // it since our read must prevent deletion of its original document.
    let cancel = supabase.from('callsheet_jobs').update({ status: 'cancelled' })
      .eq('id', jobId).eq('status', job.status);
    for (const field of ['created_at', 'processing_started_at', 'processed_at'] as const) {
      cancel = job[field] == null ? cancel.is(field, null) : cancel.eq(field, job[field]);
    }
    const { data: cancelled, error: cancelError } = await cancel.select('id').maybeSingle();
    if (cancelError) throw cancelError;
    if (!cancelled) throw new Error('review_status_changed');
  }
  const path = String(job.storage_path ?? '').trim();
  if (path && path !== 'pending') {
    const { error: storageError } = await supabase.storage.from('callsheets').remove([path]);
    if (storageError) throw storageError;
  }
  // Child extraction results/locations/evidence use ON DELETE CASCADE.
  // Keep the job reference if file removal failed so the user can retry.
  const { data: deleted, error: deleteError } = await supabase.from('callsheet_jobs').delete().eq('id', jobId).select('id').maybeSingle();
  if (deleteError) throw deleteError;
  if (!deleted) throw new Error('review_delete_not_confirmed');
}

export async function deleteSelectedTripRows(ids: string[], reviewIds: ReadonlySet<string>, deleteTrip: (id: string) => Promise<void>, deleteReview: (id: string) => Promise<void>) {
  const deleted: string[] = [];
  const failed: string[] = [];
  // Sequential: deleting the last trip may also remove its project and drafts.
  for (const id of new Set(ids)) {
    try { await (reviewIds.has(id) ? deleteReview(id) : deleteTrip(id)); deleted.push(id); }
    catch { failed.push(id); }
  }
  return { deleted, failed };
}
