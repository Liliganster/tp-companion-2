import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("Missing GEMINI_API_KEY environment variable");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

export async function generateContent(modelName: string, prompt: string, schema?: any) {
  const model = genAI.getGenerativeModel({
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
    const model = genAI.getGenerativeModel({
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
