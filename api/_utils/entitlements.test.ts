import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: { from: mocks.from } }));
import { getBillingEntitlement } from './entitlements';
beforeEach(() => {
  vi.resetAllMocks();
  const chain = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  mocks.from.mockReturnValue(chain); mocks.select.mockReturnValue(chain); mocks.eq.mockReturnValue(chain);
});
describe('billing entitlement availability', () => {
  it.each(['42703', 'PGRST204'])('reads the existing secure schema when optional quota columns are missing (%s)', async code => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { code, message: 'column billing_entitlements.stripe_current_period_start does not exist' } })
      .mockResolvedValueOnce({ data: { plan_tier: 'pro', stripe_subscription_status: 'active', stripe_subscription_id: 'sub_paid' }, error: null });
    expect(await getBillingEntitlement('u1')).toMatchObject({ planTier: 'pro', status: 'active', subscriptionId: 'sub_paid' });
    expect(mocks.from.mock.calls.map(args => args[0])).toEqual(['billing_entitlements', 'billing_entitlements']);
    expect(mocks.select.mock.calls[1][0]).not.toContain('stripe_current_period_start');
  });
  it('does not convert a permission or network error into Free or a legacy grant', async () => {
    const error = { code: '42501', message: 'permission denied for billing_entitlements' };
    mocks.maybeSingle.mockResolvedValue({ data: null, error });
    await expect(getBillingEntitlement('u1')).rejects.toEqual(error);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('preserves the supported legacy migration fallback', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST205' } })
      .mockResolvedValueOnce({ data: { plan_tier: 'pro' }, error: null });
    expect((await getBillingEntitlement('u1')).planTier).toBe('pro');
    expect(mocks.from).toHaveBeenLastCalledWith('user_profiles');
  });
  it('only reports Free when both reads succeeded with no entitlement', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await getBillingEntitlement('u1')).planTier).toBe('basic');
  });
  it('propagates a failed legacy lookup instead of inventing a Free plan', async () => {
    const error = { code: '08006', message: 'connection failure' };
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error });
    await expect(getBillingEntitlement('u1')).rejects.toEqual(error);
  });
});
