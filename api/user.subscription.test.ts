import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ entitlement: vi.fn(), quota: vi.fn() }));
vi.mock('./_utils/supabase.js', () => ({ requireSupabaseUser: async () => ({ id: 'u1' }), sendJson: (_req: unknown, status: number, body: unknown) => ({ status, body }) }));
vi.mock('../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {} }));
vi.mock('./_utils/entitlements.js', () => ({ getBillingEntitlement: mocks.entitlement, getServerPlanTier: vi.fn() }));
vi.mock('./_utils/callsheetQuotaPolicy.js', () => ({ getCallsheetQuotaPolicy: mocks.quota }));
vi.mock('./_utils/aiQuota.js', () => ({ checkAiMonthlyQuota: vi.fn() }));
vi.mock('./_utils/accountDeletion.js', () => ({ runAccountDeletion: vi.fn() }));
vi.mock('./_utils/rateLimit.js', () => ({ enforceRateLimit: async () => true }));
import handler from './user';
beforeEach(() => vi.resetAllMocks());
it('returns the paid subscription even when annual quota synchronization fails', async () => {
  mocks.entitlement.mockResolvedValue({ planTier: 'pro', status: 'active', billingInterval: 'annual', currentPeriodEnd: '2027-07-19T20:28:16Z' });
  mocks.quota.mockRejectedValue(new Error('annual_quota_period_sync_failed'));
  const result = await handler({ url: '/api/user/subscription', method: 'GET', headers: {} } as any, {} as any);
  expect(result).toMatchObject({ status: 200, body: { tier: 'pro', status: 'active', quotaUnavailable: true, priceCents: 4999 } });
});
it('returns an error instead of a Free plan when billing cannot be verified', async () => {
  mocks.entitlement.mockRejectedValue(new Error('database unavailable'));
  const result = await handler({ url: '/api/user/subscription', method: 'GET', headers: {} } as any, {} as any);
  expect(result).toMatchObject({ status: 500 });
  expect(mocks.quota).not.toHaveBeenCalled();
});
