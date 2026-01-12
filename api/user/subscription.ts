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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  try {
    if (req.method === "GET") {
      return handleGet(user.id, res);
    }

    // IMPORTANT: do not allow users to self-upgrade by calling this endpoint.
    // Plan tier should be updated by Stripe webhook (or a separate admin-only path).
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Subscription API error:", error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
}
