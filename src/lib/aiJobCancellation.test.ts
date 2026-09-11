import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: [] as any[], deleted: vi.fn(), removed: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {
  from: () => {
    let patch: any;
    const filters: ((row: any) => boolean)[] = [];
    const q: any = { update: (value: any) => { patch = value; return q; },
      in: (key: string, values: any[]) => { filters.push(row => values.includes(row[key])); return q; },
      delete: state.deleted,
      then: (resolve: any) => { for (const row of state.rows) if (filters.every(fn => fn(row))) Object.assign(row, patch); return Promise.resolve({ error: null }).then(resolve); },
    }; return q;
  }, storage: { from: () => ({ remove: state.removed }) },
} }));
import { cancelCallsheetJobs } from './aiJobCancellation';
import { getReviewCallsheetDrafts } from './callsheetReview';
it('closing/cancelling preserves files and all four jobs without overwriting failures or completed work', async () => {
  state.rows = ['done', 'failed', 'queued', 'processing'].map(status => ({ id: status, status, storage_path: `user/${status}/Dispo.pdf`, created_at: '2026-09-11', needs_review_reason: status === 'failed' ? 'Original failure' : null }));
  await cancelCallsheetJobs(state.rows.map(row => row.id));
  expect(state.rows.map(row => row.status)).toEqual(['done', 'failed', 'cancelled', 'cancelled']);
  expect(state.rows[1].needs_review_reason).toBe('Original failure');
  expect(getReviewCallsheetDrafts(state.rows, [{ callsheet_job_id: 'done' }], [])).toHaveLength(3);
  expect(state.deleted).not.toHaveBeenCalled();
  expect(state.removed).not.toHaveBeenCalled();
});
