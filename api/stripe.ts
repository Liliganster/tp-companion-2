import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { requireSupabaseUser, sendJson } from "./_utils/supabase.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { getPublicAppUrl, getStripeClient, getStripePriceId } from "./_utils/stripeClient.js";
import { getBillingEntitlement, saveStripeCustomerId } from "./_utils/entitlements.js";

import { AI_CREDIT_PACK, assertAiCreditsReady, fulfillAiCredits } from './_utils/aiCredits.js';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

async function getOrCreateStripeCustomer(user: { id: string; email?: string }) {
  const stripe = getStripeClient();
  const existingId = (await getBillingEntitlement(user.id)).customerId;
  if (existingId) return existingId;

  const customer = await stripe.customers.create({
    ...(user.email ? { email: user.email } : {}),
    metadata: { user_id: user.id },
  }, { idempotencyKey: `customer:${user.id}` });

  await saveStripeCustomerId(user.id, customer.id);
  return customer.id;
}

async function handleCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  if (!await enforceRateLimit({ req, res, name: "stripe_checkout", identifier: user.id, limit: 10, windowMs: 60_000 })) return;

  const billing = req.body?.billing;
  if (billing !== "monthly" && billing !== "annual") return sendJson(res, 400, { error: "invalid_billing" });

  try {
    const stripe = getStripeClient();
    const customerId = await getOrCreateStripeCustomer(user);
    const existing = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    if (existing.data.some((subscription) => ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status))) {
      return sendJson(res, 409, { error: "already_subscribed", manage: true });
    }

    const appUrl = getPublicAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: getStripePriceId(billing), quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      locale: "auto",
      metadata: { user_id: user.id, plan_tier: "pro", billing },
      subscription_data: { metadata: { user_id: user.id, plan_tier: "pro", billing } },
      success_url: `${appUrl}/plans?checkout=success`,
      cancel_url: `${appUrl}/plans?checkout=cancelled`,
    });
    if (!session.url) throw new Error("Stripe Checkout returned no URL");
    return sendJson(res, 200, { url: session.url });
  } catch (error: any) {
    console.error("[stripe/checkout] failed", error?.message ?? error);
    return sendJson(res, 500, { error: "checkout_failed" });
  }
}

async function handlePortal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  if (!await enforceRateLimit({ req, res, name: "stripe_portal", identifier: user.id, limit: 10, windowMs: 60_000 })) return;

  try {
    const customerId = (await getBillingEntitlement(user.id)).customerId;
    if (typeof customerId !== "string" || !customerId) return sendJson(res, 409, { error: "no_stripe_customer" });

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getPublicAppUrl()}/plans`,
    });
    return sendJson(res, 200, { url: session.url });
  } catch (error: any) {
    console.error("[stripe/portal] failed", error?.message ?? error);
    return sendJson(res, 500, { error: "portal_failed" });
  }
}

async function handleCredits(req: VercelRequest, res: VercelResponse, confirm: boolean) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { error: 'method_not_allowed' }); }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  res.setHeader('Cache-Control', 'private, no-store');
  if (!await enforceRateLimit({ req, res, name: 'stripe_credits', identifier: user.id, limit: 10, windowMs: 60_000 })) return;
  try {
    if (confirm) {
      const sessionId = req.body?.sessionId;
      if (typeof sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]{1,200}$/.test(sessionId)) return sendJson(res, 400, { error: 'invalid_session' });
      return sendJson(res, 200, { status: await fulfillAiCredits(sessionId, user.id) });
    }
    const purchaseId = req.body?.purchaseId;
    if (typeof purchaseId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseId)) return sendJson(res, 400, { error: 'invalid_purchase_id' });
    // Never start a payable checkout before the durable credit ledger is available.
    await assertAiCreditsReady(user.id);
    const customer = await getOrCreateStripeCustomer(user);
    const session = await getStripeClient().checkout.sessions.create({
      mode: 'payment', customer, client_reference_id: user.id,
      line_items: [{ quantity: 1, price_data: {
        currency: AI_CREDIT_PACK.currency, unit_amount: AI_CREDIT_PACK.amount, tax_behavior: 'inclusive',
        product_data: { name: 'FahrtenbuchPro · 100 AI credits' },
      } }],
      locale: 'auto',
      metadata: { kind: AI_CREDIT_PACK.kind, user_id: user.id },
      success_url: `${getPublicAppUrl()}/plans?credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getPublicAppUrl()}/plans?credits=cancelled`,
    }, { idempotencyKey: `ai-credits:${user.id}:${purchaseId}` });
    if (!session.url) throw new Error('missing_checkout_url');
    return sendJson(res, 200, { url: session.url });
  } catch (error: any) {
    console.error('[stripe/credits] failed', error?.message);
    return sendJson(res, 503, { error: 'ai_credits_unavailable' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");
  if (path === '/api/stripe/credits') return handleCredits(req, res, false);
  if (path === '/api/stripe/credits/confirm') return handleCredits(req, res, true);
  if (path === "/api/stripe/checkout") return handleCheckout(req, res);
  if (path === "/api/stripe/portal") return handlePortal(req, res);
  return sendJson(res, 404, { error: "not_found" });
}
