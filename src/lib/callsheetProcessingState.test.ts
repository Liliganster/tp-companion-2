import { expect, it } from 'vitest';
import { resolveCallsheetProcessingState } from './callsheetProcessingState';
const job = { status: 'processing', processing_started_at: new Date(0).toISOString() };
it('stops displaying an abandoned request as processing, even on repeated polls', () => {
  for (const now of [180_000, 240_000, 300_000]) expect(resolveCallsheetProcessingState(job, false, now).status).toBe('failed');
});
it('keeps a live request and a recently claimed job in progress', () => {
  expect(resolveCallsheetProcessingState(job, true, 90_000)).toBe(job);
  expect(resolveCallsheetProcessingState(job, false, 179_000)).toBe(job);
});
it('accepts a late persisted success and preserves queued jobs', () => {
  expect(resolveCallsheetProcessingState({ ...job, status: 'done' }, false, 120_000).status).toBe('done');
  expect(resolveCallsheetProcessingState({ ...job, status: 'queued' }, false, 120_000).status).toBe('queued');
});
