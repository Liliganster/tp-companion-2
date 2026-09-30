import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, token: vi.fn() }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: mocks.user, getAccessToken: mocks.token }) }));
import { PlanProvider, usePlan } from './PlanContext';
const fetchMock = vi.fn();
const reply = (tier: string) => ({ ok: true, json: async () => ({ tier, status: tier === 'pro' ? 'active' : 'free', expiresAt: null }) });
beforeEach(() => { vi.resetAllMocks(); mocks.user = { id: 'u1' }; mocks.token.mockResolvedValue('token'); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('subscription recovery', () => {
  it('preserves a confirmed paid plan after a transient refresh failure', async () => {
    fetchMock.mockResolvedValueOnce(reply('pro')).mockResolvedValueOnce({ ok: false, status: 500 });
    const { result } = renderHook(usePlan, { wrapper: PlanProvider });
    await waitFor(() => expect(result.current.planTier).toBe('pro'));
    await act(() => result.current.refreshSubscription());
    expect(result.current.planTier).toBe('pro');
    expect(result.current.subscriptionError).toBe(true);
  });
  it('reports unavailable on first-load failure and recovers on retry', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce(reply('pro'));
    const { result } = renderHook(usePlan, { wrapper: PlanProvider });
    await waitFor(() => expect(result.current.subscriptionError).toBe(true));
    expect(result.current.status).toBe('unavailable');
    expect(result.current.hasConfirmedSubscription).toBe(false);
    expect(result.current.isLoading).toBe(false);
    await act(() => result.current.refreshSubscription());
    expect(result.current.subscriptionError).toBe(false);
    expect(result.current.planTier).toBe('pro');
  });
  it('does not transfer a confirmed Pro plan to another account after an error', async () => {
    fetchMock.mockResolvedValueOnce(reply('pro')).mockResolvedValueOnce({ ok: false, status: 500 });
    const { result, rerender } = renderHook(usePlan, { wrapper: PlanProvider });
    await waitFor(() => expect(result.current.planTier).toBe('pro'));
    mocks.user = { id: 'u2' }; rerender();
    expect(result.current.planTier).toBe('basic');
    await waitFor(() => expect(result.current.subscriptionError).toBe(true));
    expect(result.current.hasConfirmedSubscription).toBe(false);
  });
  it('ignores a delayed response from the previous account', async () => {
    let resolveOld!: (value: ReturnType<typeof reply>) => void;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(reply('basic'));
    const { result, rerender } = renderHook(usePlan, { wrapper: PlanProvider });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    mocks.user = { id: 'u2' }; rerender();
    await waitFor(() => expect(result.current.hasConfirmedSubscription).toBe(true));
    await act(async () => { resolveOld(reply('pro')); });
    expect(result.current.planTier).toBe('basic');
    expect(result.current.status).toBe('free');
  });
  it('accepts an explicit server-confirmed downgrade', async () => {
    fetchMock.mockResolvedValueOnce(reply('pro')).mockResolvedValueOnce(reply('basic'));
    const { result } = renderHook(usePlan, { wrapper: PlanProvider });
    await waitFor(() => expect(result.current.planTier).toBe('pro'));
    await act(() => result.current.refreshSubscription());
    expect(result.current.planTier).toBe('basic');
    expect(result.current.subscriptionError).toBe(false);
  });
});
