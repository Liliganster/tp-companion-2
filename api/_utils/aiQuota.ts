import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

// Monthly AI extraction limit for all users
const AI_MONTHLY_LIMIT = 5;

export type QuotaDecision = {
  allowed: boolean;
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

export async function checkAiMonthlyQuota(userId: string): Promise<QuotaDecision> {
  const limit = AI_MONTHLY_LIMIT;

  if (envTruthy("BYPASS_AI_LIMITS")) {
    return { allowed: true, limit, used: 0 };
  }

  const sinceIso = startOfCurrentMonthUtcIso();
  const counts = await countExtractionsThisMonth(userId, sinceIso);
  const reserved = counts.done + counts.processing;

  // Only "done" is billed/visible as usage, but we also reserve slots while jobs are processing
  // to avoid spawning more Gemini calls than the limit allows.
  if (counts.done >= limit || reserved > limit) {
    return {
      allowed: false,
      limit,
      // If we are denying, consider the user at their limit (even if some slots are reserved by in-flight jobs).
      used: limit,
      reason: `monthly_quota_exceeded:${limit}/${limit}:reserved=${reserved}:done=${counts.done}:processing=${counts.processing}`,
    };
  }

  return { allowed: true, limit, used: counts.done };
}
