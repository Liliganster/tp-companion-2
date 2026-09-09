import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { captureServerException, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { reserveAiQuota, finishAiQuota, type AiReservation } from "./_utils/aiQuota.js";
import { getServerPlanTier } from "./_utils/entitlements.js";
import { calculateNextRetry, DEFAULT_RETRY_STRATEGY } from "./_utils/retry.js";
import { extractCallsheet } from "./_utils/callsheetExtraction.js";
import {
  CALLSHEET_PARALLEL_BATCH_SIZE,
  getCallsheetWorkerFetchLimit,
  limitCallsheetJobsByPlan,
  runWithConcurrencyLimit,
  shouldSelfTriggerCallsheetBatch,
} from "./_utils/callsheetWorker.js";
import { startRuntimeWatchdog } from "./_utils/runtimeWatchdog.js";

const CALLSHEET_WORKER_RUNTIME_WARNING_MS = 55_000;

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  // CRON authentication
  const authHeader = req.headers?.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const requireSecret = vercelEnv ? vercelEnv !== "development" : process.env.NODE_ENV === "production";
  const manual = String(req.query?.manual ?? "").trim() === "1";
  const skipGeocode = manual && String(req.query?.skipGeocode ?? "").trim() === "1";
  const manualJobId = manual && typeof req.query?.jobId === "string" ? String(req.query.jobId).trim() : null;
  // preClaimed=1: trigger-worker already set this job to "processing"; skip the atomic claim step.
  const preClaimed = manual && manualJobId != null && String(req.query?.preClaimed ?? "").trim() === "1";
  const maxJobs = getCallsheetWorkerFetchLimit({ manual, manualJobId });
  const manualUserId = manual && typeof req.query?.userId === "string" ? String(req.query.userId).trim() : null;
  const runtimeWatchdog = startRuntimeWatchdog({
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
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (!cronAllowed) return;

  try {
    // 1. Detect and reset stuck jobs.
    // Skip for targeted manual single-job runs: the job was just queued so it can't be stuck,
    // and running this check adds unnecessary latency for the user pressing "Procesar".
    if (!manual || !manualJobId) {
      const stuckTimeout = DEFAULT_RETRY_STRATEGY.timeoutMinutes;
      const stuckThreshold = new Date(Date.now() - stuckTimeout * 60 * 1000).toISOString();

      const { data: stuckJobs } = await supabaseAdmin
        .from("callsheet_jobs")
        .select("id, retry_count, max_retries")
        .eq("status", "processing")
        .lt("processing_started_at", stuckThreshold);

      if (stuckJobs && stuckJobs.length > 0) {
        log.warn({ count: stuckJobs.length }, "callsheet_stuck_jobs_detected");

        for (const stuck of stuckJobs) {
          const retryCount = (stuck.retry_count || 0) + 1;
          const maxRetries = stuck.max_retries || DEFAULT_RETRY_STRATEGY.maxRetries;

          if (retryCount > maxRetries) {
            await supabaseAdmin
              .from("callsheet_jobs")
              .update({
                status: "failed",
                last_error: "Job stuck in processing, exceeded max retries",
                retry_count: retryCount,
              })
              .eq("id", stuck.id);
          } else {
            const nextRetry = calculateNextRetry(retryCount);
            await supabaseAdmin
              .from("callsheet_jobs")
              .update({
                status: "failed",
                last_error: "Job stuck in processing, will retry",
                retry_count: retryCount,
                next_retry_at: nextRetry,
              })
              .eq("id", stuck.id);
          }
        }
      }
    }

    // 2. Fetch jobs ready for processing (queued + failed with retry time reached)
    const now = new Date().toISOString();

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
        res.status(200).json({ message: "Job not found", processed: 0, details: [] });
        return;
      }

      const status = String((job as any)?.status ?? "");
      // preClaimed: trigger-worker ya puso el job en "processing" antes de llamarnos;
      // rechazarlo aquí dejaba el job atascado hasta el reintento de estancados.
      const claimable = status === "queued" || status === "failed" || (preClaimed && status === "processing");
      if (!claimable) {
        res.status(200).json({ message: `Job not claimable (status=${status})`, processed: 0, details: [] });
        return;
      }

      jobs = [job];
    } else {
      let queuedQuery = supabaseAdmin.from("callsheet_jobs").select("*").eq("status", "queued");
      if (manual && manualUserId) queuedQuery = queuedQuery.eq("user_id", manualUserId);
      queuedQuery = queuedQuery.order("created_at", { ascending: !manual });

      let retryQuery = supabaseAdmin
        .from("callsheet_jobs")
        .select("*")
        .eq("status", "failed")
        .not("next_retry_at", "is", null)
        .lte("next_retry_at", now)
        .lt("retry_count", DEFAULT_RETRY_STRATEGY.maxRetries);
      if (manual && manualUserId) retryQuery = retryQuery.eq("user_id", manualUserId);
      retryQuery = retryQuery.order("next_retry_at", { ascending: true });

      const { data: queuedJobs, error: queuedError } = await queuedQuery.limit(maxJobs);
      const { data: retryJobs, error: retryError } = await retryQuery.limit(maxJobs);

      if (queuedError) throw queuedError;
      if (retryError) log.warn({ retryError }, "callsheet_retry_fetch_error");

      jobs = [...(queuedJobs || []), ...(retryJobs || [])].slice(0, maxJobs);
    }

    if (jobs.length === 0) {
      res.status(200).json({ message: "No jobs queued or ready for retry" });
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
      const [{ data: profile }, planTier] = await Promise.all([
        supabaseAdmin
          .from("user_profiles")
          .select("openrouter_enabled, openrouter_api_key, openrouter_model")
          .eq("id", uid)
          .maybeSingle(),
        getServerPlanTier(uid),
      ]);
      userProfileCache.set(uid, profile ?? {});
      planTierByUserId.set(uid, planTier);
    }

    const limitedJobs = limitCallsheetJobsByPlan({ jobs, planTierByUserId });

    const processedResults: any[] = [];

    async function processJob(job: any) {
      const jobId = job.id;
      const currentRetry = job.retry_count || 0;

      let reservation: AiReservation | undefined;
      try {
        const userId = String(job.user_id ?? "").trim();
        reservation = await reserveAiQuota(userId, jobId, planTierByUserId.get(userId));
        if (reservation.completed) {
          processedResults.push({ id: jobId, status: "done", cached: true });
          return;
        }
        if (reservation.busy) return;
        if (!reservation.allowed) {
          await supabaseAdmin.from("callsheet_jobs").update({ status: "out_of_quota", needs_review_reason: "monthly_quota_exceeded" })
            .eq("id", jobId).eq("user_id", userId).in("status", ["queued", "failed", "processing"]);
          processedResults.push({ id: jobId, status: "out_of_quota", error: "monthly_quota_exceeded" });
          return;
        }
        const claimed = { user_id: userId, storage_path: reservation.storagePath, processed_at: new Date().toISOString() };
        log.info({ jobId, retryCount: currentRetry }, "callsheet_job_start");

        // Fetch AI user settings — reuse the profile cached during plan-limit checks (no extra DB query).
        // OpenRouter propio = SOLO plan Pro (el servidor no se fía del perfil a secas).
        let userSettings = undefined;
        if (userId && String(planTierByUserId.get(userId) ?? "basic").toLowerCase() === "pro") {
          const cachedProfile = userProfileCache.get(userId);
          if (cachedProfile?.openrouter_enabled && cachedProfile?.openrouter_api_key) {
            userSettings = {
              openrouterEnabled: cachedProfile.openrouter_enabled,
              openrouterApiKey: cachedProfile.openrouter_api_key,
              openrouterModel: cachedProfile.openrouter_model,
            };
          }
        }

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
            // lanzar → el catch programa el reintento con backoff
            throw new Error(`Failed to download document: ${outcome.message}`);
          }
          // file_too_large | invalid_extraction → fallo definitivo revisable
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ status: "failed", needs_review_reason: outcome.message })
            .eq("id", jobId)
            .eq("status", "processing");
          processedResults.push({ id: jobId, status: "failed", error: outcome.message });
          return;
        }

        if (!await finishAiQuota(reservation, true)) {
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }
        if (outcome.cached === true) {
          processedResults.push({ id: jobId, status: "done", cached: true });
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
        processedResults.push({ id: jobId, status: "success", retries: currentRetry });
      } catch (jobErr: any) {
        if (!reservation?.allowed) {
          log.error({ jobId, err: jobErr }, "quota_reservation_failed");
          processedResults.push({ id: jobId, status: "failed", error: "ai_quota_unavailable" });
          return;
        }
        log.error({ jobId, err: jobErr, retryCount: currentRetry }, "callsheet_job_failed");
        const errorMessage = jobErr?.message || String(jobErr);
        captureServerException(jobErr, { requestId, jobId, kind: "callsheet" });
        
        const nextRetry = currentRetry + 1;
        const maxRetries = job.max_retries || DEFAULT_RETRY_STRATEGY.maxRetries;
        
        if (nextRetry > maxRetries) {
          // Exceeded max retries, mark as permanently failed
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ 
              status: "failed", 
              needs_review_reason: errorMessage,
              last_error: errorMessage,
              retry_count: nextRetry
            })
            .eq("id", jobId)
            .eq("status", "processing");
          
          processedResults.push({ id: jobId, status: "failed", error: errorMessage, retries: nextRetry });
        } else {
          // Schedule retry with exponential backoff
          const nextRetryAt = calculateNextRetry(nextRetry);
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ 
              status: "failed", 
              needs_review_reason: `Will retry (${nextRetry}/${maxRetries})`,
              last_error: errorMessage,
              retry_count: nextRetry,
              next_retry_at: nextRetryAt
            })
            .eq("id", jobId)
            .eq("status", "processing");
          
          processedResults.push({ 
            id: jobId, 
            status: "scheduled_retry", 
            error: errorMessage, 
            retries: nextRetry, 
            nextRetryAt 
          });
        }
      } finally {
        if (reservation?.allowed) {
          try { await finishAiQuota(reservation, false); }
          catch (error) { log.warn({ jobId, error }, "quota_release_pending_expiry"); }
        }
      }
    }

    // Pro users can advance up to 5 jobs at once; Basic remains capped at 1 by plan slicing above.
    await runWithConcurrencyLimit({
      items: limitedJobs,
      concurrency: CALLSHEET_PARALLEL_BATCH_SIZE,
      worker: async (job) => {
        await processJob(job);
      },
    });

    // After processing this batch, check if there are still queued jobs.
    // If so, self-trigger the worker so the next batch runs automatically.
    // Manual single-job runs stay single-job; manual batch runs keep draining the same user's queue.
    if (shouldSelfTriggerCallsheetBatch({ manual, manualJobId, manualUserId })) {
      try {
        let remainingQuery = supabaseAdmin
          .from("callsheet_jobs")
          .select("id", { head: true, count: "exact" })
          .eq("status", "queued");
        if (manual && manualUserId) {
          remainingQuery = remainingQuery.eq("user_id", manualUserId);
        }
        const { count: remainingCount } = await remainingQuery;

        if ((remainingCount ?? 0) > 0) {
          const hostHeader = req.headers?.host;
          if (hostHeader) {
            const proto = hostHeader.includes("localhost") ? "http" : "https";
            const cronSecret = process.env.CRON_SECRET;
            const useInternalTriggerWorker = manual && Boolean(manualUserId);
            const params = new URLSearchParams();
            if (useInternalTriggerWorker && manualUserId) {
              params.set("userId", manualUserId);
            } else if (manual) {
              params.set("manual", "1");
              if (skipGeocode) params.set("skipGeocode", "1");
              if (manualUserId) params.set("userId", manualUserId);
            }
            const selfUrl = useInternalTriggerWorker
              ? `${proto}://${hostHeader}/api/callsheets/trigger-worker?${params.toString()}`
              : params.size > 0
                ? `${proto}://${hostHeader}/api/worker?${params.toString()}`
                : `${proto}://${hostHeader}/api/worker`;
            void fetch(selfUrl, {
              method: "POST",
              headers: { Authorization: cronSecret ? `Bearer ${cronSecret}` : "", "Content-Type": "application/json" },
            })
              .then(async (response) => {
                if (response.ok) return;
                const bodyPreview = (await response.text().catch(() => "")).slice(0, 300);
                log.error(
                  {
                    remainingCount,
                    manualBatch: manual,
                    manualUserId,
                    selfUrl,
                    status: response.status,
                    bodyPreview,
                    via: useInternalTriggerWorker ? "callsheets_trigger_worker" : "worker",
                  },
                  "worker_self_trigger_non_ok",
                );
              })
              .catch((err) =>
                log.error(
                  {
                    err,
                    remainingCount,
                    manualBatch: manual,
                    manualUserId,
                    selfUrl,
                    via: useInternalTriggerWorker ? "callsheets_trigger_worker" : "worker",
                  },
                  "worker_self_trigger_failed",
                ),
              );
            log.info(
              {
                remainingCount,
                manualBatch: manual,
                manualUserId,
                selfUrl,
                via: useInternalTriggerWorker ? "callsheets_trigger_worker" : "worker",
              },
              "worker_self_triggered_for_next_batch",
            );
          }
        }
      } catch (err) {
        log.warn({ err }, "worker_self_trigger_check_failed");
      }
    }

    res.status(200).json({ processed: processedResults.length, details: processedResults });
  } catch (err: any) {
    log.error({ err }, "worker_error");
    captureServerException(err, { requestId, kind: "callsheet_worker" });
    res.status(500).json({ error: err.message });
  } finally {
    const { context, elapsedMs, warningLogged } = runtimeWatchdog.cancel();
    if (warningLogged) {
      log.warn({ ...context, elapsedMs }, "worker_completed_after_timeout_warning");
    }
  }
}, { name: "worker" });
