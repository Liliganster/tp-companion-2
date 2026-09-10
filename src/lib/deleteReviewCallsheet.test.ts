import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteReviewCallsheet, deleteSelectedTripRows } from './deleteReviewCallsheet';

function client(options: { storageError?: object; linked?: boolean; status?: string; missing?: boolean } = {}) {
  const remove = vi.fn(async () => ({ error: options.storageError ?? null }));
  const deleteJob = vi.fn(async () => ({ error: null }));
  const supabase = {
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, limit: () => query,
        maybeSingle: async () => ({ error: null, data: table === 'trips' ? (options.linked ? { id: 'saved-trip' } : null) : (options.missing ? null : { id: 'job', status: options.status ?? 'needs_review', storage_path: 'user/job/original.pdf' }) }),
        delete: () => ({ eq: deleteJob }),
      };
      return query;
    },
    storage: { from: () => ({ remove }) },
  } as unknown as SupabaseClient;
  return { supabase, remove, deleteJob };
}
it('deletes an unreviewed document before deleting its job', async () => {
  const mocks = client();
  await deleteReviewCallsheet(mocks.supabase, 'job');
  expect(mocks.remove).toHaveBeenCalledWith(['user/job/original.pdf']);
  expect(mocks.deleteJob).toHaveBeenCalledWith('id', 'job');
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteJob.mock.invocationCallOrder[0]);
});
it('keeps the job available for retry when file removal fails', async () => {
  const mocks = client({ storageError: { message: 'Storage unavailable' } });
  await expect(deleteReviewCallsheet(mocks.supabase, 'job')).rejects.toMatchObject({ message: 'Storage unavailable' });
  expect(mocks.deleteJob).not.toHaveBeenCalled();
});
it.each([{ linked: true }, { status: 'processing' }])('does not delete a draft that is now saved or processing: %o', async options => {
  const mocks = client(options);
  await expect(deleteReviewCallsheet(mocks.supabase, 'job')).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.deleteJob).not.toHaveBeenCalled();
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
