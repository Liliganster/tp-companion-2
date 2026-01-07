import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { requireSupabaseUser } from "../_utils/supabase";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO;
const APP_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:5173";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate Stripe configuration
  if (!STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY not configured");
    return res.status(500).json({ error: "Stripe not configured" });
  }

  if (!STRIPE_PRICE_PRO) {
    console.error("STRIPE_PRICE_PRO not configured");
    return res.status(500).json({ error: "Stripe price not configured" });
  }

  // Require authenticated user
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
    });

    const { priceId, planId } = req.body ?? {};

    // Validate plan
    if (planId !== "pro") {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // Use configured price or provided priceId
    const price = priceId || STRIPE_PRICE_PRO;

    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    let customerId: string;
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price,
          quantity: 1,
        },
      ],
      success_url: `${APP_URL}/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/plans?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_id: planId,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: {
        enabled: true,
      },
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    return res.status(500).json({
      error: "Failed to create checkout session",
      message: error.message,
    });
  }
}
