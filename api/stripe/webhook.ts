import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Disable body parsing to get raw body for webhook verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("Stripe webhook not configured");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Missing signature" });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase configuration");
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Helper to update user profile
  async function updateUserProfile(filter: string, data: Record<string, any>) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?${filter}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Supabase update failed: ${response.status} ${text}`);
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id || session.client_reference_id;
        const planId = session.metadata?.plan_id || "pro";

        if (userId) {
          console.log(`Processing checkout for user: ${userId}`);
          
          // 1. Update user profile in Supabase
          await updateUserProfile(`id=eq.${userId}`, {
            plan_id: planId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            subscription_status: "active",
            subscription_updated_at: new Date().toISOString(),
          });

          // 2. IMPORTANT: Sync identity back to Stripe Customer
          // This ensures that future subscription.updated/deleted events 
          // (which might lack session metadata) will carry this info.
          if (session.customer && typeof session.customer === "string") {
            try {
              await stripe.customers.update(session.customer, {
                metadata: { supabase_user_id: userId }
              });
              console.log(`Synced Supabase User ID ${userId} to Stripe Customer ${session.customer}`);
            } catch (customerErr: any) {
              console.error("Failed to sync identity to Stripe Customer:", customerErr.message);
            }
          }
          
          console.log(`Successfully upgraded user ${userId} to ${planId}`);
        } else {
          console.error("No userId found in checkout session metadata or client_reference_id");
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        let userId = subscription.metadata?.supabase_user_id;

        // If metadata is missing, fallback to searching by stripe_customer_id
        if (!userId && subscription.customer) {
          console.log(`Missing metadata in subscription. Falling back to customer lookup: ${subscription.customer}`);
          const response = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?stripe_customer_id=eq.${subscription.customer}&select=id`, {
            headers: {
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: SUPABASE_SERVICE_ROLE_KEY!,
            },
          });
          if (response.ok) {
            const users = await response.json() as any[];
            userId = users[0]?.id;
          }
        }

        if (userId) {
          await updateUserProfile(`id=eq.${userId}`, {
            subscription_status: subscription.status,
            subscription_cancel_at_period_end: subscription.cancel_at_period_end,
            subscription_current_period_end: (subscription as any).current_period_end
              ? new Date((subscription as any).current_period_end * 1000).toISOString()
              : null,
            subscription_updated_at: new Date().toISOString(),
          });
          console.log(`Updated subscription for user ${userId}: ${subscription.status}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        let userId = subscription.metadata?.supabase_user_id;

        // Fallback for missing metadata
        if (!userId && subscription.customer) {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?stripe_customer_id=eq.${subscription.customer}&select=id`, {
            headers: {
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: SUPABASE_SERVICE_ROLE_KEY!,
            },
          });
          if (response.ok) {
            const users = await response.json() as any[];
            userId = users[0]?.id;
          }
        }

        if (userId) {
          await updateUserProfile(`id=eq.${userId}`, {
            plan_id: "free",
            subscription_status: "canceled",
            subscription_updated_at: new Date().toISOString(),
          });
          console.log(`User ${userId} downgraded to free`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription as string;

        if (subscriptionId) {
          await updateUserProfile(`stripe_subscription_id=eq.${subscriptionId}`, {
            subscription_status: "past_due",
            subscription_updated_at: new Date().toISOString(),
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
