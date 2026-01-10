import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { PLAN_LIMITS, type PlanTier } from "./plans.js";

export const config = { runtime: "nodejs" };

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
  tier: PlanTier
) {
  const baseLimits = PLAN_LIMITS[tier] || PLAN_LIMITS.basic;

  return baseLimits;
}

function normalizeTier(input: unknown): PlanTier {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "pro") return "pro";
  if (v === "basic") return "basic";
  if (v === "free") return "basic";
  return "basic";
}

async function handleGet(userId: string, res: VercelResponse) {
  const { data: profile, error } = await supabaseAdmin
    .from("user_profiles")
    .select("plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user_profiles plan_tier:", error);
  }

  const tier = normalizeTier((profile as any)?.plan_tier);

  const planInfo: PlanInfo = {
    tier,
    status: "active",
    limits: getEffectiveLimits(tier),
    startedAt: null,
    expiresAt: null,
    priceCents: tier === "pro" ? 1900 : 0,
    currency: "EUR",
  };

  return sendJson(res, 200, planInfo);
}

// Admin endpoint to upgrade/downgrade users (requires service role or admin check)
async function handlePost(
  userId: string,
  body: { tier: PlanTier },
  res: VercelResponse
) {
  const { tier } = body;

  if (!["basic", "pro", "enterprise"].includes(tier)) {
    return sendJson(res, 400, { error: "Invalid plan tier" });
  }

  console.log(`[Subscription] User ${userId} upgrading to ${tier}`);

  // This endpoint now uses a single source of truth: user_profiles.plan_tier
  // (custom limits are intentionally not supported in this simplified model).

  try {
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        { id: userId, plan_tier: tier, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) {
      console.error(`[Subscription] Error updating user_profiles for ${userId}:`, error);
      return sendJson(res, 500, { error: "Failed to update user profile plan" });
    }

    console.log(`[Subscription] Successfully updated ${userId} to ${tier}`);

    const planInfo: PlanInfo = {
      tier,
      status: "active",
      limits: getEffectiveLimits(tier),
      startedAt: null,
      expiresAt: null,
      priceCents: tier === "pro" ? 1900 : 0,
      currency: "EUR",
    };

    return sendJson(res, 200, planInfo);
  } catch (err) {
    console.error(`[Subscription] Exception updating subscription for ${userId}:`, err);
    return sendJson(res, 500, { error: "Internal server error" });
  }
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
