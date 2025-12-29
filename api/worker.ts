import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildUniversalExtractorPrompt } from "../src/lib/ai/prompts.js";
import { extractionSchema } from "../src/lib/ai/schema.js";
import { captureServerException, logger, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { checkAiMonthlyQuota } from "./_utils/aiQuota.js";

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
    name: "callsheet_worker",
    limit: 10,
    windowMs: 60_000,
    requestId,
  });
  if (!cronAllowed) return;

  try {
    // 1. Fetch queued jobs (up to 8 concurrently)
    const { data: jobs, error } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("status", "queued")
      .limit(maxJobs);

    if (error) throw error;
    if (!jobs || jobs.length === 0) {
      res.status(200).json({ message: "No jobs queued" });
      return;
    }

    const processedResults: any[] = [];

    async function processJob(job: any) {
      // Atomically claim the job so concurrent workers don't double-process.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("callsheet_jobs")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "queued")
        .select("id, storage_path, user_id")
        .maybeSingle();

      if (claimError || !claimed) return; // already taken or not claimable

      try {
        log.info({ jobId: job.id }, "callsheet_job_start");

        // Monthly quota (counts only when jobs reach `done`).
        const userId = String((claimed as any).user_id ?? (job as any).user_id ?? "").trim();
        if (userId) {
          const quota = await checkAiMonthlyQuota(userId);
          if (!quota.allowed) {
            const reason = quota.reason ?? "monthly_quota_exceeded";
            await supabaseAdmin
              .from("callsheet_jobs")
              .update({ status: "out_of_quota", needs_review_reason: reason })
              .eq("id", job.id);
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
          await supabaseAdmin.from("callsheet_jobs").update({ status: "done" }).eq("id", job.id);
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

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Process PDF with Gemini Vision
        log.info({ jobId: job.id }, "callsheet_gemini_call");
        const systemInstruction = buildUniversalExtractorPrompt("[PDF CONTENT ATTACHED]");
        const resultText = await generateContentFromPDF(
          "gemini-2.5-flash",
          systemInstruction,
          buffer,
          "application/pdf",
          extractionSchema
        );

        log.info({ jobId: job.id, length: resultText?.length || 0 }, "callsheet_gemini_response");

        let extractedJson: any = null;
        try {
          extractedJson = JSON.parse(resultText);
        } catch {
          extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
        }

        if (!extractedJson) throw new Error("Empty extraction result");

        const extractedLocationCount = Array.isArray(extractedJson.locations) ? extractedJson.locations.length : 0;
        log.info({ jobId: job.id, locations: extractedLocationCount }, "callsheet_extraction_parsed");

        // Validate extracted data
        if (!extractedJson.date) {
          throw new Error("Missing date in extraction result");
        }
        if (!extractedJson.projectName) {
          throw new Error("Missing projectName in extraction result");
        }
        if (!Array.isArray(extractedJson.locations) || extractedJson.locations.length === 0) {
          throw new Error("Missing or empty locations in extraction result");
        }

        // D. Save Results
        const { error: resultInsertError } = await supabaseAdmin.from("callsheet_results").insert({
          job_id: job.id,
          date_value: extractedJson.date,
          project_value: extractedJson.projectName,
          producer_value: extractedJson.productionCompanies?.[0],
        });

        if (resultInsertError) {
          log.error({ jobId: job.id, resultInsertError }, "callsheet_result_insert_failed");
          throw new Error(`Failed to insert result: ${resultInsertError.message}`);
        }

        log.info({ jobId: job.id }, "callsheet_result_saved");

        if (Array.isArray(extractedJson.locations)) {
          const locs: any[] = [];
          for (const locStr of extractedJson.locations) {
            const geo = skipGeocode ? null : await geocodeAddress(locStr);
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
          }

          if (locs.length > 0) {
            const { error: locsInsertError } = await supabaseAdmin.from("callsheet_locations").insert(locs);
            if (locsInsertError) {
              log.error({ jobId: job.id, locsInsertError }, "callsheet_locations_insert_failed");
              throw new Error(`Failed to insert locations: ${locsInsertError.message}`);
            }
            log.info({ jobId: job.id, locations: locs.length }, "callsheet_locations_saved");
          }
        }

        await supabaseAdmin.from("callsheet_jobs").update({ status: "done" }).eq("id", job.id);
        log.info({ jobId: job.id }, "callsheet_job_done");
        processedResults.push({ id: job.id, status: "success" });
      } catch (jobErr: any) {
        log.error({ jobId: job.id, err: jobErr }, "callsheet_job_failed");
        const errorMessage = jobErr?.message || String(jobErr);
        captureServerException(jobErr, { requestId, jobId: job.id, kind: "callsheet" });
        
        await supabaseAdmin
          .from("callsheet_jobs")
          .update({ 
            status: "failed", 
            needs_review_reason: errorMessage 
          })
          .eq("id", job.id);
          
        processedResults.push({ id: job.id, status: "failed", error: errorMessage });
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
