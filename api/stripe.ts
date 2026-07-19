import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { requireSupabaseUser, sendJson } from "./_utils/supabase.js";
import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { getPublicAppUrl, getStripeClient, getStripePriceId } from "./_utils/stripeClient.js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

async function getOrCreateStripeCustomer(user: { id: string; email?: string }) {
  const stripe = getStripeClient();
  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const existingId = typeof (profile as any)?.stripe_customer_id === "string"
    ? (profile as any).stripe_customer_id
    : null;
  if (existingId) return existingId;

  const customer = await stripe.customers.create({
    ...(user.email ? { email: user.email } : {}),
    metadata: { user_id: user.id },
  }, { idempotencyKey: `customer:${user.id}` });

  const { error } = await supabaseAdmin.from("user_profiles").upsert({
    id: user.id,
    stripe_customer_id: customer.id,
    stripe_updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error(`Unable to save Stripe customer: ${error.message}`);
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
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    const customerId = (profile as any)?.stripe_customer_id;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");
  if (path === "/api/stripe/checkout") return handleCheckout(req, res);
  if (path === "/api/stripe/portal") return handlePortal(req, res);
  return sendJson(res, 404, { error: "not_found" });
}

