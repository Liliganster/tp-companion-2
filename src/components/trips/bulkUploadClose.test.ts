import { expect, it } from 'vitest';
import { getBulkCloseCancellation } from './bulkUploadClose';
const base = { activeJobIds: [], aiLoading: false, aiStep: 'review' as const, jobIds: [], jobStateById: {} };
it.each(['created', 'queued', 'processing'])('allows closing with %s work already on the server', status => {
  expect(getBulkCloseCancellation({ ...base, jobIds: ['pending'], jobStateById: { pending: { status } } })).toEqual({ shouldBlockClose: false });
});
it('allows closing when some results are ready and others remain queued', () => {
  expect(getBulkCloseCancellation({ ...base, jobIds: ['ready', 'pending'], jobStateById: { ready: { status: 'done' }, pending: { status: 'queued' } } }).shouldBlockClose).toBe(false);
});
it('blocks closing while files are uploading before the job list is ready', () => {
  expect(getBulkCloseCancellation({ ...base, aiLoading: true, activeJobIds: ['uploading'] }).shouldBlockClose).toBe(true);
});
it.each(['done', 'needs_review', 'failed', 'out_of_quota', 'cancelled'])('allows closing after %s', status => {
  expect(getBulkCloseCancellation({ ...base, jobIds: ['done'], jobStateById: { done: { status } } }).shouldBlockClose).toBe(false);
});
it('allows closing an idle dialog', () => { expect(getBulkCloseCancellation(base).shouldBlockClose).toBe(false); });
