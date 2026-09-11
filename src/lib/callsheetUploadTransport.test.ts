import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { finalizeCallsheetUpload, uploadSignedCallsheet } from './callsheetUploadTransport';
const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } } as unknown as SupabaseClient;
const path = 'user/job/Dispo.pdf';
const url = 'https://storage.example.test/signed-upload';
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

it('uses signed PUT and confirms the upload through the authenticated same-origin API', async () => {
  const request = vi.fn().mockResolvedValueOnce(reply({ path, uploadUrl: url })).mockResolvedValueOnce(reply({})).mockResolvedValueOnce(reply({ ok: true }));
  vi.stubGlobal('fetch', request);
  await uploadSignedCallsheet(client, 'job', 'Dispo.pdf', path, new Blob(['PDF']));
  await finalizeCallsheetUpload(client, 'job', 3);
  expect(request.mock.calls.map(([target]) => target)).toEqual(['/api/callsheets/create-upload', url, '/api/callsheets/queue']);
  expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
  expect(request.mock.calls[1][1].body).toBeInstanceOf(FormData);
  expect(request.mock.calls[1][1].headers).toBeUndefined();
  expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({ jobId: 'job', size: 3, enqueue: true });
});

it('retries an interrupted transfer once with the same signed URL', async () => {
  const request = vi.fn().mockResolvedValueOnce(reply({ path, uploadUrl: url })).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(reply({}));
  vi.stubGlobal('fetch', request);
  await uploadSignedCallsheet(client, 'job', 'Dispo.pdf', path, new Blob(['PDF']));
  expect(request.mock.calls.map(([target]) => target)).toEqual(['/api/callsheets/create-upload', url, url]);
});

it('stops after two network failures without calling the AI or creating another job', async () => {
  const request = vi.fn().mockResolvedValueOnce(reply({ path, uploadUrl: url })).mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', request);
  await expect(uploadSignedCallsheet(client, 'job', 'Dispo.pdf', path, new Blob(['PDF']))).rejects.toThrow('Failed to fetch');
  expect(request).toHaveBeenCalledTimes(3);
});

it.each([409, 400])('lets server verification reconcile a duplicate after a lost response (HTTP %s)', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({ path, uploadUrl: url })).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(reply({ error: 'Duplicate', statusCode: '409', code: 'KeyAlreadyExists' }, status)));
  await expect(uploadSignedCallsheet(client, 'job', 'Dispo.pdf', path, new Blob(['PDF']))).resolves.toBeUndefined();
});

it('retries queue confirmation with the same job id after a lost response', async () => {
  const request = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(reply({ ok: true, alreadyQueued: true }));
  vi.stubGlobal('fetch', request);
  await expect(finalizeCallsheetUpload(client, 'job', 3)).resolves.toMatchObject({ alreadyQueued: true });
  expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body);
});

it('does not upload to an unexpected object or retry authorization failures', async () => {
  const request = vi.fn().mockResolvedValueOnce(reply({ path: 'other/file.pdf', uploadUrl: url }));
  vi.stubGlobal('fetch', request);
  await expect(uploadSignedCallsheet(client, 'job', 'Dispo.pdf', path, new Blob(['PDF']))).rejects.toThrow('ruta');
  expect(request).toHaveBeenCalledTimes(1);
  request.mockReset().mockResolvedValue(reply({ error: 'Unauthorized' }, 403));
  await expect(finalizeCallsheetUpload(client, 'job', 3)).rejects.toThrow('Unauthorized');
  expect(request).toHaveBeenCalledTimes(1);
});
