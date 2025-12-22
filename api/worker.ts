import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContent, generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildUniversalExtractorPrompt } from "../src/lib/ai/prompts.js";
import { geocodeAddress } from "../src/lib/geocodingServer.js";
import { extractionSchema } from "../src/lib/ai/schema.js";

// @ts-expect-error - pdf-parse has CommonJS default export
import pdfParse from "pdf-parse";

// Helper to determine if native text
async function detectPdfKind(buffer: Buffer): Promise<"native_text" | "scanned"> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text;
    const pageCount = data.numpages;
    
    // Heuristic: Average characters per page
    const avgChars = text.length / pageCount;
    
    // If average chars < 50, likely scanned or heavy graphics
    return avgChars > 50 ? "native_text" : "scanned";
  } catch (e) {
    console.error("PDF detection failed, defaulting to scanned", e);
    return "scanned";
  }
}

export default async function handler(req: any, res: any) {
  // CRON authentication
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  // Verify that the request is from Vercel Cron
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.query.key !== cronSecret) {
      // Allow manual trigger via query param ?key=SECRET for testing
      res.status(401).json({ error: 'Unauthorized' });
      return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // 1. Fetch queued jobs
    const { data: jobs, error } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("*")
      .eq("status", "queued")
      .limit(5);

    if (error) throw error;
    if (!jobs || jobs.length === 0) {
      res.status(200).json({ message: "No jobs queued" });
      return;
    }

    const processedResults = [];

    // 2. Process each job
    for (const job of jobs) {
      try {
        console.log(`Processing Job ${job.id}`);
        
        // Mark as processing
        await supabaseAdmin
          .from("callsheet_jobs")
          .update({ status: "processing", processed_at: new Date().toISOString() })
          .eq("id", job.id);

        // A. Download PDF
        const { data: fileData, error: downloadError } = await supabaseAdmin
          .storage
          .from("callsheets")
          .download(job.storage_path);

        if (downloadError || !fileData) throw new Error("Failed to download PDF");
        
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Detect Kind
        const kind = await detectPdfKind(buffer);
        console.log(`Job ${job.id} detected as ${kind}`);

        await supabaseAdmin
          .from("callsheet_jobs")
          .update({ pdf_kind: kind })
          .eq("id", job.id);

        // C. Extract with Gemini
        // C. Extract with Gemini
        let extractedJson: any = null;
        
        if (kind === "native_text") {
            // Extract text first to save tokens/use Flash-Lite
            const pdfData = await pdfParse(buffer);
            const textContent = pdfData.text;
            const fullPrompt = buildUniversalExtractorPrompt(textContent);
            
            // Use Flash-Lite
            const resultText = await generateContent(
                "gemini-2.0-flash-lite-preview-02-05", 
                fullPrompt,
                extractionSchema
            );
            // Verify if resultText is JSON or stringified JSON
            try {
                extractedJson = JSON.parse(resultText);
            } catch (e) {
                // Fallback if model returns code blocks
               extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
            }
            console.log("Extracted via Flash-Lite (Native)");
        } else {
            // Scanned -> Use Flash 2.0 with PDF
             const systemInstruction = buildUniversalExtractorPrompt("[PDF CONTENT ATTACHED]");
             const resultText = await generateContentFromPDF(
                "gemini-2.0-flash", 
                systemInstruction, 
                buffer, 
                "application/pdf",
                extractionSchema
            );
             try {
                extractedJson = JSON.parse(resultText);
            } catch (e) {
               extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
            }
             console.log("Extracted via Flash (Vision)");
        }

        // D. Save Results
        if (extractedJson) {
            // Save main results
            await supabaseAdmin.from("callsheet_results").insert({
                job_id: job.id,
                date_value: extractedJson.date,
                project_value: extractedJson.projectName,
                producer_value: extractedJson.productionCompanies?.[0], // Taking first for simplicity in summary
                // Confidence scores would come from model if requested, defaulting null for now
            });

            // Save locations with Geocoding
            if (extractedJson.locations && Array.isArray(extractedJson.locations)) {
                const locs = [];
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
                        geocode_quality: geo?.quality
                    });
                }
                
                if (locs.length > 0) {
                    await supabaseAdmin.from("callsheet_locations").insert(locs);
                }
            }

            // Mark Done
            await supabaseAdmin
                .from("callsheet_jobs")
                .update({ status: "done" })
                .eq("id", job.id);
            
            processedResults.push({ id: job.id, status: "success" });
        } else {
            throw new Error("Empty extraction result");
        }

      } catch (jobErr: any) {
        console.error(`Error processing job ${job.id}:`, jobErr);
        await supabaseAdmin
          .from("callsheet_jobs")
          .update({ status: "failed", error: jobErr.message })
          .eq("id", job.id);
        processedResults.push({ id: job.id, status: "failed", error: jobErr.message });
      }
    }

    res.status(200).json({ processed: processedResults.length, details: processedResults });
  } catch (err: any) {
    console.error("Worker error:", err);
    res.status(500).json({ error: err.message });
  }
}
