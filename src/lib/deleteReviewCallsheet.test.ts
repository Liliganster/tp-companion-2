import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteReviewCallsheet, deleteSelectedTripRows } from './deleteReviewCallsheet';
import { CALLSHEET_STALE_MS } from './callsheetProcessingState';

function client(options: { storageError?: object; linked?: boolean; status?: string; missing?: boolean; stale?: boolean; restarted?: boolean; denied?: boolean } = {}) {
  const timestamp = new Date(Date.now() - (options.stale ? CALLSHEET_STALE_MS + 1000 : 0)).toISOString();
  const remove = vi.fn(async () => ({ error: options.storageError ?? null }));
  const deleteJob = vi.fn(); const cancel = vi.fn(); const conditions: unknown[][] = [];
  const supabase = {
    from: (table: string) => {
      let action = 'read';
      const query = {
        select: () => query, eq: (...args: unknown[]) => { conditions.push(args); return query; },
        is: (...args: unknown[]) => { conditions.push(args); return query; }, limit: () => query,
        maybeSingle: async () => {
          if (action === 'delete') return { data: options.denied ? null : { id: 'job' }, error: null };
          if (action === 'cancel') return { data: options.restarted ? null : { id: 'job' }, error: null };
          return { error: null, data: table === 'trips' ? (options.linked ? { id: 'saved-trip' } : null) : (options.missing ? null : { id: 'job', status: options.status ?? 'needs_review', storage_path: 'user/job/original.pdf', created_at: timestamp, processing_started_at: options.status === 'processing' ? timestamp : null, processed_at: null }) };
        },
        delete: () => { action = 'delete'; deleteJob(); return query; },
        update: (patch: unknown) => { action = 'cancel'; cancel(patch); return query; },
      };
      return query;
    },
    storage: { from: () => ({ remove }) },
  } as unknown as SupabaseClient;
  return { supabase, remove, deleteJob, cancel, conditions, timestamp };
}
it.each(['needs_review', 'failed', 'out_of_quota', 'cancelled'])('deletes a %s document before deleting its job', async status => {
  const mocks = client({ status });
  await deleteReviewCallsheet(mocks.supabase, 'job');
  expect(mocks.remove).toHaveBeenCalledWith(['user/job/original.pdf']);
  expect(mocks.deleteJob).toHaveBeenCalledOnce();
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteJob.mock.invocationCallOrder[0]);
});
it('keeps the job available for retry when file removal fails', async () => {
  const mocks = client({ storageError: { message: 'Storage unavailable' } });
  await expect(deleteReviewCallsheet(mocks.supabase, 'job')).rejects.toMatchObject({ message: 'Storage unavailable' });
  expect(mocks.deleteJob).not.toHaveBeenCalled();
});
it.each([{ linked: true }, { status: 'processing' }, { status: 'created' }, { status: 'queued' }, { status: 'done' }])('does not delete an active or saved document: %o', async options => {
  const mocks = client(options);
  await expect(deleteReviewCallsheet(mocks.supabase, 'job')).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.deleteJob).not.toHaveBeenCalled();
});
it.each(['created', 'queued', 'processing'])('allows deleting an expired %s job that the Trips table displays as failed', async status => {
  const mocks = client({ status, stale: true });
  await deleteReviewCallsheet(mocks.supabase, 'job');
  expect(mocks.cancel).toHaveBeenCalledWith({ status: 'cancelled' });
  expect(mocks.conditions).toContainEqual(['status', status]);
  expect(mocks.conditions).toContainEqual(['created_at', mocks.timestamp]);
  expect(mocks.conditions).toContainEqual(['processing_started_at', status === 'processing' ? mocks.timestamp : null]);
  expect(mocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  expect(mocks.deleteJob).toHaveBeenCalledOnce();
});
it('preserves a document when a worker restarts it between reading and cancelling', async () => {
  const mocks = client({ status: 'processing', stale: true, restarted: true });
  await expect(deleteReviewCallsheet(mocks.supabase, 'job')).rejects.toThrow('review_status_changed');
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.deleteJob).not.toHaveBeenCalled();
});
it('does not report success when the database deleted no rows', async () => {
  const mocks = client({ denied: true });
  await expect(deleteReviewCallsheet(mocks.supabase, 'job')).rejects.toThrow('review_delete_not_confirmed');
});
it('handles a draft already removed by a selected project cascade', async () => {
  const mocks = client({ missing: true });
  await deleteReviewCallsheet(mocks.supabase, 'job');
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('routes a mixed selection correctly, deduplicates ids and retains only failed ids', async () => {
  const deleteTrip = vi.fn().mockResolvedValue(undefined);
  const deleteReview = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
  const result = await deleteSelectedTripRows(['trip', 'review', 'failed', 'review'], new Set(['review', 'failed']), deleteTrip, deleteReview);
  expect(deleteTrip).toHaveBeenCalledExactlyOnceWith('trip');
  expect(deleteReview.mock.calls).toEqual([['review'], ['failed']]);
  expect(result).toEqual({ deleted: ['trip', 'review'], failed: ['failed'] });
});
