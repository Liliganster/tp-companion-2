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

  const result = await model.generateContent(prompt);
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

    const result = await model.generateContent([
        {
            inlineData: {
                data: pdfData.toString("base64"),
                mimeType,
            },
        },
        prompt,
    ]);

    return result.response.text();
}
