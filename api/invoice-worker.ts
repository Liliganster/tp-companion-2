import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { buildInvoiceExtractorPrompt, invoiceExtractionSchema } from "../src/lib/ai/invoicePrompt.js";

export default async function handler(req: any, res: any) {
  // CRON authentication
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  // Verify that the request is from Vercel Cron
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.query.key !== cronSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // 1. Fetch queued invoice jobs (up to 8 concurrently)
    const { data: jobs, error } = await supabaseAdmin
      .from("invoice_jobs")
      .select("*")
      .eq("status", "queued")
      .limit(8);

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
        .select("id, storage_path")
        .maybeSingle();

      if (claimError || !claimed) return;

      try {
        console.log(`[Invoice Job ${job.id}] Starting processing...`);

        // A. Download PDF/Image from project_documents bucket
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("project_documents")
          .download(claimed.storage_path);

        if (downloadError) {
          console.error(`[Invoice Job ${job.id}] Download error:`, downloadError);
          throw new Error(`Failed to download invoice: ${downloadError.message}`);
        }
        if (!fileData) {
          throw new Error("Failed to download invoice: no data returned");
        }

        console.log(`[Invoice Job ${job.id}] File downloaded, size: ${fileData.size} bytes`);

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // B. Determine file type
        const mimeType = claimed.storage_path.toLowerCase().endsWith('.pdf') 
          ? 'application/pdf' 
          : 'image/jpeg';

        // C. Process with Gemini Vision
        console.log(`[Invoice Job ${job.id}] Calling Gemini API...`);
        const systemInstruction = buildInvoiceExtractorPrompt("[INVOICE DOCUMENT ATTACHED]");
        const resultText = await generateContentFromPDF(
          "gemini-2.5-flash",
          systemInstruction,
          buffer,
          mimeType,
          invoiceExtractionSchema
        );

        console.log(`[Invoice Job ${job.id}] Gemini response received, length: ${resultText?.length || 0}`);

        let extractedJson: any = null;
        try {
          extractedJson = JSON.parse(resultText);
        } catch {
          extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
        }

        if (!extractedJson) throw new Error("Empty extraction result");

        console.log(`[Invoice Job ${job.id}] Extraction result:`, JSON.stringify(extractedJson, null, 2));

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
        });

        if (resultInsertError) {
          console.error(`[Invoice Job ${job.id}] Failed to insert result:`, resultInsertError);
          throw new Error(`Failed to insert result: ${resultInsertError.message}`);
        }

        console.log(`[Invoice Job ${job.id}] Saved extraction result successfully`);

        await supabaseAdmin.from("invoice_jobs").update({ status: "done" }).eq("id", job.id);
        console.log(`[Invoice Job ${job.id}] Marked as done`);
        processedResults.push({ id: job.id, status: "success" });
      } catch (jobErr: any) {
        console.error(`[Invoice Job ${job.id}] Processing error:`, jobErr);
        const errorMessage = jobErr?.message || String(jobErr);
        const errorDetails = {
          message: errorMessage,
          stack: jobErr?.stack,
          name: jobErr?.name
        };
        console.error(`[Invoice Job ${job.id}] Error details:`, JSON.stringify(errorDetails, null, 2));
        
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
    console.error("Invoice worker error:", err);
    res.status(500).json({ error: err.message });
  }
}
