import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(20).optional().nullable(),
});

const parsed = envSchema.safeParse(process.env);
const apiKey = parsed.success ? parsed.data.GEMINI_API_KEY : null;

if (!apiKey) {
  const msg = `Missing/invalid GEMINI_API_KEY. ${parsed.success ? "" : parsed.error.issues.map((i) => i.message).join("; ")}`.trim();
  if (process.env.VERCEL_ENV || process.env.NODE_ENV === "production") {
    // throw new Error(msg); // Let it pass if user relies entirely on OpenRouter
    console.warn(msg);
  } else {
    console.warn(msg);
  }
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface AiUserSettings {
  openrouterEnabled?: boolean;
  openrouterApiKey?: string;
  openrouterModel?: string;
}

export type AiProvider = "gemini" | "openrouter";

export interface AiGenerationResult {
  text: string;
  provider: AiProvider;
  model: string;
  vendor: string | null;
}

function requireGemini() {
  if (!genAI) throw new Error("Gemini is not configured (missing GEMINI_API_KEY) and OpenRouter fallback was not provided.");
  return genAI;
}

function extractOpenRouterText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function callOpenRouter(modelName: string, prompt: string, apiKey: string, schema?: any, messages?: any[]): Promise<AiGenerationResult> {
  const finalMessages = messages || [{ role: "user", content: prompt }];
  
  const payload: any = {
    model: modelName,
    messages: finalMessages,
  };

  if (schema) {
    payload.response_format = {
      type: "json_schema",
      json_schema: {
        name: "extraction",
        schema: schema,
        strict: true
      }
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://fahrtenbuch-pro.com", 
        "X-Title": "Fahrtenbuch Pro",
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${text}`);
    }

    const data: any = await response.json();
    const text = extractOpenRouterText(data?.choices?.[0]?.message?.content);
    if (!text) throw new Error("OpenRouter API error: empty response content");

    return {
      text,
      provider: "openrouter",
      model: typeof data?.model === "string" && data.model.trim() ? data.model : modelName,
      vendor: typeof data?.provider === "string" && data.provider.trim() ? data.provider : "openrouter",
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function generateContent(
  modelName: string,
  prompt: string,
  schema?: any,
  userSettings?: AiUserSettings,
): Promise<AiGenerationResult> {
  if (userSettings?.openrouterEnabled && userSettings?.openrouterApiKey) {
    const orModel = userSettings.openrouterModel || "google/gemini-2.5-flash";
    return callOpenRouter(orModel, prompt, userSettings.openrouterApiKey, schema);
  }

  const model = requireGemini().getGenerativeModel({
    model: modelName,
    generationConfig: schema ? {
        responseMimeType: "application/json",
        responseSchema: schema,
    } : undefined
  });

  const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API call timeout (30s)")), 30000)
  );

  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise
  ]) as any;

  return {
    text: result.response.text(),
    provider: "gemini",
    model: modelName,
    vendor: "google",
  };
}

export async function generateContentFromPDF(
  modelName: string,
  prompt: string,
  pdfData: Buffer,
  mimeType = "application/pdf",
  schema?: any,
  userSettings?: AiUserSettings,
): Promise<AiGenerationResult> {
    if (userSettings?.openrouterEnabled && userSettings?.openrouterApiKey) {
        const orModel = userSettings.openrouterModel || "google/gemini-2.5-flash";
        const base64Data = pdfData.toString("base64");

        const content =
          mimeType === "application/pdf"
            ? [
                { type: "text", text: prompt },
                {
                  type: "file",
                  file: {
                    filename: "document.pdf",
                    file_data: `data:${mimeType};base64,${base64Data}`,
                  },
                },
              ]
            : [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64Data}` },
                },
              ];

        const messages = [
            {
                role: "user",
                content,
            }
        ];

        return callOpenRouter(orModel, prompt, userSettings.openrouterApiKey, schema, messages);
    }

    const model = requireGemini().getGenerativeModel({
        model: modelName,
        generationConfig: schema ? {
            responseMimeType: "application/json",
            responseSchema: schema,
        } : undefined
    });

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

    return {
      text: result.response.text(),
      provider: "gemini",
      model: modelName,
      vendor: "google",
    };
}

/**
 * Generate content from multiple images using Gemini Vision.
 * Used for robust extraction: sends page images for visual analysis.
 * 
 * @param modelName - Gemini model name (e.g., "gemini-2.5-flash")
 * @param prompt - The extraction prompt
 * @param images - Array of base64-encoded PNG images
 * @param schema - Optional JSON schema for structured output
 * @param userSettings - Optional user AI settings (OpenRouter fallback)
 */
export async function generateContentFromImages(
  modelName: string,
  prompt: string,
  images: string[],
  schema?: any,
  userSettings?: AiUserSettings,
): Promise<AiGenerationResult> {
    if (userSettings?.openrouterEnabled && userSettings?.openrouterApiKey) {
        const orModel = userSettings.openrouterModel || "google/gemini-2.5-flash";
        
        // Build content array with text + all images
        const content: any[] = [{ type: "text", text: prompt }];
        for (const img of images) {
          content.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${img}` },
          });
        }

        const messages = [{ role: "user", content }];
        return callOpenRouter(orModel, prompt, userSettings.openrouterApiKey, schema, messages);
    }

    const model = requireGemini().getGenerativeModel({
        model: modelName,
        generationConfig: schema ? {
            responseMimeType: "application/json",
            responseSchema: schema,
        } : undefined
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Gemini Vision timeout (60s)")), 60000)
    );

    // Build parts array: all images + prompt
    const parts: any[] = images.map(img => ({
      inlineData: {
        data: img,
        mimeType: "image/png",
      },
    }));
    parts.push(prompt);

    const result = await Promise.race([
        model.generateContent(parts),
        timeoutPromise
    ]) as any;

    return {
      text: result.response.text(),
      provider: "gemini",
      model: modelName,
      vendor: "google",
    };
}
