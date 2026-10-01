import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { type PlanTier } from "./plans.js";
import { getCallsheetQuotaPolicy } from "./callsheetQuotaPolicy.js";
import { getFreeIdentityHash } from "./freeUsage.js";
import { assertStorageOwnership } from "./storageOwnership.js";

export type QuotaDecision = { allowed: boolean; limit: number; used: number; remaining: number; reserved?: number; planRemaining?: number; creditBalance?: number; creditReserved?: number; creditsAvailable?: number; bypass?: boolean; period?: "monthly" | "annual"; periodStart?: string; periodEnd?: string; planTier?: PlanTier; reason?: string };
export type AiReservation = { allowed: boolean; completed?: boolean; busy?: boolean; retryCount?: number; reason?: string; requestId?: string; storagePath?: string; userId: string; jobId: string; attemptId: string };
export class AiQuotaUnavailableError extends Error {
  constructor() { super("ai_quota_unavailable"); }
}

// PostgreSQL integer ceiling: removes the plan's monthly cap for test accounts
// while preserving atomic reservations, ownership checks and usage accounting.
export const AI_QUOTA_BYPASS_LIMIT = 2_147_483_647;

export function isAiQuotaBypassed(userId: string): boolean {
  if (!['1', 'true', 'yes', 'on'].includes((process.env.BYPASS_AI_LIMITS ?? '').trim().toLowerCase())) return false;
  const users = (process.env.AI_QUOTA_BYPASS_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  if (users.length > 0) return users.includes(userId);
  // Hosted deployments require an explicit account allowlist, even in Preview.
  return !process.env.VERCEL_ENV && process.env.NODE_ENV !== 'production';
}

async function quotaContext(userId: string, _plan?: PlanTier | string | null) {
  const policy = await getCallsheetQuotaPolicy(userId);
  const identity = policy.planTier === 'pro' ? null : await getFreeIdentityHash(userId);
  if (policy.planTier !== 'pro' && !identity) throw new AiQuotaUnavailableError();
  return { policy, args: {
    p_user_id: userId, p_limit: isAiQuotaBypassed(userId) ? AI_QUOTA_BYPASS_LIMIT : policy.limit,
    p_identity_hash: identity, p_period_start: policy.periodStart, p_period_end: policy.periodEnd,
  } };
}

export async function checkAiMonthlyQuota(userId: string, plan?: PlanTier | string | null): Promise<QuotaDecision> {
  const { policy, args } = await quotaContext(userId, plan);
  const { data, error } = await supabaseAdmin.rpc("ai_quota_snapshot_v2", args);
  if (error || !data || typeof data.remaining !== "number") throw new AiQuotaUnavailableError();
  return { ...data, ...policy, bypass: isAiQuotaBypassed(userId) } as QuotaDecision;
}

export async function reserveAiQuota(userId: string, jobId: string, plan?: PlanTier | string | null, newRequestId?: string): Promise<AiReservation> {
  const { data: job, error: jobError } = await supabaseAdmin.from("callsheet_jobs")
    .select("storage_path").eq("id", jobId).eq("user_id", userId).single();
  if (jobError || !job) throw new Error("job_not_found");
  // A quota reservation or reprocess must never authorize an arbitrary file.
  await assertStorageOwnership(userId, "callsheets", job.storage_path);
  const attemptId = randomUUID();
  const { data, error } = await supabaseAdmin.rpc("reserve_ai_quota_v3", {
    ...(await quotaContext(userId, plan)).args, p_job_id: jobId, p_attempt_id: attemptId,
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
