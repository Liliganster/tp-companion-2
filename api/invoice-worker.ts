import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildInvoiceExtractorPrompt, invoiceExtractionSchema } from "../src/lib/ai/invoicePrompt.js";
import { captureServerException, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { checkAiMonthlyQuota } from "./_utils/aiQuota.js";

export default withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  // CRON authentication
  const authHeader = req.headers?.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const requireSecret = vercelEnv ? vercelEnv !== "development" : process.env.NODE_ENV === "production";
  const isVercelCron = Boolean(req.headers?.["x-vercel-cron"]);
  const manual = String(req.query?.manual ?? "").trim() === "1";
  const maxJobs = manual ? 1 : 8;

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
    // 1. Fetch queued invoice jobs (up to 8 concurrently)
    const { data: jobs, error } = await supabaseAdmin
      .from("invoice_jobs")
      .select("*")
      .eq("status", "queued")
      .limit(maxJobs);

    if (error) throw error;
    if (!jobs || jobs.length === 0) {
      res.status(200).json({ message: "No invoice jobs queued" });
      return;
    }

    const processedResults: any[] = [];

    async function processInvoiceJob(job: any) {
      // Atomically claim the job
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("invoice_jobs")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "queued")
        .select("id, storage_path, user_id")
        .maybeSingle();

      if (claimError || !claimed) return;

      try {
        log.info({ jobId: job.id }, "invoice_job_start");

        // Monthly quota (counts only when jobs reach `done`).
        const userId = String((claimed as any).user_id ?? (job as any).user_id ?? "").trim();
        if (userId) {
          const quota = await checkAiMonthlyQuota(userId);
          if (!quota.allowed) {
            const reason = quota.reason ?? "monthly_quota_exceeded";
            await supabaseAdmin
              .from("invoice_jobs")
              .update({ status: "needs_review", needs_review_reason: reason })
              .eq("id", job.id);
            processedResults.push({ id: job.id, status: "needs_review", error: reason });
            return;
          }
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

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Determine file type
        const mimeType = claimed.storage_path.toLowerCase().endsWith('.pdf') 
          ? 'application/pdf' 
          : 'image/jpeg';

        // C. Process with Gemini Vision
        log.info({ jobId: job.id }, "invoice_gemini_call");
        const systemInstruction = buildInvoiceExtractorPrompt("[INVOICE DOCUMENT ATTACHED]");
        const resultText = await generateContentFromPDF(
          "gemini-2.5-flash",
          systemInstruction,
          buffer,
          mimeType,
          invoiceExtractionSchema
        );

        log.info({ jobId: job.id, length: resultText?.length || 0 }, "invoice_gemini_response");

        let extractedJson: any = null;
        try {
          extractedJson = JSON.parse(resultText);
        } catch {
          extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
        }

        if (!extractedJson) throw new Error("Empty extraction result");

        log.info({ jobId: job.id }, "invoice_extraction_parsed");

        // Validate extracted data
        if (!extractedJson.totalAmount && extractedJson.totalAmount !== 0) {
          throw new Error("Missing totalAmount in extraction result");
        }

        // D. Save Results
        const { error: resultInsertError } = await supabaseAdmin.from("invoice_results").insert({
          job_id: job.id,
          total_amount: extractedJson.totalAmount,
          currency: extractedJson.currency || "EUR",
          invoice_number: extractedJson.invoiceNumber || null,
          invoice_date: extractedJson.invoiceDate || null,
          vendor_name: extractedJson.vendorName || null,
          purpose: extractedJson.purpose || null,
        });

        if (resultInsertError) {
          log.error({ jobId: job.id, resultInsertError }, "invoice_result_insert_failed");
          throw new Error(`Failed to insert result: ${resultInsertError.message}`);
        }

        log.info({ jobId: job.id }, "invoice_result_saved");

        await supabaseAdmin.from("invoice_jobs").update({ status: "done" }).eq("id", job.id);
        log.info({ jobId: job.id }, "invoice_job_done");
        processedResults.push({ id: job.id, status: "success" });
      } catch (jobErr: any) {
        log.error({ jobId: job.id, err: jobErr }, "invoice_job_failed");
        const errorMessage = jobErr?.message || String(jobErr);
        captureServerException(jobErr, { requestId, jobId: job.id, kind: "invoice" });
        
        await supabaseAdmin
          .from("invoice_jobs")
          .update({ 
            status: "failed", 
            needs_review_reason: errorMessage 
          })
          .eq("id", job.id);
          
        processedResults.push({ id: job.id, status: "failed", error: errorMessage });
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
