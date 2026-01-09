import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Stripe } from "stripe";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

export const config = { runtime: "nodejs" };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-12-15.clover",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  const stripeSubscriptionId = session.subscription;
  const customerEmail = session.customer_email;

  if (!userId || !stripeSubscriptionId) {
    console.error("[Stripe Webhook] Missing userId or subscription in session");
    return;
  }

  console.log(`[Stripe Webhook] Checkout completed for user ${userId}`);
  console.log(`[Stripe Webhook] Subscription: ${stripeSubscriptionId}`);

  try {
    // Update user subscription in database
    const { error } = await supabaseAdmin
      .from("user_subscriptions")
      .update({
        plan_tier: "pro",
        status: "active",
        started_at: new Date().toISOString(),
        payment_provider: "stripe",
        external_subscription_id: stripeSubscriptionId as string,
        price_cents: 1900, // 19€
        expires_at: null, // No expiration until cancelled
      })
      .eq("user_id", userId);

    if (error) {
      console.error(`[Stripe Webhook] Failed to update subscription for ${userId}:`, error);
      return;
    }

    console.log(`[Stripe Webhook] Successfully updated subscription for user ${userId}`);
  } catch (err) {
    console.error("[Stripe Webhook] Exception updating subscription:", err);
  }
}

async function handleCustomerSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeCustomerId = subscription.customer as string;
  const stripeSubscriptionId = subscription.id;

  console.log(`[Stripe Webhook] Subscription updated: ${stripeSubscriptionId}`);

  try {
    // Find user by external_subscription_id
    const { data: userSub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("external_subscription_id", stripeSubscriptionId)
      .single();

    if (!userSub) {
      console.log(`[Stripe Webhook] No user found for subscription ${stripeSubscriptionId}`);
      return;
    }

    const userId = userSub.user_id;

    // Map Stripe status to our status
    let status: "active" | "cancelled" | "past_due" | "trialing" = "active";
    if (subscription.status === "active") {
      status = "active";
    } else if (subscription.status === "past_due") {
      status = "past_due";
    } else if (subscription.status === "canceled") {
      status = "cancelled";
    } else if (subscription.status === "trialing") {
      status = "trialing";
    }

    // Update subscription status
    const { error } = await supabaseAdmin
      .from("user_subscriptions")
      .update({
        status,
      })
      .eq("external_subscription_id", stripeSubscriptionId);

    if (error) {
      console.error(`[Stripe Webhook] Failed to update status for ${userId}:`, error);
      return;
    }

    console.log(`[Stripe Webhook] Updated subscription status to ${status} for user ${userId}`);
  } catch (err) {
    console.error("[Stripe Webhook] Exception handling subscription update:", err);
  }
}

async function handleCustomerSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;

  console.log(`[Stripe Webhook] Subscription deleted: ${stripeSubscriptionId}`);

  try {
    // Find user and downgrade to basic
    const { data: userSub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("external_subscription_id", stripeSubscriptionId)
      .single();

    if (!userSub) {
      console.log(`[Stripe Webhook] No user found for subscription ${stripeSubscriptionId}`);
      return;
    }

    const userId = userSub.user_id;

    // Downgrade to basic
    const { error } = await supabaseAdmin
      .from("user_subscriptions")
      .update({
        plan_tier: "basic",
        status: "cancelled",
        payment_provider: null,
        external_subscription_id: null,
        price_cents: 0,
        expires_at: null,
      })
      .eq("user_id", userId);

    if (error) {
      console.error(`[Stripe Webhook] Failed to downgrade ${userId}:`, error);
      return;
    }

    console.log(`[Stripe Webhook] Downgraded user ${userId} to basic plan`);
  } catch (err) {
    console.error("[Stripe Webhook] Exception handling subscription deletion:", err);
  }
}

function isError(error: any): error is Error {
  return error instanceof Error;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const signature = req.headers["stripe-signature"] as string;
  if (!signature) {
    console.error("[Stripe Webhook] Missing signature");
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      WEBHOOK_SECRET
    ) as Stripe.Event;

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleCustomerSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleCustomerSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    const message = isError(err) ? err.message : "Unknown error";
    console.error("[Stripe Webhook] Error processing webhook:", message);
    res.status(400).json({ error: `Webhook error: ${message}` });
  }
}
