/* eslint-disable no-undef */
import { createClient } from "@supabase/supabase-js";
// @ts-ignore
import pdflib from "pdf-parse";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

// Setup Clients
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !geminiApiKey) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const genAI = new GoogleGenerativeAI(geminiApiKey);

// Continuous Polling Loop
async function startPolling() {
  console.log("🚀 Local Universal Extractor Worker Started (Polling every 5s)...");
  
  // Initial run
  await runWorker();

  // Poll
  setInterval(async () => {
    await runWorker();
  }, 5000);
}

// Simplified Logic from api/worker.ts (Duplicated for local script usage without full TS build)
async function runWorker() {
    try {
        // 1. Fetch queued jobs
        const { data: jobs, error } = await supabaseAdmin
            .from("callsheet_jobs")
            .select("*")
            .eq("status", "queued")
            .limit(1);

        if (error) {
            console.error("Error fetching jobs:", error.message);
            return;
        }

        if (!jobs || jobs.length === 0) {
            // Quietly return if nothing to do
            // process.stdout.write("."); // Optional heartbeat
            return;
        }

        const job = jobs[0];
        console.log(`\n📦 Processing Job ${job.id}...`);

        // Mark processing
        await supabaseAdmin.from("callsheet_jobs").update({ status: "processing" }).eq("id", job.id);

        try {
            // Download
            const { data: fileData, error: dlError } = await supabaseAdmin.storage
                .from("callsheets").download(job.storage_path);
            if (dlError) throw dlError;

            const arrayBuffer = await fileData.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Extract Text (Native assumed for script simplicity or use pdf-parse)
            const pdfData = await pdflib(buffer);
            const textContent = pdfData.text;

            console.log(`   📄 Extracted ${textContent.length} chars.`);

            // Prompt
            const prompt = `Extrae información: date (YYYY-MM-DD), projectName, productionCompanies (array), locations (array). JSON only.\n\n${textContent.slice(0, 10000)}`;
            
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05", generationConfig: { responseMimeType: "application/json" } });
            
            console.log("   🤖 Asking Gemini...");
            const result = await model.generateContent(prompt);
            const resultText = result.response.text();
            
            let extractedJson;
            try {
                extractedJson = JSON.parse(resultText);
            } catch (e) {
                // simple cleanup if markdown ticks present
                extractedJson = JSON.parse(resultText.replace(/```json|```/g, "").trim());
            }

            console.log("   ✅ AI Success:", extractedJson.projectName);

            // Save
            await supabaseAdmin.from("callsheet_results").insert({
                job_id: job.id,
                date_value: extractedJson.date,
                project_value: extractedJson.projectName,
                producer_value: extractedJson.productionCompanies?.[0]
            });

            // Save locations (skip geocoding for simple script)
            if (extractedJson.locations && Array.isArray(extractedJson.locations)) {
                const locs = extractedJson.locations.map((l: string) => ({
                    job_id: job.id,
                    address_raw: l,
                    label_source: "SCRIPT_EXTRACTED"
                }));
                await supabaseAdmin.from("callsheet_locations").insert(locs);
            }

            // Done
            await supabaseAdmin.from("callsheet_jobs").update({ status: "done" }).eq("id", job.id);
            console.log("   ✨ Job Complete!");

        } catch (jobErr: any) {
            console.error("   ❌ Job Failed:", jobErr.message);
            await supabaseAdmin.from("callsheet_jobs").update({ status: "failed", error: jobErr.message }).eq("id", job.id);
        }

    } catch (e: any) {
        console.error("Worker Loop Error:", e);
    }
}

startPolling();
