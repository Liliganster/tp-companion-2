import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { getPlanLimits, DEFAULT_PLAN, type PlanTier } from "./plans.js";

// Get AI monthly limit from plan (default to basic plan)
function getAIMonthlyLimit(planTier?: PlanTier | string | null): number {
  return getPlanLimits(planTier ?? DEFAULT_PLAN).aiJobsPerMonth;
}

export type QuotaDecision = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
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

function isMissingRelation(err: any): boolean {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("could not find the relation") ||
    msg.includes("schema cache")
  );
}

function processingCutoffIso(minutes: number): string {
  const now = Date.now();
  return new Date(now - minutes * 60_000).toISOString();
}

async function countExtractionsThisMonth(
  userId: string,
  sinceIso: string,
): Promise<{ done: number; processing: number }> {
  const cutoffIso = processingCutoffIso(30);

  const countDoneFromUsage = async (): Promise<number | null> => {
    const { count, error } = await supabaseAdmin
      .from("ai_usage_events")
      .select("id", { count: "exact" })
      .range(0, 0)
      .eq("user_id", userId)
      .eq("status", "done")
      .gte("run_at", sinceIso);

    if (error) {
      if (isMissingRelation(error)) return null;
      // Best-effort: fall back to job tables if something went wrong.
      return null;
    }

    return typeof count === "number" ? count : 0;
  };

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

  const [doneFromUsage, invoiceDone, callsheetDone, invoiceProcessing, callsheetProcessing] = await Promise.all([
    countDoneFromUsage(),
    countTable("invoice_jobs", "done"),
    countTable("callsheet_jobs", "done"),
    countTable("invoice_jobs", "processing"),
    countTable("callsheet_jobs", "processing"),
  ]);

  return {
    done: typeof doneFromUsage === "number" ? doneFromUsage : invoiceDone + callsheetDone,
    processing: invoiceProcessing + callsheetProcessing,
  };
}

export async function checkAiMonthlyQuota(userId: string, planTier?: PlanTier | string | null): Promise<QuotaDecision> {
  const limit = getAIMonthlyLimit(planTier);
  const sinceIso = startOfCurrentMonthUtcIso();
  const counts = await countExtractionsThisMonth(userId, sinceIso);
  const reserved = counts.done + counts.processing;

  // When bypass is enabled, always allow but still count usage for monitoring
  if (envTruthy("BYPASS_AI_LIMITS")) {
    return { allowed: true, limit, used: counts.done, remaining: Infinity };
  }

  // Only "done" is billed/visible as usage, but we also reserve slots while jobs are processing
  // to avoid spawning more Gemini calls than the limit allows.
  if (counts.done >= limit || reserved > limit) {
    return {
      allowed: false,
      limit,
      // If we are denying, consider the user at their limit (even if some slots are reserved by in-flight jobs).
      used: limit,
      remaining: 0,
      reason: `monthly_quota_exceeded:${limit}/${limit}:reserved=${reserved}:done=${counts.done}:processing=${counts.processing}`,
    };
  }

  return { allowed: true, limit, used: counts.done, remaining: limit - counts.done };
}

/**
 * Record AI usage for quota tracking
 */
export async function recordAiUsage(userId: string, kind: string, jobId: string): Promise<void> {
  try {
    await supabaseAdmin.from("ai_usage_events").insert({
      user_id: userId,
      kind,
      job_id: jobId,
      run_at: new Date().toISOString(),
      status: "done",
    });
  } catch (err) {
    // Best-effort - don't fail the request if recording fails
    console.warn("Failed to record AI usage:", err);
  }
}
