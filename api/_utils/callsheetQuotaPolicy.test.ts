import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ entitlement: vi.fn(), retrieve: vi.fn(), from: vi.fn(), update: vi.fn() }));
vi.mock('./entitlements.js', () => ({ getBillingEntitlement: mocks.entitlement }));
vi.mock('./stripeClient.js', () => ({ getStripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve } }) }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: { from: mocks.from } }));
import { getCallsheetQuotaPolicy } from './callsheetQuotaPolicy';
const start = '2026-03-15T10:20:30.000Z', end = '2027-03-15T10:20:30.000Z';
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('STRIPE_PRICE_PRO_ANNUAL', 'price_annual');
  const chain = { eq: vi.fn(() => chain), is: vi.fn(() => chain), then: (resolve: any) => Promise.resolve({ error: null }).then(resolve) };
  mocks.update.mockReturnValue(chain); mocks.from.mockReturnValue({ update: mocks.update });
});
afterEach(() => vi.unstubAllEnvs());
describe('billing quota policy', () => {
  it.each([['basic', 3], ['pro', 60]])('keeps %s on its monthly quota', async (planTier, limit) => {
    mocks.entitlement.mockResolvedValue({ planTier, billingInterval: 'monthly' });
    expect(await getCallsheetQuotaPolicy('user', undefined, new Date('2026-12-20'))).toMatchObject({
      limit, period: 'monthly', periodStart: '2026-12-01T00:00:00.000Z', periodEnd: '2027-01-01T00:00:00.000Z',
    });
  });
  it('uses one 400-document period across month and calendar-year changes', async () => {
    mocks.entitlement.mockResolvedValue({ planTier: 'pro', billingInterval: 'annual', currentPeriodStart: start, currentPeriodEnd: end });
    for (const now of ['2026-03-20', '2026-10-01', '2027-01-01']) {
      expect(await getCallsheetQuotaPolicy('user', undefined, new Date(now))).toEqual({ planTier: 'pro', limit: 400, period: 'annual', periodStart: start, periodEnd: end });
    }
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it('only changes the annual window when billing confirms the next period', async () => {
    const annual = { planTier: 'pro', billingInterval: 'annual', currentPeriodStart: start, currentPeriodEnd: end };
    mocks.entitlement.mockResolvedValue(annual);
    expect((await getCallsheetQuotaPolicy('user', undefined, new Date('2027-04-01'))).periodEnd).toBe(end);
    mocks.entitlement.mockResolvedValue({ ...annual, currentPeriodStart: end, currentPeriodEnd: '2028-03-15T10:20:30.000Z' });
    expect((await getCallsheetQuotaPolicy('user')).periodStart).toBe(end);
  });
  it('backfills existing annual subscriptions using exact Stripe item boundaries', async () => {
    mocks.entitlement.mockResolvedValue({ planTier: 'pro', priceId: 'price_annual', subscriptionId: 'sub_annual', currentPeriodEnd: end, eventCreatedAt: '2026-03-15T10:20:30Z' });
    mocks.retrieve.mockResolvedValue({ status: 'active', items: { data: [{ price: { id: 'price_annual', recurring: { interval: 'year', interval_count: 1 } }, current_period_start: Date.parse(start)/1000, current_period_end: Date.parse(end)/1000 }] } });
    expect(await getCallsheetQuotaPolicy('user')).toMatchObject({ limit: 400, periodStart: start, periodEnd: end });
    expect(mocks.retrieve).toHaveBeenCalledWith('sub_annual');
    expect(mocks.update).toHaveBeenCalledWith({ stripe_billing_interval: 'annual', stripe_current_period_start: start, stripe_current_period_end: end });
  });
  it('does not grant 60 monthly when an annual period cannot be retrieved', async () => {
    mocks.entitlement.mockResolvedValue({ planTier: 'pro', priceId: 'price_annual', subscriptionId: 'sub_annual' });
    mocks.retrieve.mockRejectedValue(new Error('stripe unavailable'));
    await expect(getCallsheetQuotaPolicy('user')).rejects.toThrow('stripe unavailable');
  });
  it('does not trust the annual price on a downgraded Free entitlement', async () => {
    mocks.entitlement.mockResolvedValue({ planTier: 'basic', priceId: 'price_annual', billingInterval: 'annual' });
    expect(await getCallsheetQuotaPolicy('user')).toMatchObject({ limit: 3, period: 'monthly' });
  });
});
