import type Stripe from "stripe";
import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { getAllowedStripePriceIds, getStripeClient, getStripeWebhookSecret } from "./_utils/stripeClient.js";
import {
  getPlanTierForSubscription,
  getSubscriptionCustomerId,
  getSubscriptionPeriodEnd,
  getSubscriptionPriceId,
  getSubscriptionUserId,
} from "./_utils/stripeSubscription.js";

async function findUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const metadataId = getSubscriptionUserId(subscription);
  if (metadataId) return metadataId;

  const customerId = getSubscriptionCustomerId(subscription);
  const { data: byCustomer } = await supabaseAdmin
    .from("user_profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if ((byCustomer as any)?.id) return String((byCustomer as any).id);

  const { data: bySubscription } = await supabaseAdmin
    .from("user_profiles")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  return (bySubscription as any)?.id ? String((bySubscription as any).id) : null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = await findUserId(subscription);
  if (!userId) throw new Error(`No user mapping for Stripe subscription ${subscription.id}`);

  const { error } = await supabaseAdmin.from("user_profiles").upsert({
    id: userId,
    plan_tier: getPlanTierForSubscription(subscription, getAllowedStripePriceIds()),
    stripe_customer_id: getSubscriptionCustomerId(subscription),
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    stripe_price_id: getSubscriptionPriceId(subscription),
    stripe_current_period_end: getSubscriptionPeriodEnd(subscription),
    stripe_cancel_at_period_end: subscription.cancel_at_period_end,
    stripe_updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error(`Unable to sync Stripe subscription: ${error.message}`);
}

function getInvoiceSubscriptionId(invoice: any): string | null {
  const value = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription;
  if (typeof value === "string") return value;
  if (value?.id && typeof value.id === "string") return value.id;
  return null;
}

async function processEvent(event: Stripe.Event) {
  const stripe = getStripeClient();
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncSubscription(event.data.object as Stripe.Subscription);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
    if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const subscriptionId = getInvoiceSubscriptionId(event.data.object);
    if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

    const signature = request.headers.get("stripe-signature");
    if (!signature) return Response.json({ error: "missing_signature" }, { status: 400 });

    const rawBody = await request.text();
    let event: Stripe.Event;
    try {
      event = getStripeClient().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
    } catch (error: any) {
      console.warn("[stripe/webhook] invalid signature", error?.message ?? error);
      return Response.json({ error: "invalid_signature" }, { status: 400 });
    }

    try {
      await processEvent(event);
      return Response.json({ received: true });
    } catch (error: any) {
      console.error("[stripe/webhook] processing failed", { eventId: event.id, eventType: event.type, message: error?.message });
      return Response.json({ error: "processing_failed" }, { status: 500 });
    }
  },
};

