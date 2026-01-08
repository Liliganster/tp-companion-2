import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildInvoiceExtractorPrompt, invoiceExtractionSchema } from "../src/lib/ai/invoicePrompt.js";
import { InvoiceExtractionResultSchema } from "../src/lib/ai/validation.js";
import { captureServerException, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { checkAiMonthlyQuota } from "./_utils/aiQuota.js";
import { calculateNextRetry, isJobStuck, shouldRetry, DEFAULT_RETRY_STRATEGY } from "./_utils/retry.js";

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  // CRON authentication
  const authHeader = req.headers?.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const requireSecret = vercelEnv ? vercelEnv !== "development" : process.env.NODE_ENV === "production";
  const isVercelCron = Boolean(req.headers?.["x-vercel-cron"]);
  const manual = String(req.query?.manual ?? "").trim() === "1";
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
    name: "invoice_worker",
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
              kind: "invoice",
              job_id: jobId,
              run_at: runAt,
              status: "done",
            } as any,
            { onConflict: "kind,job_id,run_at", ignoreDuplicates: true } as any,
          );

        if (error) {
          log.warn({ jobId, err: error }, "invoice_usage_event_failed");
        }
      } catch (err) {
        log.warn({ jobId, err }, "invoice_usage_event_exception");
      }
    };

    // 1. Detect and reset stuck jobs
    const stuckTimeout = DEFAULT_RETRY_STRATEGY.timeoutMinutes;
    const stuckThreshold = new Date(Date.now() - stuckTimeout * 60 * 1000).toISOString();
    
    const { data: stuckJobs } = await supabaseAdmin
      .from("invoice_jobs")
      .select("id, retry_count, max_retries")
      .eq("status", "processing")
      .lt("processing_started_at", stuckThreshold);

    if (stuckJobs && stuckJobs.length > 0) {
      log.warn({ count: stuckJobs.length }, "invoice_stuck_jobs_detected");
      
      for (const stuck of stuckJobs) {
        const retryCount = (stuck.retry_count || 0) + 1;
        const maxRetries = stuck.max_retries || DEFAULT_RETRY_STRATEGY.maxRetries;
        
        if (retryCount > maxRetries) {
          await supabaseAdmin
            .from("invoice_jobs")
            .update({ 
              status: "failed", 
              last_error: "Job stuck in processing, exceeded max retries",
              retry_count: retryCount 
            })
            .eq("id", stuck.id);
        } else {
          const nextRetry = calculateNextRetry(retryCount);
          await supabaseAdmin
            .from("invoice_jobs")
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

    // 2. Fetch jobs ready for processing
    const now = new Date().toISOString();

    let jobs: any[] = [];

    if (manual && manualJobId) {
      const q = supabaseAdmin.from("invoice_jobs").select("*").eq("id", manualJobId);
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
      let queuedQuery = supabaseAdmin.from("invoice_jobs").select("*").eq("status", "queued");
      if (manual && manualUserId) queuedQuery = queuedQuery.eq("user_id", manualUserId);
      queuedQuery = queuedQuery.order("created_at", { ascending: !manual });

      let retryQuery = supabaseAdmin
        .from("invoice_jobs")
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
      if (retryError) log.warn({ retryError }, "invoice_retry_fetch_error");

      jobs = [...(queuedJobs || []), ...(retryJobs || [])].slice(0, maxJobs);
    }

    if (jobs.length === 0) {
      res.status(200).json({ message: "No invoice jobs queued or ready for retry" });
      return;
    }

    const processedResults: any[] = [];

    async function processInvoiceJob(job: any) {
      const jobId = job.id;
      const currentRetry = job.retry_count || 0;
      
      // Atomically claim the job
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("invoice_jobs")
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

      if (claimError || !claimed) return;

      try {
        log.info({ jobId, retryCount: currentRetry }, "invoice_job_start");

        // Monthly quota (counts only when jobs reach `done`).
        const userId = String((claimed as any).user_id ?? (job as any).user_id ?? "").trim();
        if (userId) {
          const quota = await checkAiMonthlyQuota(userId);
          if (!quota.allowed) {
            const reason = quota.reason ?? "monthly_quota_exceeded";
            await supabaseAdmin
              .from("invoice_jobs")
              .update({ status: "out_of_quota", needs_review_reason: reason })
              .eq("id", job.id)
              .eq("status", "processing");
            processedResults.push({ id: job.id, status: "out_of_quota", error: reason });
            return;
          }
        }

        // Cache: if results already exist for this job, don't call Gemini again.
        const { data: existingResult, error: existingError } = await supabaseAdmin
          .from("invoice_results")
          .select("id")
          .eq("job_id", job.id)
          .maybeSingle();

        if (existingError) {
          log.warn({ jobId: job.id, existingError }, "invoice_existing_result_check_failed");
        } else if (existingResult?.id) {
          await supabaseAdmin.from("invoice_jobs").update({ status: "done" }).eq("id", job.id).eq("status", "processing");
          processedResults.push({ id: job.id, status: "done", cached: true });
          log.info({ jobId: job.id }, "invoice_job_cached_done");
          return;
        }

        // A. Download PDF/Image from project_documents bucket
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("project_documents")
          .download(claimed.storage_path);

        if (downloadError) {
          log.error({ jobId: job.id, downloadError }, "invoice_download_error");
          throw new Error(`Failed to download invoice: ${downloadError.message}`);
        }
        if (!fileData) {
          throw new Error("Failed to download invoice: no data returned");
        }

        log.info({ jobId: job.id, bytes: fileData.size }, "invoice_downloaded");

        // Validate file size (max 15MB to prevent timeouts and reduce Gemini API latency)
        const maxFileSizeBytes = 15 * 1024 * 1024; // 15MB
        if (fileData.size > maxFileSizeBytes) {
          const sizeMB = Math.round(fileData.size / 1024 / 1024);
          const reason = `file_too_large:${sizeMB}MB_exceeds_15MB_limit`;
          await supabaseAdmin
            .from("invoice_jobs")
            .update({ status: "failed", needs_review_reason: reason })
            .eq("id", job.id)
            .eq("status", "processing");
          processedResults.push({ id: job.id, status: "failed", error: reason });
          log.warn({ jobId: job.id, sizeMB }, "invoice_file_too_large");
          return;
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Determine file type
        const mimeType = claimed.storage_path.toLowerCase().endsWith('.pdf') 
          ? 'application/pdf' 
          : 'image/jpeg';

        // C. Process with Gemini Vision
        const { data: preAiJob } = await supabaseAdmin
          .from("invoice_jobs")
          .select("status")
          .eq("id", jobId)
          .maybeSingle();

        if (String((preAiJob as any)?.status ?? "") === "cancelled") {
          log.info({ jobId }, "invoice_job_cancelled_pre_ai");
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }

        log.info({ jobId: job.id }, "invoice_gemini_call");
        const systemInstruction = buildInvoiceExtractorPrompt("[INVOICE DOCUMENT ATTACHED]");
        const geminiStartTime = Date.now();
        const resultText = await generateContentFromPDF(
          "gemini-2.5-flash",
          systemInstruction,
          buffer,
          mimeType,
          invoiceExtractionSchema
        );
        const geminiDuration = Date.now() - geminiStartTime;

        log.info({ jobId: job.id, length: resultText?.length || 0, durationMs: geminiDuration }, "invoice_gemini_response");

        // Initialize extraction log data
        const extractionLogData: any = {
          user_id: String((job as any).user_id ?? ""),
          job_id: job.id,
          job_type: "invoice",
          gemini_duration_ms: geminiDuration,
        };

        let extractedJson: any = null;
        try {
          extractedJson = JSON.parse(resultText);
        } catch {
          extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
        }

        if (!extractedJson) throw new Error("Empty extraction result");

        const validated = InvoiceExtractionResultSchema.safeParse(extractedJson);
        if (!validated.success) {
          const reason = `invalid_invoice_extraction:${validated.error.issues.map((i) => i.message).join("; ")}`;
          await supabaseAdmin
            .from("invoice_jobs")
            .update({ status: "needs_review", needs_review_reason: reason })
            .eq("id", job.id)
            .eq("status", "processing");
          processedResults.push({ id: job.id, status: "needs_review", error: reason });
          log.warn({ jobId: job.id, reason }, "invoice_extraction_invalid");
          return;
        }

        const extracted = validated.data;
        log.info({ jobId: job.id }, "invoice_extraction_parsed");

        const { data: preSaveJob } = await supabaseAdmin
          .from("invoice_jobs")
          .select("status")
          .eq("id", jobId)
          .maybeSingle();

        if (String((preSaveJob as any)?.status ?? "") === "cancelled") {
          log.info({ jobId }, "invoice_job_cancelled_pre_save");
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }

        // D. Save Results
        const { error: resultInsertError } = await supabaseAdmin.from("invoice_results").insert({
          job_id: job.id,
          total_amount: extracted.totalAmount,
          currency: extracted.currency || "EUR",
          invoice_number: extracted.invoiceNumber || null,
          invoice_date: extracted.invoiceDate || null,
          vendor_name: extracted.vendorName || null,
          purpose: extracted.purpose || null,
        });

        if (resultInsertError) {
          log.error({ jobId: job.id, resultInsertError }, "invoice_result_insert_failed");
          throw new Error(`Failed to insert result: ${resultInsertError.message}`);
        }

        log.info({ jobId }, "invoice_result_saved");

        // E. Automatically categorize extracted invoice into trip expenses
        // The invoice's purpose is mapped to the appropriate trip expense field:
        // - "fuel" → stored in invoice_results for cost inference (not directly in trip)
        // - "toll/peaje" → stored in trip.toll_amount
        // - "parking/estacionamiento" → stored in trip.parking_amount
        // - "food/meal/restaurant/fine/other" → stored in trip.other_expenses
        // Get the trip_id from invoice_jobs to update the trip if available
        const { data: invoiceJob, error: jobLookupError } = await supabaseAdmin
          .from("invoice_jobs")
          .select("trip_id")
          .eq("id", job.id)
          .maybeSingle();

        if (jobLookupError) {
          log.warn({ jobId: job.id, jobLookupError }, "invoice_jobs_lookup_failed");
        } else if (invoiceJob?.trip_id) {
          // Map purpose to expense field
          const amount = extracted.totalAmount;
          const purpose = (extracted.purpose || "").toLowerCase().trim();
          let expenseField: "toll_amount" | "parking_amount" | "other_expenses" | null = null;

          if (purpose.includes("fuel") || purpose.includes("petrol") || purpose.includes("diesel") || purpose.includes("gasolina") || purpose.includes("combustible")) {
            // For fuel, we don't update trip expense fields.
            // Fuel cost will be inferred from the invoice amount and vehicle consumption data.
            log.info({ jobId, purpose }, "invoice_fuel_skipped_trip_update");
          } else if (purpose.includes("toll") || purpose.includes("peaje") || purpose.includes("autopista")) {
            expenseField = "toll_amount";
          } else if (purpose.includes("parking") || purpose.includes("park") || purpose.includes("estacionamiento") || purpose.includes("aparcamiento")) {
            expenseField = "parking_amount";
          } else if (purpose.includes("food") || purpose.includes("meal") || purpose.includes("comida") || purpose.includes("restaurante") || 
                     purpose.includes("fine") || purpose.includes("multa") || purpose.includes("other")) {
            expenseField = "other_expenses";
          }

          if (expenseField) {
            const { error: tripUpdateError } = await supabaseAdmin
              .from("trips")
              .update({ [expenseField]: amount })
              .eq("id", invoiceJob.trip_id);

            if (tripUpdateError) {
              log.warn({ jobId: job.id, tripId: invoiceJob.trip_id, expenseField, tripUpdateError }, "trip_expense_update_failed");
            } else {
              log.info({ jobId, tripId: invoiceJob.trip_id, expenseField, amount }, "trip_expense_updated");
            }
          }
        }

        const { data: doneRow, error: doneError } = await supabaseAdmin
          .from("invoice_jobs")
          .update({ status: "done", retry_count: currentRetry })
          .eq("id", jobId)
          .eq("status", "processing")
          .select("id")
          .maybeSingle();

        if (doneError) throw doneError;
        if (!doneRow) {
          log.info({ jobId }, "invoice_job_cancelled_before_done");
          processedResults.push({ id: jobId, status: "cancelled" });
          return;
        }

        // Log extraction metrics to database
        extractionLogData.total_duration_ms = Date.now() - (job as any).processing_started_at 
          ? new Date((job as any).processing_started_at).getTime() 
          : Date.now();
        try {
          await supabaseAdmin.from("ai_extraction_logs").insert(extractionLogData);
        } catch (err) {
          log.warn({ jobId, err }, "failed_to_log_extraction_metrics");
        }

        await recordUsage({
          userId: String((claimed as any).user_id ?? (job as any).user_id ?? ""),
          jobId,
          runAt: (claimed as any).processed_at ?? null,
        });
        log.info({ jobId, retryCount: currentRetry }, "invoice_job_done");
        processedResults.push({ id: jobId, status: "success", retries: currentRetry });
      } catch (jobErr: any) {
        log.error({ jobId, err: jobErr, retryCount: currentRetry }, "invoice_job_failed");
        const errorMessage = jobErr?.message || String(jobErr);
        captureServerException(jobErr, { requestId, jobId, kind: "invoice" });
        
        const nextRetry = currentRetry + 1;
        const maxRetries = job.max_retries || DEFAULT_RETRY_STRATEGY.maxRetries;
        
        if (nextRetry > maxRetries) {
          // Exceeded max retries, mark as permanently failed
          await supabaseAdmin
            .from("invoice_jobs")
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
            .from("invoice_jobs")
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

    await Promise.allSettled(jobs.map(processInvoiceJob));

    res.status(200).json({ processed: processedResults.length, details: processedResults });
  } catch (err: any) {
    log.error({ err }, "invoice_worker_error");
    captureServerException(err, { requestId, kind: "invoice_worker" });
    res.status(500).json({ error: err.message });
  }
}, { name: "invoice-worker" });
