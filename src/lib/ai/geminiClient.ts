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
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        const text = (part as { text?: unknown } | null)?.text;
        return typeof text === "string" ? text : "";
      })
      .join("")
      .trim();
  }

  return "";
}

/** Esquema JSON plano (formato Gemini/OpenAI); estructural, sin validación. */
export type JsonSchema = Record<string, unknown>;

type OpenRouterMessage = { role: string; content: unknown };

/**
 * Limpia la respuesta cuando el modelo no soporta salida estructurada:
 * quita vallas ```json y recorta al primer objeto/array JSON del texto.
 */
function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(trimmed);
  const candidate = (fence ? fence[1] : trimmed).trim();
  if (candidate.startsWith("{") || candidate.startsWith("[")) return candidate;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

/** Añade la instrucción de esquema al texto del último mensaje de usuario. */
function withSchemaInstruction(messages: OpenRouterMessage[], note: string): OpenRouterMessage[] {
  return messages.map((m, i) => {
    if (i !== messages.length - 1 || m.role !== "user") return m;
    if (typeof m.content === "string") return { ...m, content: m.content + note };
    if (Array.isArray(m.content)) {
      let appended = false;
      const parts = m.content.map((part) => {
        const p = part as { type?: unknown; text?: unknown } | null;
        if (!appended && p && typeof p === "object" && p.type === "text") {
          appended = true;
          return { ...(p as Record<string, unknown>), text: String(p.text ?? "") + note };
        }
        return part;
      });
      if (!appended) parts.push({ type: "text", text: note });
      return { ...m, content: parts };
    }
    return m;
  });
}

async function callOpenRouter(
  modelName: string,
  prompt: string,
  apiKey: string,
  schema?: JsonSchema,
  messages?: OpenRouterMessage[],
): Promise<AiGenerationResult> {
  const finalMessages = messages || [{ role: "user", content: prompt }];

  const payload: Record<string, unknown> = {
    model: modelName,
    messages: finalMessages,
    temperature: 0, // extracción determinista (igual que la ruta Gemini directa)
  };

  if (schema) {
    // El modo estricto de OpenAI exige que `required` incluya TODAS las
    // propiedades (los campos "opcionales" se modelan igualmente como
    // required — el modelo puede devolverlos vacíos). Gemini no lo exige,
    // así que se normaliza aquí solo para OpenRouter.
    // Recursivo: el modo estricto exige required=todas las propiedades y
    // additionalProperties:false en CADA nivel (los items de locations son objetos).
    const toStrict = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(toStrict);
      if (!node || typeof node !== "object") return node;
      const out: Record<string, unknown> = { ...(node as Record<string, unknown>) };
      if (out.properties && typeof out.properties === "object") {
        out.properties = Object.fromEntries(
          Object.entries(out.properties as Record<string, unknown>).map(([k, v]) => [k, toStrict(v)]),
        );
        out.required = Object.keys(out.properties as Record<string, unknown>);
        out.additionalProperties = false;
      }
      if (out.items) out.items = toStrict(out.items);
      return out;
    };
    const strictSchema = toStrict(schema);
    payload.response_format = {
      type: "json_schema",
      json_schema: {
        name: "extraction",
        schema: strictSchema,
        strict: true
      }
    };
  }

  const doRequest = async (body: Record<string, unknown>): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
    try {
      return await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://fahrtenbuch-pro.com",
          "X-Title": "Fahrtenbuch Pro",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let response = await doRequest(payload);

  // OpenRouter propio (plan Pro) debe funcionar con la MAYORÍA de modelos
  // multimodales: muchos no soportan response_format json_schema estricto y
  // devuelven 4xx. Reintento ÚNICO sin salida estructurada, con el esquema
  // incrustado en el prompt; la respuesta se limpia con extractJsonPayload.
  let usedSchemaFallback = false;
  if (!response.ok && schema && response.status >= 400 && response.status < 500) {
    const note = `\n\nDevuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin comentarios, sin texto adicional) que cumpla exactamente este esquema JSON:\n${JSON.stringify(schema)}`;
    usedSchemaFallback = true;
    response = await doRequest({
      model: modelName,
      messages: withSchemaInstruction(finalMessages, note),
      temperature: 0,
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    model?: unknown;
    provider?: unknown;
  };
  const text = extractOpenRouterText(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error("OpenRouter API error: empty response content");

  return {
    text: schema && usedSchemaFallback ? extractJsonPayload(text) : text,
    provider: "openrouter",
    model: typeof data?.model === "string" && data.model.trim() ? data.model : modelName,
    vendor: typeof data?.provider === "string" && data.provider.trim() ? data.provider : "openrouter",
  };
}

export async function generateContent(
  modelName: string,
  prompt: string,
  schema?: JsonSchema,
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
        // Extracción determinista: sin temperatura fijada, el modelo variaba
        // entre corridas (2 vs 6 localizaciones del mismo PDF).
        temperature: 0,
    } : undefined
  });

  const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API call timeout (30s)")), 30000)
  );

  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise
  ]) as { response: { text: () => string } };

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
  schema?: JsonSchema,
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
            temperature: 0, // extracción determinista
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
    ]) as { response: { text: () => string } };

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
  schema?: JsonSchema,
  userSettings?: AiUserSettings,
): Promise<AiGenerationResult> {
    if (userSettings?.openrouterEnabled && userSettings?.openrouterApiKey) {
        const orModel = userSettings.openrouterModel || "google/gemini-2.5-flash";
        
        // Build content array with text + all images
        const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
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
            temperature: 0, // extracción determinista
        } : undefined
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Gemini Vision timeout (60s)")), 60000)
    );

    // Build parts array: all images + prompt
    const parts: Array<Record<string, unknown> | string> = images.map(img => ({
      inlineData: {
        data: img,
        mimeType: "image/png",
      },
    }));
    parts.push(prompt);

    const result = await Promise.race([
        model.generateContent(parts),
        timeoutPromise
    ]) as { response: { text: () => string } };

    return {
      text: result.response.text(),
      provider: "gemini",
      model: modelName,
      vendor: "google",
    };
}
