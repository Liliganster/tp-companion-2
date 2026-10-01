import type Stripe from 'stripe';
import { supabaseAdmin } from '../../src/lib/supabaseServer.js';
import { getStripeClient } from './stripeClient.js';
import { getBillingEntitlement } from './entitlements.js';
import { isAccountDeleting } from './accountLifecycle.js';

export const AI_CREDIT_PACK = { kind: 'ai_credits_100_v1', credits: 100, amount: 1000, currency: 'eur' } as const;

export async function assertAiCreditsReady(userId: string) {
  const { data, error } = await supabaseAdmin.rpc('ai_credit_balance', { p_user_id: userId });
  if (error || typeof data !== 'number') throw new Error('ai_credits_unavailable');
}

/** Retrieve current Stripe state even for delayed/duplicate webhook snapshots.
 * The browser can request reconciliation, but can never assert payment or amount.
 */
export async function fulfillAiCredits(sessionId: string, expectedUserId?: string): Promise<'paid' | 'pending' | 'ignored' | 'refunded'> {
  const session = await getStripeClient().checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
  if (session.mode !== 'payment' || session.metadata?.kind !== AI_CREDIT_PACK.kind) {
    if (expectedUserId) throw new Error('invalid_credit_session');
    return 'ignored';
  }
  const userId = session.metadata.user_id;
  if (!userId || session.client_reference_id !== userId || (expectedUserId && userId !== expectedUserId)) throw new Error('credit_owner_mismatch');
  if (await isAccountDeleting(userId)) return 'ignored';
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId || (await getBillingEntitlement(userId)).customerId !== customerId) throw new Error('credit_customer_mismatch');
  if (session.payment_status !== 'paid' || session.status !== 'complete') return 'pending';
  const payment = session.payment_intent as Stripe.PaymentIntent | null;
  const charge = payment?.latest_charge as Stripe.Charge | null;
  if (session.amount_total !== AI_CREDIT_PACK.amount || session.currency !== AI_CREDIT_PACK.currency
      || !payment || typeof payment === 'string' || payment.status !== 'succeeded'
      || payment.amount_received !== AI_CREDIT_PACK.amount || payment.currency !== AI_CREDIT_PACK.currency
      || !charge || typeof charge === 'string' || !charge.paid) throw new Error('invalid_credit_payment');
  const { data, error } = await supabaseAdmin.rpc('sync_ai_credit_purchase', {
    p_user_id: userId, p_session_id: session.id, p_payment_intent_id: payment.id,
    p_refunded_cents: charge.amount_refunded,
  });
  if (error || typeof data !== 'number') throw new Error('credit_grant_failed');
  return data === AI_CREDIT_PACK.credits ? 'paid' : 'refunded';
}
