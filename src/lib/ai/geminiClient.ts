import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(20),
});

const parsed = envSchema.safeParse(process.env);
const apiKey = parsed.success ? parsed.data.GEMINI_API_KEY : null;

if (!apiKey) {
  const msg = `Missing/invalid GEMINI_API_KEY. ${parsed.success ? "" : parsed.error.issues.map((i) => i.message).join("; ")}`.trim();
  // Fail fast in production/preview so we don't enqueue jobs that will never process.
  if (process.env.VERCEL_ENV || process.env.NODE_ENV === "production") {
    throw new Error(msg);
  }
  console.warn(msg);
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

function requireGemini() {
  if (!genAI) throw new Error("Gemini is not configured (missing GEMINI_API_KEY)");
  return genAI;
}

export async function generateContent(modelName: string, prompt: string, schema?: any) {
  const model = requireGemini().getGenerativeModel({
    model: modelName,
    generationConfig: schema ? {
        responseMimeType: "application/json",
        responseSchema: schema,
    } : undefined
  });

  // Add a timeout of 30 seconds for regular API calls
  const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API call timeout (30s)")), 30000)
  );

  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise
  ]) as any;

  return result.response.text();
}

export async function generateContentFromPDF(modelName: string, prompt: string, pdfData: Buffer, mimeType = "application/pdf", schema?: any) {
    const model = requireGemini().getGenerativeModel({
        model: modelName,
        generationConfig: schema ? {
            responseMimeType: "application/json",
            responseSchema: schema,
        } : undefined
    });

    // Add a timeout of 60 seconds for Gemini API calls
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Gemini API call timeout (60s)")), 60000)
    );

    const result = await Promise.race([
        model.generateContent([
            {
                inlineData: {
                    data: pdfData.toString("base64"),
                    mimeType,
                },
            },
            prompt,
        ]),
        timeoutPromise
    ]) as any;

    return result.response.text();
}
