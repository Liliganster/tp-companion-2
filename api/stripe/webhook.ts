import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Stripe } from "stripe";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

export const config = { runtime: "nodejs" };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  // Vercel may populate req.body; Stripe signature verification requires the raw payload bytes.
  const bodyAny = (req as any).body;
  if (Buffer.isBuffer(bodyAny)) return bodyAny;
  if (typeof bodyAny === "string") return Buffer.from(bodyAny, "utf8");

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return null;

  try {
    // Prefer Admin API (works with service role). PostgREST does not expose auth schema by default.
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000, page: 1 });
    if (error) {
      console.error("[Stripe Webhook] Failed to list users:", error);
      return null;
    }
    const users = (data as any)?.users as any[] | undefined;
    const match = users?.find((u) => String(u?.email ?? "").trim().toLowerCase() === normalized);
    return (match as any)?.id ?? null;
  } catch (err) {
    console.error("[Stripe Webhook] Exception looking up user by email:", err);
    return null;
  }
}

async function setUserProfilePlanTier(userId: string, planTier: "basic" | "pro") {
  try {
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        { id: userId, plan_tier: planTier, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) {
      console.error(`[Stripe Webhook] Failed to update user_profiles for ${userId}:`, error);
    }
  } catch (err) {
    console.error("[Stripe Webhook] Exception updating user_profiles:", err);
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const directUserId =
    typeof session.client_reference_id === "string" && session.client_reference_id.trim()
      ? session.client_reference_id.trim()
      : null;

  const customerEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  let userId = directUserId;
  if (!userId) {
    if (!customerEmail) {
      console.error("[Stripe Webhook] Missing client_reference_id and customer email in checkout session");
      return;
    }

    userId = await findUserIdByEmail(customerEmail);
    if (!userId) {
      console.error(`[Stripe Webhook] No Supabase user found for email ${customerEmail}`);
      return;
    }
  }

  console.log(
    `[Stripe Webhook] Checkout completed for user ${userId}` +
      (customerEmail ? ` (email ${customerEmail})` : "")
  );
  if (stripeSubscriptionId) console.log(`[Stripe Webhook] Subscription: ${stripeSubscriptionId}`);

  try {
    // Primary: keep plan on the user profile (simpler model)
    await setUserProfilePlanTier(userId, "pro");

    console.log(`[Stripe Webhook] Successfully upgraded user ${userId} to pro`);
  } catch (err) {
    console.error("[Stripe Webhook] Exception updating subscription:", err);
  }
}

async function handleCustomerSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;

  console.log(`[Stripe Webhook] Subscription updated: ${stripeSubscriptionId}`);

  try {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
    if (!customerId) {
      console.log(`[Stripe Webhook] Missing customer on subscription ${stripeSubscriptionId}`);
      return;
    }

    const customer = await stripe.customers.retrieve(customerId);
    const email = typeof (customer as any)?.email === "string" ? (customer as any).email : null;
    if (!email) {
      console.log(`[Stripe Webhook] No customer email for subscription ${stripeSubscriptionId}`);
      return;
    }

    const userId = await findUserIdByEmail(email);
    if (!userId) {
      console.log(`[Stripe Webhook] No Supabase user found for email ${email}`);
      return;
    }

    const isActive = subscription.status === "active" || subscription.status === "trialing";
    await setUserProfilePlanTier(userId, isActive ? "pro" : "basic");

    console.log(
      `[Stripe Webhook] Synced user ${userId} to ${isActive ? "pro" : "basic"} (status=${subscription.status})`
    );
  } catch (err) {
    console.error("[Stripe Webhook] Exception handling subscription update:", err);
  }
}

async function handleCustomerSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;

  console.log(`[Stripe Webhook] Subscription deleted: ${stripeSubscriptionId}`);

  try {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
    if (!customerId) {
      console.log(`[Stripe Webhook] Missing customer on subscription ${stripeSubscriptionId}`);
      return;
    }

    const customer = await stripe.customers.retrieve(customerId);
    const email = typeof (customer as any)?.email === "string" ? (customer as any).email : null;
    if (!email) {
      console.log(`[Stripe Webhook] No customer email for subscription ${stripeSubscriptionId}`);
      return;
    }

    const userId = await findUserIdByEmail(email);
    if (!userId) {
      console.log(`[Stripe Webhook] No Supabase user found for email ${email}`);
      return;
    }

    await setUserProfilePlanTier(userId, "basic");
    console.log(`[Stripe Webhook] Downgraded user ${userId} to basic plan`);
  } catch (err) {
    console.error("[Stripe Webhook] Exception handling subscription deletion:", err);
  }
}

function isError(error: any): error is Error {
  return error instanceof Error;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    res.status(200).send("ok");
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("[Stripe Webhook] Missing STRIPE_SECRET_KEY");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  if (!WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] Missing STRIPE_WEBHOOK_SECRET");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const signature = req.headers["stripe-signature"] as string;
  if (!signature) {
    console.error("[Stripe Webhook] Missing signature");
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET) as Stripe.Event;

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
