import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { getPlanLimits, type PlanTier } from "./plans.js";
import { getServerPlanTier } from "./entitlements.js";
import { getFreeIdentityHash } from "./freeUsage.js";
import { assertStorageOwnership } from "./storageOwnership.js";

export type QuotaDecision = { allowed: boolean; limit: number; used: number; remaining: number; reserved?: number; reason?: string };
export type AiReservation = { allowed: boolean; completed?: boolean; busy?: boolean; reason?: string; requestId?: string; storagePath?: string; userId: string; jobId: string; attemptId: string };
export class AiQuotaUnavailableError extends Error {
  constructor() { super("ai_quota_unavailable"); }
}

async function quotaContext(userId: string, plan?: PlanTier | string | null) {
  const tier = plan ?? await getServerPlanTier(userId);
  const identity = tier === "pro" ? null : await getFreeIdentityHash(userId);
  if (tier !== "pro" && !identity) throw new AiQuotaUnavailableError();
  return { p_user_id: userId, p_limit: getPlanLimits(tier).aiJobsPerMonth, p_identity_hash: identity };
}

export async function checkAiMonthlyQuota(userId: string, plan?: PlanTier | string | null): Promise<QuotaDecision> {
  const { data, error } = await supabaseAdmin.rpc("ai_quota_snapshot", await quotaContext(userId, plan));
  if (error || !data || typeof data.remaining !== "number") throw new AiQuotaUnavailableError();
  return data as QuotaDecision;
}

export async function reserveAiQuota(userId: string, jobId: string, plan?: PlanTier | string | null, newRequestId?: string): Promise<AiReservation> {
  const { data: job, error: jobError } = await supabaseAdmin.from("callsheet_jobs")
    .select("storage_path").eq("id", jobId).eq("user_id", userId).single();
  if (jobError || !job) throw new Error("job_not_found");
  // A quota reservation or reprocess must never authorize an arbitrary file.
  await assertStorageOwnership(userId, "callsheets", job.storage_path);
  const attemptId = randomUUID();
  const { data, error } = await supabaseAdmin.rpc("reserve_ai_quota", {
    ...await quotaContext(userId, plan), p_job_id: jobId, p_attempt_id: attemptId,
    p_new_request_id: newRequestId ?? null,
  });
  if (error || !data || typeof data.allowed !== "boolean") throw new AiQuotaUnavailableError();
  return { ...data, userId, jobId, attemptId } as AiReservation;
}

export async function finishAiQuota(reservation: AiReservation, success: boolean): Promise<boolean> {
  if (!reservation.allowed || !reservation.requestId) return false;
  const { data, error } = await supabaseAdmin.rpc("finish_ai_quota", {
    p_user_id: reservation.userId, p_job_id: reservation.jobId,
    p_request_id: reservation.requestId, p_attempt_id: reservation.attemptId, p_success: success,
  });
  if (error || typeof data !== "boolean") throw new AiQuotaUnavailableError();
  return data;
}
