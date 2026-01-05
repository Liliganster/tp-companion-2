import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildUniversalExtractorPrompt } from "../src/lib/ai/prompts.js";
import { extractionSchema } from "../src/lib/ai/schema.js";
import { CallsheetExtractionResultSchema } from "../src/lib/ai/validation.js";
import { captureServerException, logger, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { checkAiMonthlyQuota } from "./_utils/aiQuota.js";
import { calculateNextRetry, isJobStuck, shouldRetry, DEFAULT_RETRY_STRATEGY } from "./_utils/retry.js";

// Geocoding function with direct access to env vars
async function geocodeAddress(address: string) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    logger.warn("Missing GOOGLE_MAPS_SERVER_KEY");
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data: any = await response.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        formatted_address: result.formatted_address,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        place_id: result.place_id,
        quality: result.geometry.location_type
      };
    }
    return null;
  } catch (error) {
    logger.error({ err: error }, "Geocoding error");
    return null;
  }
}

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  // CRON authentication
  const authHeader = req.headers?.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const requireSecret = vercelEnv ? vercelEnv !== "development" : process.env.NODE_ENV === "production";
  const isVercelCron = Boolean(req.headers?.["x-vercel-cron"]);
  const manual = String(req.query?.manual ?? "").trim() === "1";
  const skipGeocode = manual && String(req.query?.skipGeocode ?? "").trim() === "1";
  const maxJobs = manual ? 1 : 16; // Increased from 8 for 2x throughput
  const manualJobId = manual && typeof req.query?.jobId === "string" ? String(req.query.jobId).trim() : null;
  const manualUserId = manual && typeof req.query?.userId === "string" ? String(req.query.userId).trim() : null;

  const queryKey = typeof req.query?.key === "string" ? req.query.key : null;

  // In production/preview: require CRON_SECRET and only accept Authorization header.
  // In development: allow unauthenticated runs if CRON_SECRET is not set; if set, allow header or ?key=.
  if (requireSecret) {
    if (!cronSecret) {
      res.status(500).json({ error: "Missing CRON_SECRET" });
      return;
    }
    if (authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}` && queryKey !== cronSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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
    const recordUsage = async (params: { userId: string; jobId: string; runAt?: string | null }) => {
      const userId = String(params.userId ?? "").trim();
      const jobId = String(params.jobId ?? "").trim();
      if (!userId || !jobId) return;

      try {
        const runAt = params.runAt ? String(params.runAt) : new Date().toISOString();
        const { error } = await supabaseAdmin
          .from("ai_usage_events")
          .upsert(
            {
              user_id: userId,
              kind: "callsheet",
              job_id: jobId,
              run_at: runAt,
              status: "done",
            } as any,
            { onConflict: "kind,job_id,run_at", ignoreDuplicates: true } as any,
          );

        if (error) {
          // Best-effort only. Avoid breaking extractions if migrations weren't applied yet.
          log.warn({ jobId, err: error }, "callsheet_usage_event_failed");
        }
      } catch (err) {
        log.warn({ jobId, err }, "callsheet_usage_event_exception");
      }
    };

    // 1. Detect and reset stuck jobs
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
          // Exceeded max retries, mark as failed
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ 
              status: "failed", 
              last_error: "Job stuck in processing, exceeded max retries",
              retry_count: retryCount 
            })
            .eq("id", stuck.id);
        } else {
          // Reset to queued for retry with backoff
          const nextRetry = calculateNextRetry(retryCount);
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ 
              status: "failed", 
              last_error: "Job stuck in processing, will retry",
              retry_count: retryCount,
              next_retry_at: nextRetry
            })
            .eq("id", stuck.id);
        }
      }
    }

    // 2. Fetch jobs ready for processing (queued + failed with retry time reached)
    const now = new Date().toISOString();

    let jobs: any[] = [];

    if (manual && manualJobId) {
      const q = supabaseAdmin.from("callsheet_jobs").select("*").eq("id", manualJobId);
      if (manualUserId) q.eq("user_id", manualUserId);
      const { data: job, error: jobError } = await q.maybeSingle();

      if (jobError) throw jobError;

      if (!job) {
        res.status(200).json({ message: "Job not found", processed: 0, details: [] });
        return;
      }

      const status = String((job as any)?.status ?? "");
      if (status !== "queued" && status !== "failed") {
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

    const processedResults: any[] = [];

    async function processJob(job: any) {
      const jobId = job.id;
      const currentRetry = job.retry_count || 0;
      
      // Atomically claim the job so concurrent workers don't double-process.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("callsheet_jobs")
        .update({ 
          status: "processing", 
          processed_at: new Date().toISOString(),
          processing_started_at: new Date().toISOString(),
          retry_count: currentRetry
        })
        .eq("id", jobId)
        .in("status", ["queued", "failed"])
        .select("id, storage_path, user_id, retry_count, processed_at")
        .maybeSingle();

      if (claimError || !claimed) return; // already taken or not claimable

      try {
        log.info({ jobId, retryCount: currentRetry }, "callsheet_job_start");

        // Monthly quota (counts only when jobs reach `done`).
        const userId = String((claimed as any).user_id ?? (job as any).user_id ?? "").trim();
        if (userId) {
          const quota = await checkAiMonthlyQuota(userId);
          if (!quota.allowed) {
            const reason = quota.reason ?? "monthly_quota_exceeded";
            await supabaseAdmin
              .from("callsheet_jobs")
              .update({ status: "out_of_quota", needs_review_reason: reason })
              .eq("id", job.id)
              .eq("status", "processing");
            processedResults.push({ id: job.id, status: "out_of_quota", error: reason });
            return;
          }
        }

        // Cache: if results already exist for this job, don't call Gemini again.
        const { data: existingResult, error: existingError } = await supabaseAdmin
          .from("callsheet_results")
          .select("job_id")
          .eq("job_id", job.id)
          .maybeSingle();

        if (existingError) {
          log.warn({ jobId: job.id, existingError }, "callsheet_existing_result_check_failed");
        } else if (existingResult?.job_id) {
          await supabaseAdmin.from("callsheet_jobs").update({ status: "done" }).eq("id", job.id).eq("status", "processing");
          processedResults.push({ id: job.id, status: "done", cached: true });
          log.info({ jobId: job.id }, "callsheet_job_cached_done");
          return;
        }

        // A. Download PDF
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("callsheets")
          .download(claimed.storage_path);

        if (downloadError) {
          log.error({ jobId: job.id, downloadError }, "callsheet_download_error");
          throw new Error(`Failed to download PDF: ${downloadError.message}`);
        }
        if (!fileData) {
          throw new Error("Failed to download PDF: no data returned");
        }

        log.info({ jobId: job.id, bytes: fileData.size }, "callsheet_downloaded");

        // Validate PDF size (max 15MB to prevent timeouts and reduce Gemini API latency)
        const maxFileSizeBytes = 15 * 1024 * 1024; // 15MB
        if (fileData.size > maxFileSizeBytes) {
          const sizeMB = Math.round(fileData.size / 1024 / 1024);
          const reason = `pdf_too_large:${sizeMB}MB_exceeds_15MB_limit`;
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ status: "failed", needs_review_reason: reason })
            .eq("id", job.id)
            .eq("status", "processing");
          processedResults.push({ id: job.id, status: "failed", error: reason });
          log.warn({ jobId: job.id, sizeMB }, "callsheet_pdf_too_large");
          return;
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Process PDF with Gemini Vision
        const { data: preAiJob } = await supabaseAdmin
          .from("callsheet_jobs")
          .select("status")
          .eq("id", jobId)
          .maybeSingle();

        if (String((preAiJob as any)?.status ?? "") === "cancelled") {
          log.info({ jobId }, "callsheet_job_cancelled_pre_ai");
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }

        log.info({ jobId: job.id }, "callsheet_gemini_call");
        const geminiStartTime = Date.now();
        const systemInstruction = buildUniversalExtractorPrompt("[PDF CONTENT ATTACHED]");
        const resultText = await generateContentFromPDF(
          "gemini-2.5-flash",
          systemInstruction,
          buffer,
          "application/pdf",
          extractionSchema
        );
        const geminiDuration = Date.now() - geminiStartTime;

        log.info({ jobId: job.id, length: resultText?.length || 0, durationMs: geminiDuration }, "callsheet_gemini_response");

        let extractedJson: any = null;
        try {
          extractedJson = JSON.parse(resultText);
        } catch {
          extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
        }

        if (!extractedJson) throw new Error("Empty extraction result");

        const validated = CallsheetExtractionResultSchema.safeParse(extractedJson);
        if (!validated.success) {
          const reason = `invalid_callsheet_extraction:${validated.error.issues.map((i) => i.message).join("; ")}`;
          await supabaseAdmin
            .from("callsheet_jobs")
            .update({ status: "failed", needs_review_reason: reason })
            .eq("id", job.id)
            .eq("status", "processing");
          processedResults.push({ id: job.id, status: "failed", error: reason });
          log.warn({ jobId: job.id, reason }, "callsheet_extraction_invalid");
          return;
        }

        const extracted = validated.data;
        log.info({ jobId: job.id, locations: extracted.locations.length }, "callsheet_extraction_parsed");

        const { data: preSaveJob } = await supabaseAdmin
          .from("callsheet_jobs")
          .select("status")
          .eq("id", jobId)
          .maybeSingle();

        if (String((preSaveJob as any)?.status ?? "") === "cancelled") {
          log.info({ jobId }, "callsheet_job_cancelled_pre_save");
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }

        // D. Save Results
        const { error: resultInsertError } = await supabaseAdmin.from("callsheet_results").insert({
          job_id: job.id,
          date_value: extracted.date,
          project_value: extracted.projectName,
          producer_value: extracted.productionCompanies?.[0],
        });

        if (resultInsertError) {
          log.error({ jobId: job.id, resultInsertError }, "callsheet_result_insert_failed");
          throw new Error(`Failed to insert result: ${resultInsertError.message}`);
        }

        log.info({ jobId: job.id }, "callsheet_result_saved");

        if (Array.isArray(extracted.locations)) {
          const locs: any[] = [];
          
          // Parallelize geocoding to avoid sequential API calls (70% speed improvement)
          const geoStartTime = Date.now();
          const geoResults = await Promise.all(
            extracted.locations.map((locStr) =>
              skipGeocode ? Promise.resolve(null) : geocodeAddress(locStr)
            )
          );
          const geoDuration = Date.now() - geoStartTime;
          log.info({ jobId: job.id, locations: extracted.locations.length, durationMs: geoDuration }, "geocoding_completed");

          extracted.locations.forEach((locStr, index) => {
            const geo = geoResults[index];
            locs.push({
              job_id: job.id,
              address_raw: locStr,
              label_source: "EXTRACTED",
              evidence_text: locStr,
              formatted_address: geo?.formatted_address,
              lat: geo?.lat,
              lng: geo?.lng,
              place_id: geo?.place_id,
              geocode_quality: geo?.quality,
            });
          });

          if (locs.length > 0) {
            const { error: locsInsertError } = await supabaseAdmin.from("callsheet_locations").insert(locs);
            if (locsInsertError) {
              log.error({ jobId: job.id, locsInsertError }, "callsheet_locations_insert_failed");
              throw new Error(`Failed to insert locations: ${locsInsertError.message}`);
            }
            log.info({ jobId: job.id, locations: locs.length }, "callsheet_locations_saved");
          }
        }

        const { data: doneRow, error: doneError } = await supabaseAdmin
          .from("callsheet_jobs")
          .update({ status: "done", retry_count: currentRetry })
          .eq("id", jobId)
          .eq("status", "processing")
          .select("id")
          .maybeSingle();

        if (doneError) throw doneError;
        if (!doneRow) {
          log.info({ jobId }, "callsheet_job_cancelled_before_done");
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }

        await recordUsage({
          userId: String((claimed as any).user_id ?? (job as any).user_id ?? ""),
          jobId,
          runAt: (claimed as any).processed_at ?? null,
        });
        log.info({ jobId, retryCount: currentRetry }, "callsheet_job_done");
        processedResults.push({ id: jobId, status: "success", retries: currentRetry });
      } catch (jobErr: any) {
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
      }
    }

    await Promise.allSettled(jobs.map(processJob));

    res.status(200).json({ processed: processedResults.length, details: processedResults });
  } catch (err: any) {
    log.error({ err }, "worker_error");
    captureServerException(err, { requestId, kind: "callsheet_worker" });
    res.status(500).json({ error: err.message });
  }
}, { name: "worker" });
