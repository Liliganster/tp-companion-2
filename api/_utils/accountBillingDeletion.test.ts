import { beforeEach, expect, it, vi } from 'vitest';
const { from, stripe, getStripeClient } = vi.hoisted(() => ({ from: vi.fn(), stripe: {
  customers: { retrieve: vi.fn() }, subscriptions: { retrieve: vi.fn(), list: vi.fn(), cancel: vi.fn() },
  checkout: { sessions: { list: vi.fn(), expire: vi.fn() } },
}, getStripeClient: vi.fn() }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: { from } }));
vi.mock('./stripeClient.js', () => ({ getStripeClient }));
import { cancelAccountBilling } from './accountDeletion';
async function* items(values: unknown[]) { for (const value of values) yield value; }
beforeEach(() => {
  getStripeClient.mockReturnValue(stripe);
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
  stripe.customers.retrieve.mockResolvedValue({ id: 'cus_a', metadata: { user_id: 'user-a' } });
  stripe.subscriptions.list.mockReturnValue(items([]));
  stripe.checkout.sessions.list.mockReturnValue(items([]));
});
it('does not contact Stripe for an account without billing records', async () => {
  expect(await cancelAccountBilling('user-a')).toBe(true);
  expect(getStripeClient).not.toHaveBeenCalled();
});
it('stops if billing lookup fails instead of assuming a Free account', async () => {
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: new Error('offline') }) }) }) });
  await expect(cancelAccountBilling('user-a')).rejects.toThrow('billing_lookup_failed');
  expect(getStripeClient).not.toHaveBeenCalled();
});
it('expires open checkouts and cancels all active subscriptions without immediate invoices or proration', async () => {
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_customer_id: 'cus_a' }, error: null }) }) }) });
  stripe.checkout.sessions.list.mockReturnValue(items([{ id: 'cs_a' }, { id: 'cs_b' }]));
  stripe.subscriptions.list.mockReturnValue(items([{ id: 'sub_old', status: 'canceled' }, { id: 'sub_a', status: 'active' }, { id: 'sub_b', status: 'past_due' }]));
  expect(await cancelAccountBilling('user-a')).toBe(true);
  expect(stripe.checkout.sessions.expire).toHaveBeenCalledTimes(2);
  expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
  expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_a', { invoice_now: false, prorate: false }, expect.anything());
});
it('refuses cancellation when the customer identifies another user', async () => {
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_customer_id: 'cus_a' }, error: null }) }) }) });
  stripe.customers.retrieve.mockResolvedValue({ metadata: { user_id: 'user-b' } });
  await expect(cancelAccountBilling('user-a')).rejects.toThrow('billing_owner_conflict');
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
});
