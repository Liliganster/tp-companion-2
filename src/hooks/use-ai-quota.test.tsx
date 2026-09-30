import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), token: vi.fn(async () => 'token') }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, getAccessToken: mocks.token }) }));
vi.mock('@/contexts/PlanContext', () => ({ usePlan: () => ({ limits: { aiJobsPerMonth: 60 }, aiQuota: { limit: 400, period: 'annual', periodEnd: '2027-03-15T10:20:30Z' } }) }));
import { useAiQuota } from './use-ai-quota';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('displays the annual ledger usage returned by the server', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ limit: 400, used: 399, period: 'annual', periodEnd: '2027-03-15T10:20:30Z' }) });
  const { result } = renderHook(useAiQuota);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current).toMatchObject({ used: 399, limit: 400, period: 'annual', bypass: false });
});
it('shows unknown usage if the server fails, never a misleading monthly fallback', async () => {
  mocks.fetch.mockResolvedValue({ ok: false });
  const { result } = renderHook(useAiQuota);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current).toMatchObject({ used: null, limit: 400, period: 'annual', bypass: false });
});
