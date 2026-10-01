import { AiProviderUnavailableError, resolveCallsheetAiSettings } from './_utils/callsheetAiSettings.js';
import { waitUntil } from "@vercel/functions";
import { dispatchCallsheetWorker } from "./_utils/callsheetDispatch.js";
import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { captureServerException, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { reserveAiQuota, finishAiQuota, type AiReservation } from "./_utils/aiQuota.js";
import { getServerPlanTier } from "./_utils/entitlements.js";
import { CALLSHEET_RECOVERY_TIMEOUT_MS } from "../src/lib/callsheetTiming.js";
import { extractCallsheet } from "./_utils/callsheetExtraction.js";
import {
  CALLSHEET_PARALLEL_BATCH_SIZE,
  getCallsheetWorkerFetchLimit,
  limitCallsheetJobsByPlan,
  runCallsheetWorkerSlots,
  shouldSelfTriggerCallsheetBatch,
} from "./_utils/callsheetWorker.js";
import { startRuntimeWatchdog } from "./_utils/runtimeWatchdog.js";

const CALLSHEET_WORKER_RUNTIME_WARNING_MS = 285_000;

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  const workerStartedAt = Date.now();
  // CRON authentication
  const authHeader = req.headers?.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const requireSecret = vercelEnv ? vercelEnv !== "development" : process.env.NODE_ENV === "production";
  const manual = String(req.query?.manual ?? "").trim() === "1";
  const skipGeocode = manual && String(req.query?.skipGeocode ?? "").trim() === "1";
  const manualJobId = manual && typeof req.query?.jobId === "string" ? String(req.query.jobId).trim() : null;
  const newRequestId = manual && typeof req.query?.requestId === "string" ? req.query.requestId : undefined;
  const slots = manualJobId || String(req.query?.slots ?? "") === "1" ? 1 : CALLSHEET_PARALLEL_BATCH_SIZE;
  const maxJobs = getCallsheetWorkerFetchLimit({ manual, manualJobId });
  const manualUserId = manual && typeof req.query?.userId === "string" ? String(req.query.userId).trim() : null;
  const createWatchdog = () => startRuntimeWatchdog({
    context: {
      manual,
      manualJobId,
      manualUserId,
      maxJobs,
      requestId,
    },
    event: "worker_possible_vercel_timeout",
    level: "error",
    log,
    warningMs: CALLSHEET_WORKER_RUNTIME_WARNING_MS,
  });

  // In production/preview: require CRON_SECRET and only accept Authorization header.
  // In development: allow unauthenticated runs if CRON_SECRET is not set.
  // El secreto NUNCA se acepta por query string (?key=) — acabaría en logs de URLs.
  if (requireSecret) {
    if (!cronSecret) {
      res.status(500).json({ error: "Missing CRON_SECRET" });
      return;
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  // Defensa en profundidad: un run manual de un job concreto SIEMPRE lleva el
  // userId del dueño (trigger-worker y el eval lo mandan). Sin él, un
  // CRON_SECRET filtrado permitiría procesar jobs de cualquier usuario.
  if (manual && manualJobId && !manualUserId) {
    res.status(400).json({ error: "userId is required for manual single-job runs" });
    return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Best-effort rate limit (mainly for dev / misconfig); in prod the CRON_SECRET already protects this endpoint.
  const cronAllowed = await enforceRateLimit({
    req,
    res,
    name: "callsheet_worker",
    // Continuations are authenticated and may occur once per document.
    identifier: manualUserId ?? undefined,
    limit: 60,
    windowMs: 60_000,
    requestId,
  });
  if (!cronAllowed) return;

  const background = String(req.query?.background ?? '') === '1';
  const reply = background ? { status: (_code: number) => ({ json: (_body: unknown) => undefined }) } : res;
  const run = async () => {
  const runtimeWatchdog = createWatchdog();
  try {
    // A stale attempt may already have cost provider tokens: fail it, never regenerate.
    if (!manual || !manualJobId) {
      const stuckThreshold = new Date(Date.now() - CALLSHEET_RECOVERY_TIMEOUT_MS).toISOString();
      let staleQuery = supabaseAdmin.from('callsheet_jobs').update({
        status: 'failed', needs_review_reason: 'La extracción no terminó dentro del plazo. El original se conserva; no se reintentará automáticamente.',
        next_retry_at: null,
      }).eq('status', 'processing').lt('processing_started_at', stuckThreshold);
      if (manualUserId) staleQuery = staleQuery.eq('user_id', manualUserId);
      const { error: staleError } = await staleQuery;
      if (staleError) log.warn({ error: staleError }, 'callsheet_stale_recovery_failed');
    }

    let jobs: any[] = [];

    if (manual && manualJobId) {
      // manualUserId está garantizado por el guard de arriba: el fetch queda
      // SIEMPRE escopado al dueño declarado.
      const q = supabaseAdmin
        .from("callsheet_jobs")
        .select("*")
        .eq("id", manualJobId)
        .eq("user_id", manualUserId!);
      const { data: job, error: jobError } = await q.maybeSingle();

      if (jobError) throw jobError;

      if (!job) {
        reply.status(200).json({ message: "Job not found", processed: 0, details: [] });
        return;
      }

      const status = String((job as any)?.status ?? "");
      const claimable = status === "queued" || Boolean(newRequestId && ["failed", "cancelled", "done", "needs_review"].includes(status));
      if (!claimable) {
        reply.status(200).json({ message: `Job not claimable (status=${status})`, processed: 0, details: [] });
        return;
      }

      jobs = [job];
    } else {
      let queuedQuery = supabaseAdmin.from("callsheet_jobs").select("*").eq("status", "queued");
      if (manual && manualUserId) queuedQuery = queuedQuery.eq("user_id", manualUserId);
      queuedQuery = queuedQuery.order("created_at", { ascending: !manual });

      const { data: queuedJobs, error: queuedError } = await queuedQuery.limit(maxJobs);
      if (queuedError) throw queuedError;
      jobs = queuedJobs ?? [];
    }

    if (jobs.length === 0) {
      reply.status(200).json({ message: "No jobs queued" });
      return;
    }

    // Cache user profiles (plan tier + AI settings) in one query per user to avoid
    // redundant DB roundtrips later inside processJob.
    const userProfileCache = new Map<string, any>();
    const planTierByUserId = new Map<string, string>();
    const userIds = Array.from(
      new Set(jobs.map((job) => String((job as any).user_id ?? "").trim()).filter(Boolean)),
    );

    for (const uid of userIds) {
      const [{ data: profile, error: profileError }, planTier] = await Promise.all([
        supabaseAdmin
          .from("user_profiles")
          .select("openrouter_enabled, openrouter_api_key, openrouter_model")
          .eq("id", uid)
          .maybeSingle(),
        getServerPlanTier(uid),
      ]);
      userProfileCache.set(uid, profileError ? null : profile);
      planTierByUserId.set(uid, planTier);
    }

    const limitedJobs = limitCallsheetJobsByPlan({ jobs, planTierByUserId });

    const processedResults: any[] = [];
    const advancedJobIds = new Set<string>();

    async function processJob(job: any) {
      // Leave queued work for the next invocation with a full provider budget.
      if (Date.now() - workerStartedAt > 150_000) return;
      const jobId = job.id;
      const currentRetry = job.retry_count || 0;

      let reservation: AiReservation | undefined;
      try {
        const userId = String(job.user_id ?? "").trim();
        const userSettings = resolveCallsheetAiSettings(userProfileCache.get(userId), planTierByUserId.get(userId));
        reservation = await reserveAiQuota(userId, jobId, planTierByUserId.get(userId), newRequestId);
        if (reservation.completed) {
          processedResults.push({ id: jobId, status: "done", cached: true });
          return;
        }
        if (reservation.busy) return;
        if (!reservation.allowed) {
          if (reservation.reason === 'retry_limit_exceeded') {
            processedResults.push({ id: jobId, status: job.status, error: 'retry_limit_exceeded' });
            return;
          }
          if (reservation.reason === "manual_retry_required") {
            const { error } = await supabaseAdmin.from("callsheet_jobs").update({ status: "failed", needs_review_reason: "manual_retry_required" }).eq("id", jobId).eq("user_id", userId).in("status", ["queued", "processing"]);
            if (error) throw error;
            advancedJobIds.add(jobId);
            processedResults.push({ id: jobId, status: "failed" });
            return;
          }
          const { error } = await supabaseAdmin.from("callsheet_jobs").update({ status: "out_of_quota", needs_review_reason: (reservation.reason ?? "quota_exceeded") })
            .eq("id", jobId).eq("user_id", userId).in("status", ["queued", "failed", "processing"]);
          if (error) throw error;
          advancedJobIds.add(jobId);
          processedResults.push({ id: jobId, status: "out_of_quota", error: (reservation.reason ?? "quota_exceeded") });
          return;
        }
        advancedJobIds.add(jobId);
        const claimed = { user_id: userId, storage_path: reservation.storagePath, processed_at: new Date().toISOString() };
        log.info({ jobId, retryCount: currentRetry }, "callsheet_job_start");

        const selectedAiProvider = userSettings ? "openrouter" : "gemini";
        const selectedAiModel = userSettings?.openrouterModel || "gemini-2.5-flash";
        log.info(
          {
            jobId: job.id,
            aiProvider: selectedAiProvider,
            aiModel: selectedAiModel,
          },
          "callsheet_ai_start",
        );

        // Núcleo COMPARTIDO con /api/callsheets/process (Fase 2: pipelines
        // unificados en api/_utils/callsheetExtraction.ts). Aquí solo queda
        // la traducción del resultado a estados del job.
        const outcome = await extractCallsheet({
          userId: String(claimed.user_id ?? ""),
          jobId,
          storagePath: String(claimed.storage_path ?? ""),
          userSettings,
          requestId: reservation.requestId!,
      attemptId: reservation.attemptId,
      referenceIso: String((job as any).created_at ?? new Date().toISOString()),
          skipGeocode,
          checkCancellation: true,
          log,
        });

        if (outcome.ok === false) {
          if (outcome.kind === "cancelled") {
            processedResults.push({ id: jobId, status: "cancelled" });
            return;
          }
          if (outcome.kind === "download_failed") {
            // El fallo conserva el documento, sin reintento automático.
            throw new Error(`Failed to download document: ${outcome.message}`);
          }
          // file_too_large | invalid_extraction → fallo definitivo revisable
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ status: "failed", needs_review_reason: outcome.message })
            .eq("id", jobId)
            .eq("status", "processing").eq("ai_request_id", reservation.requestId);
          processedResults.push({ id: jobId, status: "failed", error: outcome.message });
          return;
        }

        if (!await finishAiQuota(reservation, true)) {
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }
        if (outcome.cached === true) {
          processedResults.push({ id: jobId, status: outcome.status, cached: true });
          return;
        }

        // Métricas de la extracción (best-effort)
        try {
          const startedAtMs = Date.parse(String((claimed as any).processed_at ?? ""));
          await supabaseAdmin.from("ai_extraction_logs").insert({
            user_id: String((job as any).user_id ?? ""),
            job_id: jobId,
            job_type: "callsheet",
            gemini_duration_ms: outcome.aiDurationMs,
            ai_provider: outcome.aiProvider,
            ai_model: outcome.aiModel,
            ai_vendor: outcome.aiVendor,
            geocoding_duration_ms: outcome.geocodingDurationMs,
            geocoding_locations: outcome.locationsCount,
            total_duration_ms: Number.isFinite(startedAtMs) ? Date.now() - startedAtMs : null,
          });
        } catch (err) {
          log.warn({ jobId, err }, "failed_to_log_extraction_metrics");
        }

        log.info({ jobId, retryCount: currentRetry }, "callsheet_job_done");
        processedResults.push({ id: jobId, status: outcome.status, retries: currentRetry });
      } catch (jobErr: any) {
        if (jobErr instanceof AiProviderUnavailableError) {
          // Only fail unclaimed jobs; never overwrite another active attempt.
          await supabaseAdmin.from('callsheet_jobs').update({ status: 'failed', needs_review_reason: 'ai_provider_unavailable' })
            .eq('id', jobId).eq('user_id', job.user_id).eq('status', 'queued');
          processedResults.push({ id: jobId, status: 'failed', error: 'ai_provider_unavailable' });
          return;
        }
        if (!reservation?.allowed) {
          log.error({ jobId, err: jobErr }, "quota_reservation_failed");
          processedResults.push({ id: jobId, status: "failed", error: "ai_quota_unavailable" });
          return;
        }
        log.error({ jobId, err: jobErr, retryCount: currentRetry }, "callsheet_job_failed");
        const errorMessage = jobErr?.message || String(jobErr);
        captureServerException(jobErr, { requestId, jobId, kind: "callsheet" });
        
        // A new provider attempt requires an explicit user action.
        await supabaseAdmin.from('callsheet_jobs').update({
          status: 'failed', needs_review_reason: errorMessage, last_error: errorMessage,
          retry_count: currentRetry + 1, next_retry_at: null,
        }).eq('id', jobId).eq('status', 'processing').eq('ai_request_id', reservation.requestId);
        processedResults.push({ id: jobId, status: 'failed', error: errorMessage });
      } finally {
        if (reservation?.allowed) {
          try { await finishAiQuota(reservation, false); }
          catch (error) { log.warn({ jobId, error }, "quota_release_pending_expiry"); }
        }
      }
    }

    // Each completed slot starts exactly one successor, without waiting for the
    // other extraction. PostgreSQL still enforces the account-wide maximum of two.
    const continueSlot = async () => {
      if (!shouldSelfTriggerCallsheetBatch({ manual, manualJobId, manualUserId })) return;
      try {
        let remaining = supabaseAdmin.from('callsheet_jobs').select('id', { head: true, count: 'exact' }).eq('status', 'queued');
        if (manualUserId) remaining = remaining.eq('user_id', manualUserId);
        const { count, error } = await remaining;
        if (error) throw error;
        if ((count ?? 0) > 0) {
          const params = new URLSearchParams({ slots: "1" });
          if (manualUserId) { params.set('manual', '1'); params.set('userId', manualUserId); }
          if (skipGeocode) params.set('skipGeocode', '1');
          await dispatchCallsheetWorker(params);
        }
      } catch (error) { log.error({ error }, 'worker_next_batch_not_started'); }
    };
    await runCallsheetWorkerSlots({
      items: limitedJobs,
      concurrency: slots,
      process: async job => {
        await processJob(job);
        return advancedJobIds.has(job.id);
      },
      onSlotCompleted: continueSlot,
    });

    reply.status(200).json({ processed: processedResults.length, details: processedResults });
  } catch (err: any) {
    log.error({ err }, "worker_error");
    captureServerException(err, { requestId, kind: "callsheet_worker" });
    reply.status(500).json({ error: err.message });
  } finally {
    const { context, elapsedMs, warningLogged } = runtimeWatchdog.cancel();
    if (warningLogged) {
      log.warn({ ...context, elapsedMs }, "worker_completed_after_timeout_warning");
    }
  }
  };
  if (background) {
    waitUntil(run());
    return res.status(202).json({ ok: true, accepted: true });
  }
  await run();
}, { name: "worker" });
