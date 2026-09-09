import { expect, it, vi } from 'vitest';
import { continueAccountDeletion } from './deleteAccount';
const reply = (status: number, data: unknown) => ({ status, json: async () => data }) as Response;

it('waits through progress responses and only finishes on confirmed completion', async () => {
  const request = vi.fn().mockResolvedValueOnce(reply(202, { pending: true, retryAfterMs: 1 }))
    .mockResolvedValueOnce(reply(202, { pending: true })).mockResolvedValueOnce(reply(200, { ok: true }));
  const wait = vi.fn(async () => {});
  await continueAccountDeletion(async () => 'token', new AbortController().signal, request, wait);
  expect(request).toHaveBeenCalledTimes(3);
  expect(wait).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(5000);
});

it.each([503, 401, 200])('does not present an unconfirmed response (%s) as success', async status => {
  await expect(continueAccountDeletion(async () => 'token', new AbortController().signal,
    vi.fn().mockResolvedValue(reply(status, { ok: false })), vi.fn())).rejects.toThrow('account_deletion_incomplete');
});

it('stops polling when the user leaves', async () => {
  const controller = new AbortController();
  const request = vi.fn().mockResolvedValue(reply(202, { pending: true }));
  await expect(continueAccountDeletion(async () => 'token', controller.signal, request,
    async () => controller.abort())).rejects.toMatchObject({ name: 'AbortError' });
  expect(request).toHaveBeenCalledTimes(1);
});

it('can acknowledge the last step after the session has been removed', async () => {
  const request = vi.fn().mockResolvedValueOnce(reply(202, { pending: true, receipt: 'signed-receipt' }))
    .mockResolvedValueOnce(reply(200, { ok: true }));
  const getToken = vi.fn().mockResolvedValueOnce('token').mockResolvedValueOnce(null);
  await continueAccountDeletion(getToken, new AbortController().signal, request, async () => {});
  expect(request.mock.calls[1][1].headers['X-Deletion-Receipt']).toBe('signed-receipt');
});
