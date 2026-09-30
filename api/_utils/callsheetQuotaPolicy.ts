import { getBillingEntitlement, type BillingEntitlement } from './entitlements.js';
import { getStripeClient } from './stripeClient.js';
import { getSubscriptionQuotaPeriod, getSubscriptionPriceId } from './stripeSubscription.js';
import { supabaseAdmin } from '../../src/lib/supabaseServer.js';

export type CallsheetQuotaPolicy = {
  planTier: 'basic' | 'pro'; limit: number; period: 'monthly' | 'annual';
  periodStart: string; periodEnd: string;
};

export async function getCallsheetQuotaPolicy(userId: string, supplied?: BillingEntitlement, now = new Date()): Promise<CallsheetQuotaPolicy> {
  const entitlement = supplied ?? await getBillingEntitlement(userId);
  const annualPrice = process.env.STRIPE_PRICE_PRO_ANNUAL?.trim();
  const annual = entitlement.planTier === 'pro' && (entitlement.billingInterval === 'annual'
    || Boolean(annualPrice && entitlement.priceId === annualPrice));
  if (annual) {
    let start = entitlement.currentPeriodStart;
    let end = entitlement.currentPeriodEnd;
    // Existing subscribers predate the period-start column. Read their exact
    // Stripe interval once; never infer a year from an end date or calendar year.
    if (!start || !end) {
      if (!entitlement.subscriptionId) throw new Error('annual_quota_period_missing');
      const subscription = await getStripeClient().subscriptions.retrieve(entitlement.subscriptionId);
      const period = getSubscriptionQuotaPeriod(subscription);
      if (getSubscriptionPriceId(subscription) !== entitlement.priceId || period.billingInterval !== 'annual'
        || !['active', 'trialing', 'past_due'].includes(subscription.status)) throw new Error('annual_subscription_changed');
      start = period.currentPeriodStart;
      end = period.currentPeriodEnd;
      if (!start || !end) throw new Error('annual_quota_period_missing');
      let update = supabaseAdmin.from('billing_entitlements').update({
        stripe_billing_interval: 'annual', stripe_current_period_start: start, stripe_current_period_end: end,
      }).eq('user_id', userId).eq('stripe_subscription_id', entitlement.subscriptionId).eq('stripe_price_id', entitlement.priceId);
      // Do not overwrite a newer webhook while filling in historical metadata.
      update = entitlement.eventCreatedAt ? update.eq('stripe_event_created_at', entitlement.eventCreatedAt) : update.is('stripe_event_created_at', null);
      const { error } = await update;
      if (error) throw new Error('annual_quota_period_sync_failed');
    }
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) {
      throw new Error('annual_quota_period_invalid');
    }
    // An expired period stays exhausted until Stripe confirms renewal.
    return { planTier: 'pro', limit: 400, period: 'annual', periodStart: start, periodEnd: end };
  }
  // Preserve the existing calendar-month quota for Free and Pro monthly.
  return {
    planTier: entitlement.planTier, limit: entitlement.planTier === 'pro' ? 60 : 3, period: 'monthly',
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
  };
}
