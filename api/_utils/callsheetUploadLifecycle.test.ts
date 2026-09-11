import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, any>>(), writes: 0, info: vi.fn(), sign: vi.fn(), rpc: vi.fn() }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {
  rpc: state.rpc,
  storage: { from: () => ({ info: state.info, createSignedUploadUrl: state.sign }) },
  from: () => {
    let patch: Record<string, unknown> | undefined;
    const predicates: Array<(row: Record<string, any>) => boolean> = [];
    const query: any = {
      select: () => query, maybeSingle: () => query,
      update: (value: Record<string, unknown>) => { patch = value; return query; },
      eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(row[key])); return query; },
      then: (resolve: any) => {
        const row = [...state.rows.values()].find(row => predicates.every(p => p(row)));
        if (row && patch) { Object.assign(row, patch); state.writes++; }
        return Promise.resolve({ data: row ? { ...row } : null, error: null }).then(resolve);
      },
    };
    return query;
  },
} }));
import { finalizeRegisteredCallsheetUpload, recordRegisteredUploadFailure, signRegisteredCallsheetUpload } from './callsheetUploadLifecycle';

beforeEach(() => {
  state.rows.clear(); state.writes = 0;
  state.rows.set('job', { id: 'job', user_id: 'user', status: 'created', storage_path: 'user/job/Dispo.pdf' });
  state.info.mockReset().mockResolvedValue({ data: { size: 3 }, error: null });
  state.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  state.sign.mockReset().mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed' }, error: null });
});

it('signs only the registered canonical path owned by the requesting user', async () => {
  await expect(signRegisteredCallsheetUpload('other', 'job', 'Dispo.pdf')).rejects.toMatchObject({ status: 404 });
  await expect(signRegisteredCallsheetUpload('user', 'job', 'Different.pdf')).rejects.toMatchObject({ status: 409 });
  expect(state.sign).not.toHaveBeenCalled();
  await expect(signRegisteredCallsheetUpload('user', 'job', 'Dispo.pdf')).resolves.toMatchObject({ path: 'user/job/Dispo.pdf' });
});

it('never queues missing, partial, or unowned objects', async () => {
  state.info.mockResolvedValueOnce({ data: null, error: { statusCode: '404' } });
  await expect(finalizeRegisteredCallsheetUpload('user', 'job', 3)).rejects.toMatchObject({ status: 409 });
  await expect(finalizeRegisteredCallsheetUpload('user', 'job', 4)).rejects.toMatchObject({ status: 409 });
  state.rpc.mockResolvedValueOnce({ data: false, error: null });
  await expect(finalizeRegisteredCallsheetUpload('user', 'job', 3)).rejects.toThrow('storage_ownership_not_verified');
  expect(state.writes).toBe(0);
});

it('verifies Storage then queues once even when the response is lost and retried', async () => {
  await expect(finalizeRegisteredCallsheetUpload('user', 'job', 3)).resolves.toMatchObject({ status: 'queued' });
  await expect(finalizeRegisteredCallsheetUpload('user', 'job', 3)).resolves.toMatchObject({ status: 'queued', alreadyQueued: true });
  expect(state.writes).toBe(1);
  expect(state.info).toHaveBeenCalledTimes(1);
});

it('can confirm a stored file without queueing or starting AI', async () => {
  await expect(finalizeRegisteredCallsheetUpload('user', 'job', 3, false)).resolves.toMatchObject({ status: 'created' });
  expect(state.rows.get('job')?.status).toBe('created');
});

it('does not downgrade queued or completed jobs when a late failure is reported', async () => {
  for (const status of ['queued', 'processing', 'done', 'needs_review']) {
    state.rows.get('job')!.status = status;
    await recordRegisteredUploadFailure('user', 'job', 'Lost response');
    expect(state.rows.get('job')!.status).toBe(status);
  }
  expect(state.writes).toBe(0);
});

it('preserves cancellation and rejects changes to another user document', async () => {
  state.rows.get('job')!.status = 'cancelled';
  await expect(finalizeRegisteredCallsheetUpload('user', 'job', 3)).rejects.toMatchObject({ status: 409 });
  await recordRegisteredUploadFailure('other', 'job', 'failure');
  expect(state.writes).toBe(0);
});

it('keeps upload failures visible without deleting the job or uploaded file', async () => {
  await recordRegisteredUploadFailure('user', 'job', 'Upload failed');
  expect(state.rows.get('job')).toMatchObject({ status: 'failed', needs_review_reason: 'Upload failed' });
});
