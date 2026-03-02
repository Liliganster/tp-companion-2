/**
 * Consolidated router for all /api/user/* routes.
 * Handler logic is verbatim from original files.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireSupabaseUser, sendJson } from "./_utils/supabase.js";
import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { checkAiMonthlyQuota } from "./_utils/aiQuota.js";
import { getPlanLimits, DEFAULT_PLAN, PLAN_LIMITS, type PlanTier } from "./_utils/plans.js";

// PlanTier, PLAN_LIMITS, getPlanLimits, DEFAULT_PLAN all come from _utils/plans.ts
export type { PlanTier };



// ─── /api/user/ai-quota ──────────────────────────────────────────────────────
function envTruthy(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

async function handleAiQuota(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });

    const { data: profile } = await supabaseAdmin.from("user_profiles").select("plan_tier").eq("id", user.id).maybeSingle();
    const rawTier = String((profile as any)?.plan_tier ?? "").trim().toLowerCase();
    let planTier: PlanTier = DEFAULT_PLAN;
    if (rawTier === "pro") planTier = "pro";
    if (rawTier === "basic" || rawTier === "free") planTier = DEFAULT_PLAN;

    const baseLimits = getPlanLimits(planTier);
    const aiJobsLimit = baseLimits.aiJobsPerMonth;
    const bypassEnabled = envTruthy("BYPASS_AI_LIMITS");
    const quota = await checkAiMonthlyQuota(user.id, planTier);

    return res.status(200).json({ bypass: bypassEnabled, planTier, limit: aiJobsLimit, used: quota.used, remaining: bypassEnabled ? Infinity : quota.remaining });
  } catch (err: any) {
    console.error("Error fetching AI quota:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ─── /api/user/profile ───────────────────────────────────────────────────────
const ProfileBodySchema = z.object({
  full_name: z.string().trim().max(500).nullable().optional(),
  vat_id: z.string().trim().max(100).nullable().optional(),
  license_plate: z.string().trim().max(50).nullable().optional(),
  language: z.enum(["es", "en", "de"]).nullable().optional(),
  rate_per_km: z.coerce.number().nullable().optional(),
  passenger_surcharge: z.coerce.number().nullable().optional(),
  base_address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(200).nullable().optional(),
  country: z.string().trim().max(200).nullable().optional(),
  fuel_type: z.enum(["gasoline", "diesel", "ev", "unknown"]).nullable().optional(),
  fuel_l_per_100km: z.coerce.number().nullable().optional(),
  ev_kwh_per_100km: z.coerce.number().nullable().optional(),
  grid_kgco2_per_kwh: z.coerce.number().nullable().optional(),
  fuel_price_per_liter: z.coerce.number().nullable().optional(),
  electricity_price_per_kwh: z.coerce.number().nullable().optional(),
  maintenance_eur_per_km: z.coerce.number().nullable().optional(),
  other_eur_per_km: z.coerce.number().nullable().optional(),
  openrouter_enabled: z.boolean().nullable().optional(),
  openrouter_api_key: z.string().trim().nullable().optional(),
  openrouter_model: z.string().trim().nullable().optional(),
});

async function handleProfile(req: any, res: any) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return; }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const parsed = ProfileBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendJson(res, 400, { error: "invalid_body", details: parsed.error.issues });

  const payload = { id: user.id, ...parsed.data, updated_at: new Date().toISOString() };
  const { error } = await supabaseAdmin.from("user_profiles").upsert(payload, { onConflict: "id" });
  if (error) { console.error("[user/profile] upsert failed:", error); return sendJson(res, 500, { error: "upsert_failed", message: error.message }); }
  return sendJson(res, 200, { ok: true });
}

// ─── /api/user/subscription ──────────────────────────────────────────────────
function normalizeTier(input: unknown): PlanTier {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "pro") return "pro";
  if (v === "basic") return "basic";
  if (v === "free") return "basic";
  return "basic";
}

async function handleSubscription(req: VercelRequest, res: VercelResponse) {
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  try {
    if (req.method === "GET") {
      const { data: profile, error } = await supabaseAdmin.from("user_profiles").select("plan_tier").eq("id", user.id).maybeSingle();
      if (error) console.error("Error fetching user_profiles plan_tier:", error);
      const tier = normalizeTier((profile as any)?.plan_tier);
      const baseLimits = PLAN_LIMITS[tier] || PLAN_LIMITS.basic;
      return sendJson(res, 200, {
        tier,
        status: "active",
        limits: baseLimits,
        startedAt: null,
        expiresAt: null,
        priceCents: tier === "pro" ? 1900 : 0,
        currency: "EUR",
      });
    }
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Subscription API error:", error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
}

// ─── /api/user/delete-account ────────────────────────────────────────────────
function _chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function _uniqueStrings(values: Array<unknown>): string[] {
  const set = new Set<string>();
  for (const v of values) { if (typeof v === "string" && v.trim()) set.add(v); }
  return Array.from(set);
}

function _extractStoragePaths(raw: unknown): string[] {
  const paths: string[] = [];
  if (!raw) return paths;
  if (Array.isArray(raw)) {
    for (const doc of raw) { if (doc && typeof doc === "object") { const d: any = doc; if (typeof d.storagePath === "string") paths.push(d.storagePath); } }
    return paths;
  }
  if (typeof raw === "string") { try { return _extractStoragePaths(JSON.parse(raw)); } catch { return paths; } }
  return paths;
}

async function _deleteStoragePaths(bucket: string, paths: string[]) {
  const uniq = _uniqueStrings(paths);
  if (uniq.length === 0) return;
  for (const batch of _chunk(uniq, 100)) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(batch);
    if (error) console.error(`[delete-account] storage remove failed (${bucket}):`, error);
  }
}

async function handleDeleteAccount(req: any, res: any) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return; }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  try {
    const callsheetsPaths: string[] = [];
    const projectDocsPaths: string[] = [];

    const { data: jobs, error: jobsErr } = await supabaseAdmin.from("callsheet_jobs").select("storage_path").eq("user_id", user.id);
    if (jobsErr) console.error("[delete-account] callsheet_jobs select failed:", jobsErr);
    for (const row of jobs ?? []) callsheetsPaths.push((row as any).storage_path);

    const { data: trips, error: tripsErr } = await supabaseAdmin.from("trips").select("documents").eq("user_id", user.id);
    if (tripsErr) console.error("[delete-account] trips select failed:", tripsErr);
    for (const row of trips ?? []) callsheetsPaths.push(..._extractStoragePaths((row as any).documents));

    const { data: projectDocs, error: projectDocsErr } = await supabaseAdmin.from("project_documents").select("storage_path").eq("user_id", user.id);
    if (projectDocsErr) console.error("[delete-account] project_documents select failed:", projectDocsErr);
    for (const row of projectDocs ?? []) projectDocsPaths.push((row as any).storage_path);

    await _deleteStoragePaths("callsheets", callsheetsPaths);
    await _deleteStoragePaths("project_documents", projectDocsPaths);

    const deletes: Array<PromiseLike<any>> = [
      supabaseAdmin.from("project_documents").delete().eq("user_id", user.id),
      supabaseAdmin.from("reports").delete().eq("user_id", user.id),
      supabaseAdmin.from("route_templates").delete().eq("user_id", user.id),
      supabaseAdmin.from("producer_mappings").delete().eq("user_id", user.id),
      supabaseAdmin.from("callsheet_jobs").delete().eq("user_id", user.id),
      supabaseAdmin.from("trips").delete().eq("user_id", user.id),
      supabaseAdmin.from("projects").delete().eq("user_id", user.id),
      supabaseAdmin.from("google_connections").delete().eq("user_id", user.id),
    ];
    const results = await Promise.allSettled(deletes);
    for (const r of results) {
      if (r.status === "rejected") console.error("[delete-account] delete failed:", r.reason);
      else { const value: any = r.value; if (value?.error) console.error("[delete-account] delete error:", value.error); }
    }

    const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (authDelErr) { console.error("[delete-account] auth delete failed:", authDelErr); return sendJson(res, 500, { error: "auth_delete_failed", message: authDelErr.message }); }
    return sendJson(res, 200, { ok: true });
  } catch (e: any) {
    console.error("[delete-account] unexpected error:", e);
    return sendJson(res, 500, { error: "delete_failed", message: e?.message ?? "Delete failed" });
  }
}

// ─── /api/user/cleanup-duplicate-trips ───────────────────────────────────────
async function handleCleanupDuplicateTrips(req: any, res: any) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(); return; }
  const user = await requireSupabaseUser(req, res);
  if (!user) return;
  const dryRun = Boolean(req.body?.dryRun ?? true);
  try {
    const { data: trips, error } = await supabaseAdmin.from("trips").select("id, callsheet_job_id, created_at, updated_at").eq("user_id", user.id).not("callsheet_job_id", "is", null).order("updated_at", { ascending: false }).order("created_at", { ascending: false });
    if (error) { console.error("[cleanup-duplicate-trips] select failed:", error); return sendJson(res, 500, { error: "select_failed", message: error.message }); }

    const rows = (trips ?? []) as Array<{ id: string; callsheet_job_id: string | null; created_at?: string; updated_at?: string }>;
    const byJob = new Map<string, string[]>();
    for (const t of rows) {
      const jobId = (t.callsheet_job_id ?? "").toString();
      if (!jobId) continue;
      const list = byJob.get(jobId) ?? [];
      list.push(t.id);
      byJob.set(jobId, list);
    }

    const keepIds: string[] = [];
    const deleteIds: string[] = [];
    const affectedJobIds: string[] = [];
    for (const [jobId, ids] of byJob.entries()) {
      if (ids.length <= 1) { keepIds.push(ids[0]); continue; }
      affectedJobIds.push(jobId);
      keepIds.push(ids[0]);
      deleteIds.push(...ids.slice(1));
    }

    if (dryRun) return sendJson(res, 200, { ok: true, dryRun: true, totalTripsWithCallsheetJobId: rows.length, uniqueJobs: byJob.size, duplicatesFound: deleteIds.length, wouldKeep: keepIds.length, wouldDelete: deleteIds.length, affectedJobIds: affectedJobIds.slice(0, 50) });

    let deleted = 0;
    for (const batch of _chunk(deleteIds, 100)) {
      const { error: delErr } = await supabaseAdmin.from("trips").delete().in("id", batch).eq("user_id", user.id);
      if (delErr) { console.error("[cleanup-duplicate-trips] delete failed:", delErr); return sendJson(res, 500, { error: "delete_failed", message: delErr.message, deletedSoFar: deleted }); }
      deleted += batch.length;
    }
    return sendJson(res, 200, { ok: true, dryRun: false, totalTripsWithCallsheetJobId: rows.length, uniqueJobs: byJob.size, kept: keepIds.length, deleted, affectedJobIds: affectedJobIds.slice(0, 50) });
  } catch (e: any) {
    console.error("[cleanup-duplicate-trips] unexpected error:", e);
    return sendJson(res, 500, { error: "cleanup_failed", message: e?.message ?? "Cleanup failed" });
  }
}

// ─── Main router ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");

  if (path === "/api/user/ai-quota")                  return handleAiQuota(req, res);
  if (path === "/api/user/profile")                   return handleProfile(req, res);
  if (path === "/api/user/subscription")              return handleSubscription(req, res);
  if (path === "/api/user/delete-account")            return handleDeleteAccount(req, res);
  if (path === "/api/user/cleanup-duplicate-trips")   return handleCleanupDuplicateTrips(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found" }));
}
