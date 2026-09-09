import { beforeEach, expect, it, vi } from 'vitest';
const { isAccountDeleting } = vi.hoisted(() => ({ isAccountDeleting: vi.fn() }));
vi.mock('./accountLifecycle.js', () => ({ isAccountDeleting }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  isAccountDeleting.mockResolvedValue(false);
});
const response = () => ({ statusCode: 0, setHeader: vi.fn(), end: vi.fn() });
it('rechecks the deletion lock even when the identity is already cached', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'user-a' }) });
  vi.stubGlobal('fetch', request);
  const { requireSupabaseUser } = await import('./supabase');
  const req = { method: 'GET', url: '/api/user/profile', headers: { authorization: 'Bearer token' } };
  expect((await requireSupabaseUser(req, response()))?.id).toBe('user-a');
  isAccountDeleting.mockResolvedValue(true);
  const res = response();
  expect(await requireSupabaseUser(req, res)).toBeNull();
  expect(res.statusCode).toBe(409);
  expect(request).toHaveBeenCalledTimes(1);
});
it('fails closed when lifecycle status cannot be read', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'user-a' }) }));
  isAccountDeleting.mockRejectedValue(new Error('offline'));
  const { requireSupabaseUser } = await import('./supabase');
  const res = response();
  expect(await requireSupabaseUser({ method: 'POST', url: '/api/stripe/checkout', headers: { authorization: 'Bearer token' } }, res)).toBeNull();
  expect(res.statusCode).toBe(503);
});
it('allows an authenticated owner to resume deletion while their writes are locked', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'user-a' }) }));
  isAccountDeleting.mockResolvedValue(true);
  const { requireSupabaseUser } = await import('./supabase');
  expect((await requireSupabaseUser({ method: 'POST', url: '/api/user/delete-account', headers: { authorization: 'Bearer token' } }, response()))?.id).toBe('user-a');
  expect(isAccountDeleting).not.toHaveBeenCalled();
});
