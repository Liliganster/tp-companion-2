import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { PLAN_LIMITS, type PlanTier } from "./plans.js";

export const config = { runtime: "nodejs" };

interface UserSubscription {
  id: string;
  user_id: string;
  plan_tier: PlanTier;
  status: "active" | "cancelled" | "past_due" | "trialing";
  started_at: string | null;
  expires_at: string | null;
  custom_limits: Record<string, number> | null;
  price_cents: number | null;
  currency: string;
}

interface PlanInfo {
  tier: PlanTier;
  status: string;
  limits: {
    maxTrips: number;
    maxProjects: number;
    maxAiJobsPerMonth: number;
    maxStopsPerTrip: number;
    maxRouteTemplates: number;
  };
  startedAt: string | null;
  expiresAt: string | null;
  priceCents: number | null;
  currency: string;
}

function getEffectiveLimits(
  tier: PlanTier,
  customLimits: Record<string, number> | null
) {
  const baseLimits = PLAN_LIMITS[tier] || PLAN_LIMITS.basic;
  
  if (!customLimits) return baseLimits;
  
  return {
    maxTrips: customLimits.maxTrips ?? baseLimits.maxTrips,
    maxProjects: customLimits.maxProjects ?? baseLimits.maxProjects,
    maxAiJobsPerMonth: customLimits.maxAiJobsPerMonth ?? baseLimits.maxAiJobsPerMonth,
    maxStopsPerTrip: customLimits.maxStopsPerTrip ?? baseLimits.maxStopsPerTrip,
    maxRouteTemplates: customLimits.maxRouteTemplates ?? baseLimits.maxRouteTemplates,
  };
}

async function getSubscription(userId: string): Promise<UserSubscription | null> {
  const { data, error } = await supabaseAdmin
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching subscription:", error);
    throw error;
  }

  return data;
}

async function createDefaultSubscription(userId: string): Promise<UserSubscription> {
  const { data, error } = await supabaseAdmin
    .from("user_subscriptions")
    .insert({
      user_id: userId,
      plan_tier: "basic",
      status: "active",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating subscription:", error);
    throw error;
  }

  return data;
}

async function handleGet(userId: string, res: VercelResponse) {
  let subscription = await getSubscription(userId);

  // Create default subscription if doesn't exist
  if (!subscription) {
    subscription = await createDefaultSubscription(userId);
  }

  const planInfo: PlanInfo = {
    tier: subscription.plan_tier as PlanTier,
    status: subscription.status,
    limits: getEffectiveLimits(
      subscription.plan_tier as PlanTier,
      subscription.custom_limits
    ),
    startedAt: subscription.started_at,
    expiresAt: subscription.expires_at,
    priceCents: subscription.price_cents,
    currency: subscription.currency,
  };

  return sendJson(res, 200, planInfo);
}

// Admin endpoint to upgrade/downgrade users (requires service role or admin check)
async function handlePost(
  userId: string,
  body: { tier: PlanTier; customLimits?: Record<string, number> },
  res: VercelResponse
) {
  const { tier, customLimits } = body;

  if (!["basic", "pro", "enterprise"].includes(tier)) {
    return sendJson(res, 400, { error: "Invalid plan tier" });
  }

  const updateData: Record<string, any> = {
    plan_tier: tier,
    status: "active",
  };

  if (tier === "pro") {
    updateData.price_cents = 1900; // 19€
    updateData.started_at = new Date().toISOString();
    // Pro subscription doesn't expire by default (until cancelled)
    updateData.expires_at = null;
  } else if (tier === "basic") {
    updateData.price_cents = 0;
    updateData.expires_at = null;
  }

  if (customLimits) {
    updateData.custom_limits = customLimits;
  }

  const { data, error } = await supabaseAdmin
    .from("user_subscriptions")
    .upsert({
      user_id: userId,
      ...updateData,
    })
    .select()
    .single();

  if (error) {
    console.error("Error updating subscription:", error);
    return sendJson(res, 500, { error: "Failed to update subscription" });
  }

  const planInfo: PlanInfo = {
    tier: data.plan_tier as PlanTier,
    status: data.status,
    limits: getEffectiveLimits(data.plan_tier as PlanTier, data.custom_limits),
    startedAt: data.started_at,
    expiresAt: data.expires_at,
    priceCents: data.price_cents,
    currency: data.currency,
  };

  return sendJson(res, 200, planInfo);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  try {
    if (req.method === "GET") {
      return handleGet(user.id, res);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      return handlePost(user.id, body, res);
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Subscription API error:", error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
}
