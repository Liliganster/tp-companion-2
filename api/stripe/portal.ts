import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { requireSupabaseUser } from "../_utils/supabase";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  try {
    // Get user's Stripe customer ID
    const url = new URL(`${SUPABASE_URL}/rest/v1/user_profiles`);
    url.searchParams.set("select", "stripe_customer_id");
    url.searchParams.set("id", `eq.${user.id}`);
    url.searchParams.set("limit", "1");

    const profileResponse = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    const data = await profileResponse.json().catch(() => []);
    const profiles: any[] = Array.isArray(data) ? data : [];
    const profile = profiles?.[0];

    if (!profile?.stripe_customer_id) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

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
