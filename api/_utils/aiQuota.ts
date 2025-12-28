import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

export type PlanTier = "free" | "pro";

export type QuotaDecision = {
  allowed: boolean;
  tier: PlanTier;
  limit: number;
  used: number;
  reason?: string;
};

function envTruthy(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function startOfCurrentMonthUtcIso(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return start.toISOString();
}

function limitForTier(tier: PlanTier): number {
  return tier === "pro" ? 100 : 5;
}

async function readUserTier(userId: string): Promise<PlanTier> {
  try {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("plan_tier")
      .eq("id", userId)
      .maybeSingle();

    if (error) return "free";
    const raw = String((data as any)?.plan_tier ?? "free").toLowerCase();
    return raw === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

async function countDoneExtractionsThisMonth(userId: string, sinceIso: string): Promise<number> {
  const countTable = async (table: "invoice_jobs" | "callsheet_jobs") => {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "done")
      .gte("processed_at", sinceIso);

    if (error) return 0;
    return typeof count === "number" ? count : 0;
  };

  const [invoice, callsheet] = await Promise.all([countTable("invoice_jobs"), countTable("callsheet_jobs")]);
  return invoice + callsheet;
}

export async function checkAiMonthlyQuota(userId: string): Promise<QuotaDecision> {
  // For testing/dev: bypass hard quota limits (anti-abuse rate limiting still applies).
  if (envTruthy("BYPASS_AI_LIMITS")) {
    const tier = await readUserTier(userId);
    const limit = limitForTier(tier);
    const used = 0;
    return { allowed: true, tier, limit, used };
  }

  const tier = await readUserTier(userId);
  const limit = limitForTier(tier);
  const sinceIso = startOfCurrentMonthUtcIso();
  const used = await countDoneExtractionsThisMonth(userId, sinceIso);

  if (used >= limit) {
    return {
      allowed: false,
      tier,
      limit,
      used,
      reason: `monthly_quota_exceeded:${tier}:${used}/${limit}`,
    };
  }

  return { allowed: true, tier, limit, used };
}
