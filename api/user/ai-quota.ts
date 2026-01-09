import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { checkAiMonthlyQuota } from "../_utils/aiQuota.js";
import { getPlanLimits, DEFAULT_PLAN, type PlanTier } from "../_utils/plans.js";

function envTruthy(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);

  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Get user's plan tier from subscription table
    const { data: subscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("plan_tier, custom_limits, status, expires_at")
      .eq("user_id", user.id)
      .single();

    let planTier: PlanTier = DEFAULT_PLAN;
    let customLimits: Record<string, number> | null = null;

    if (subscription && subscription.status === "active") {
      // Check if subscription is expired
      if (subscription.expires_at) {
        const expiresAt = new Date(subscription.expires_at);
        if (expiresAt >= new Date()) {
          planTier = (subscription.plan_tier as PlanTier) || DEFAULT_PLAN;
          customLimits = subscription.custom_limits as Record<string, number> | null;
        }
      } else {
        // No expiration = unlimited active subscription
        planTier = (subscription.plan_tier as PlanTier) || DEFAULT_PLAN;
        customLimits = subscription.custom_limits as Record<string, number> | null;
      }
    }

    const baseLimits = getPlanLimits(planTier);
    const aiJobsLimit = customLimits?.maxAiJobsPerMonth ?? baseLimits.aiJobsPerMonth;
    
    // Check if bypass is enabled
    const bypassEnabled = envTruthy("BYPASS_AI_LIMITS");

    // Always get actual quota/usage (for monitoring purposes)
    const quota = await checkAiMonthlyQuota(user.id, planTier);

    return res.status(200).json({
      bypass: bypassEnabled,
      planTier,
      limit: aiJobsLimit,
      used: quota.used,
      remaining: bypassEnabled ? Infinity : quota.remaining,
    });
  } catch (err: any) {
    console.error("Error fetching AI quota:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
