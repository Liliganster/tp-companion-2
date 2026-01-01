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

function processingCutoffIso(minutes: number): string {
  const now = Date.now();
  return new Date(now - minutes * 60_000).toISOString();
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

async function countExtractionsThisMonth(
  userId: string,
  sinceIso: string,
): Promise<{ done: number; processing: number }> {
  const cutoffIso = processingCutoffIso(30);

  const countTable = async (table: "invoice_jobs" | "callsheet_jobs", status: "done" | "processing") => {
    let q = supabaseAdmin
      .from(table)
      // Avoid HEAD requests: some networks/proxies can fail them and return a wrong count.
      .select("id", { count: "exact" })
      // Use GET + small range to still get `count` without HEAD.
      .range(0, 0)
      .eq("user_id", userId)
      .eq("status", status);

    // done counts since month start; processing is "reserved" only while recent to avoid blocking forever.
    q = q.gte("processed_at", status === "done" ? sinceIso : cutoffIso);

    const { count, error } = await q;
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  };

  const [invoiceDone, callsheetDone, invoiceProcessing, callsheetProcessing] = await Promise.all([
    countTable("invoice_jobs", "done"),
    countTable("callsheet_jobs", "done"),
    countTable("invoice_jobs", "processing"),
    countTable("callsheet_jobs", "processing"),
  ]);

  return {
    done: invoiceDone + callsheetDone,
    processing: invoiceProcessing + callsheetProcessing,
  };
}

export async function checkAiMonthlyQuota(userId: string): Promise<QuotaDecision> {
  if (envTruthy("BYPASS_AI_LIMITS")) {
    const tier = await readUserTier(userId);
    const limit = limitForTier(tier);
    const used = 0;
    return { allowed: true, tier, limit, used };
  }

  const tier = await readUserTier(userId);
  const limit = limitForTier(tier);
  const sinceIso = startOfCurrentMonthUtcIso();
  const counts = await countExtractionsThisMonth(userId, sinceIso);
  const reserved = counts.done + counts.processing;

  // Only "done" is billed/visible as usage, but we also reserve slots while jobs are processing
  // to avoid spawning more Gemini calls than the plan allows.
  if (counts.done >= limit || reserved > limit) {
    return {
      allowed: false,
      tier,
      limit,
      // If we are denying, consider the user at their limit (even if some slots are reserved by in-flight jobs).
      used: limit,
      reason: `monthly_quota_exceeded:${tier}:${limit}/${limit}:reserved=${reserved}:done=${counts.done}:processing=${counts.processing}`,
    };
  }

  return { allowed: true, tier, limit, used: counts.done };
}
