import type Stripe from "stripe";
import { getAllowedStripePriceIds, getStripeClient, getStripeWebhookSecret } from "./_utils/stripeClient.js";
import { findUserIdByStripeIds, saveStripeSubscription } from "./_utils/entitlements.js";
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
  return findUserIdByStripeIds(getSubscriptionCustomerId(subscription), subscription.id);
}

async function syncSubscription(subscription: Stripe.Subscription, eventCreated: number) {
  const userId = await findUserId(subscription);
  if (!userId) throw new Error(`No user mapping for Stripe subscription ${subscription.id}`);

  await saveStripeSubscription({
    userId,
    planTier: getPlanTierForSubscription(subscription, getAllowedStripePriceIds()),
    customerId: getSubscriptionCustomerId(subscription),
    subscriptionId: subscription.id,
    status: subscription.status,
    priceId: getSubscriptionPriceId(subscription),
    currentPeriodEnd: getSubscriptionPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    eventCreatedAt: new Date(eventCreated * 1000).toISOString(),
  });
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
    // Stripe no garantiza el orden de los webhooks. Recuperar el recurso
    // actual evita que un evento antiguo vuelva a conceder o quite Pro.
    const snapshot = event.data.object as Stripe.Subscription;
    const latest = await stripe.subscriptions.retrieve(snapshot.id);
    await syncSubscription(latest, event.created);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
    if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId), event.created);
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const subscriptionId = getInvoiceSubscriptionId(event.data.object);
    if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId), event.created);
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
