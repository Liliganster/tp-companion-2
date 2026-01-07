import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { requireSupabaseUser, getAdminClient } from "../_utils/supabase";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:5173";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  try {
    const supabase = getAdminClient();
    
    // Get user's Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
    });

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${APP_URL}/settings`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error("Portal session error:", error);
    return res.status(500).json({
      error: "Failed to create portal session",
      message: error.message,
    });
  }
}
