import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildUniversalExtractorPrompt } from "../src/lib/ai/prompts.js";
import { extractionSchema } from "../src/lib/ai/schema.js";

// Geocoding function with direct access to env vars
async function geocodeAddress(address: string) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    console.error("Missing GOOGLE_MAPS_SERVER_KEY");
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
    console.error("Geocoding error:", error);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  // CRON authentication
  const authHeader = req.headers?.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
  const requireSecret = vercelEnv ? vercelEnv !== "development" : process.env.NODE_ENV === "production";

  const queryKey = typeof req.query?.key === "string" ? req.query.key : null;

  // In production/preview: require CRON_SECRET and only accept Authorization header.
  // In development: allow unauthenticated runs if CRON_SECRET is not set; if set, allow header or ?key=.
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
    if (authHeader !== `Bearer ${cronSecret}` && queryKey !== cronSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // 1. Fetch queued jobs (up to 8 concurrently)
    const { data: jobs, error } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("status", "queued")
      .limit(8);

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
        .select("id, storage_path")
        .maybeSingle();

      if (claimError || !claimed) return; // already taken or not claimable

      try {
        console.log(`[Job ${job.id}] Starting processing...`);

        // A. Download PDF
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("callsheets")
          .download(claimed.storage_path);

        if (downloadError) {
          console.error(`[Job ${job.id}] Download error:`, downloadError);
          throw new Error(`Failed to download PDF: ${downloadError.message}`);
        }
        if (!fileData) {
          throw new Error("Failed to download PDF: no data returned");
        }

        console.log(`[Job ${job.id}] PDF downloaded, size: ${fileData.size} bytes`);

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Process PDF with Gemini Vision
        console.log(`[Job ${job.id}] Calling Gemini API...`);
        const systemInstruction = buildUniversalExtractorPrompt("[PDF CONTENT ATTACHED]");
        const resultText = await generateContentFromPDF(
          "gemini-2.5-flash",
          systemInstruction,
          buffer,
          "application/pdf",
          extractionSchema
        );

        console.log(`[Job ${job.id}] Gemini response received, length: ${resultText?.length || 0}`);

        let extractedJson: any = null;
        try {
          extractedJson = JSON.parse(resultText);
        } catch {
          extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
        }

        if (!extractedJson) throw new Error("Empty extraction result");

        const extractedLocationCount = Array.isArray(extractedJson.locations) ? extractedJson.locations.length : 0;
        console.log(`[Job ${job.id}] Extraction parsed (locations=${extractedLocationCount})`);

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
          console.error(`[Job ${job.id}] Failed to insert result:`, resultInsertError);
          throw new Error(`Failed to insert result: ${resultInsertError.message}`);
        }

        console.log(`[Job ${job.id}] Saved extraction result successfully`);

        if (Array.isArray(extractedJson.locations)) {
          const locs: any[] = [];
          for (const locStr of extractedJson.locations) {
            const geo = await geocodeAddress(locStr);
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
              console.error(`[Job ${job.id}] Failed to insert locations:`, locsInsertError);
              throw new Error(`Failed to insert locations: ${locsInsertError.message}`);
            }
            console.log(`[Job ${job.id}] Saved ${locs.length} locations successfully`);
          }
        }

        await supabaseAdmin.from("callsheet_jobs").update({ status: "done" }).eq("id", job.id);
        console.log(`[Job ${job.id}] Marked as done`);
        processedResults.push({ id: job.id, status: "success" });
      } catch (jobErr: any) {
        console.error(`[Job ${job.id}] Processing error:`, jobErr);
        const errorMessage = jobErr?.message || String(jobErr);
        const errorDetails = {
          message: errorMessage,
          stack: jobErr?.stack,
          name: jobErr?.name
        };
        console.error(`[Job ${job.id}] Error details:`, JSON.stringify(errorDetails, null, 2));
        
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
    console.error("Worker error:", err);
    res.status(500).json({ error: err.message });
  }
}
