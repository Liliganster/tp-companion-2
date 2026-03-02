/**
 * Consolidated router for /api/expenses/* routes.
 * Handler logic is verbatim from original expenses/extract.ts.
 */

import { requireSupabaseUser } from "./_utils/supabase.js";
import { supabaseAdmin } from "../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../src/lib/ai/geminiClient.js";
import { captureServerException, withApiObservability } from "./_utils/observability.js";
import { enforceRateLimit } from "./_utils/rateLimit.js";
import { checkAiMonthlyQuota, recordAiUsage } from "./_utils/aiQuota.js";

type ExpenseType = "toll" | "parking" | "fuel" | "other";

// Skip OCR in serverless - Tesseract is too heavy for Vercel functions
// Gemini Vision is good enough for receipt extraction
async function runOCR(_imageBuffer: Buffer, _mimeType: string): Promise<string> {
  // OCR disabled - Tesseract.js causes timeouts in serverless environments
  // Gemini 2.5 Flash has excellent OCR capabilities built-in
  return "";
}

// Build prompt with OCR text if available
function buildPromptWithOCR(basePrompt: string, ocrText: string): string {
  if (!ocrText || ocrText.length < 10) return basePrompt;
  const truncatedOCR = ocrText.length > 2000 ? ocrText.substring(0, 2000) + "..." : ocrText;
  return `${basePrompt}\n\nIMPORTANT: Here is the OCR-extracted text from the receipt to help you:\n---\n${truncatedOCR}\n---\nUse both the image AND this OCR text to extract the data accurately. The OCR may have errors, so cross-reference with the image.`;
}

// Expense-specific prompts - shorter and more focused
const EXPENSE_PROMPTS: Record<ExpenseType, string> = {
  toll: `Extract ONLY the total amount from this toll/motorway receipt.\nReturn JSON: { "amount": number, "currency": string (ISO code), "vendorName": string|null, "date": string|null (YYYY-MM-DD) }\nRules:\n- amount: final total, no currency symbol\n- Convert commas to dots for decimals (e.g., 12,50 → 12.5)\n- currency: EUR if not explicit\n- If data unclear, use null`,
  parking: `Extract ONLY the total amount from this parking receipt.\nReturn JSON: { "amount": number, "currency": string (ISO code), "vendorName": string|null, "date": string|null (YYYY-MM-DD) }\nRules:\n- amount: final total, no currency symbol\n- Convert commas to dots for decimals\n- currency: EUR if not explicit\n- If data unclear, use null`,
  fuel: `Extract fuel purchase data from this gas station receipt.\nReturn JSON: { "amount": number, "currency": string, "quantity": number|null, "unit": string|null, "pricePerUnit": number|null, "vendorName": string|null, "date": string|null }\nRules:\n- amount: total paid (number only)\n- quantity: liters or gallons purchased\n- unit: "L" or "l" or "liters" or "gal"\n- pricePerUnit: price per liter/gallon\n- Convert commas to dots for decimals\n- currency: EUR if not explicit\n- If data unclear, use null`,
  other: `Extract the total amount from this receipt.\nReturn JSON: { "amount": number, "currency": string (ISO code), "vendorName": string|null, "date": string|null (YYYY-MM-DD) }\nRules:\n- amount: final total, no currency symbol\n- Convert commas to dots for decimals\n- currency: EUR if not explicit\n- If data unclear, use null`,
};

// JSON schemas for Gemini structured output
const EXPENSE_SCHEMAS: Record<ExpenseType, any> = {
  toll:    { type: "object", properties: { amount: { type: "number", description: "Total amount paid" }, currency: { type: "string", description: "Currency ISO code" }, vendorName: { type: "string", description: "Toll operator name" }, date: { type: "string", description: "Receipt date YYYY-MM-DD" } }, required: ["amount"] },
  parking: { type: "object", properties: { amount: { type: "number", description: "Total amount paid" }, currency: { type: "string", description: "Currency ISO code" }, vendorName: { type: "string", description: "Parking provider name" }, date: { type: "string", description: "Receipt date YYYY-MM-DD" } }, required: ["amount"] },
  fuel:    { type: "object", properties: { amount: { type: "number", description: "Total amount paid" }, currency: { type: "string", description: "Currency ISO code" }, quantity: { type: "number", description: "Liters or gallons purchased" }, unit: { type: "string", description: "Unit: L, liters, gal" }, pricePerUnit: { type: "number", description: "Price per liter/gallon" }, vendorName: { type: "string", description: "Gas station name" }, date: { type: "string", description: "Receipt date YYYY-MM-DD" } }, required: ["amount"] },
  other:   { type: "object", properties: { amount: { type: "number", description: "Total amount paid" }, currency: { type: "string", description: "Currency ISO code" }, vendorName: { type: "string", description: "Vendor name" }, date: { type: "string", description: "Receipt date YYYY-MM-DD" } }, required: ["amount"] },
};

const handleExtract = withApiObservability(async function handler(req: any, res: any, { log, requestId }) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // Authenticate user
  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  // Rate limit: 10 requests per minute per user
  const allowed = await enforceRateLimit({ req, res, name: "expense_extract", identifier: user.id, limit: 10, windowMs: 60_000 });
  if (!allowed) return;

  try {
    const { storagePath, expenseType, tripId, projectId } = req.body || {};

    // Validate inputs
    if (!storagePath || typeof storagePath !== "string") { res.status(400).json({ error: "Missing storagePath" }); return; }

    const validTypes: ExpenseType[] = ["toll", "parking", "fuel", "other"];
    if (!expenseType || !validTypes.includes(expenseType)) { res.status(400).json({ error: "Invalid expenseType" }); return; }

    // Check quota (5 extractions/month)
    const quotaCheck = await checkAiMonthlyQuota(user.id);
    if (!quotaCheck.allowed) { res.status(429).json({ error: "Monthly AI quota exceeded", remaining: quotaCheck.remaining, limit: quotaCheck.limit }); return; }

    log.info({ storagePath, expenseType, tripId, projectId }, "expense_extract_start");

    // Fetch AI user settings
    let userSettings = undefined;
    const { data: userProfile } = await supabaseAdmin.from("user_profiles").select("openrouter_enabled, openrouter_api_key, openrouter_model").eq("id", user.id).maybeSingle();
    if (userProfile?.openrouter_enabled && userProfile?.openrouter_api_key) {
      userSettings = { openrouterEnabled: userProfile.openrouter_enabled, openrouterApiKey: userProfile.openrouter_api_key, openrouterModel: userProfile.openrouter_model };
    }

    // Download image from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage.from("project_documents").download(storagePath);
    if (downloadError || !fileData) { log.error({ err: downloadError }, "expense_extract_download_failed"); res.status(404).json({ error: "File not found" }); return; }

    // Convert to buffer
    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Validate file size (max 10MB)
    if (buffer.length > 10 * 1024 * 1024) { res.status(413).json({ error: "File too large" }); return; }

    // Detect MIME type from extension or assume webp
    const ext = storagePath.split(".").pop()?.toLowerCase() || "webp";
    const mimeMap: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
    const mimeType = mimeMap[ext] || "image/webp";

    // Get base prompt and schema for this expense type
    const basePrompt = EXPENSE_PROMPTS[expenseType as ExpenseType];
    const schema = EXPENSE_SCHEMAS[expenseType as ExpenseType];

    // Run OCR to extract text from image (helps with small/blurry text)
    log.info({ storagePath }, "expense_extract_ocr_start");
    const ocrText = await runOCR(buffer, mimeType);
    log.info({ ocrLength: ocrText.length, ocrPreview: ocrText.substring(0, 100) }, "expense_extract_ocr_done");

    // Build enhanced prompt with OCR text
    const prompt = buildPromptWithOCR(basePrompt, ocrText);

    // Call AI provider with image/PDF + OCR-enhanced prompt
    const selectedAiProvider = userSettings ? "openrouter" : "gemini";
    const selectedAiModel = userSettings?.openrouterModel || "gemini-2.5-flash";
    log.info({ storagePath, expenseType, aiProvider: selectedAiProvider, aiModel: selectedAiModel }, "expense_extract_ai_start");

    const aiResult = await generateContentFromPDF("gemini-2.5-flash", prompt, buffer, mimeType, schema, userSettings);
    const rawResponse = aiResult.text;

    log.info({ storagePath, expenseType, aiProvider: aiResult.provider, aiModel: aiResult.model, aiVendor: aiResult.vendor }, "expense_extract_ai_provider");
    log.info({ rawResponse: rawResponse.substring(0, 200) }, "expense_extract_raw");

    // Parse response
    let parsed: any;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (parseErr) {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) { parsed = JSON.parse(jsonMatch[0]); }
      else { throw new Error("Failed to parse Gemini response as JSON"); }
    }

    // Normalize amount (handle comma decimals)
    let amount: number | null = null;
    if (parsed.amount != null) {
      const amountStr = String(parsed.amount).replace(/[^\d,.-]/g, "").replace(",", ".");
      amount = parseFloat(amountStr);
      if (!Number.isFinite(amount) || amount <= 0) amount = null;
    }

    // Normalize currency
    const currency = typeof parsed.currency === "string" && parsed.currency.trim() ? parsed.currency.trim().toUpperCase() : "EUR";

    // Build result
    const result: any = { amount, currency, vendorName: parsed.vendorName || null, date: parsed.date || null };

    // Add fuel-specific fields
    if (expenseType === "fuel") {
      let quantity: number | null = null;
      if (parsed.quantity != null) { const qStr = String(parsed.quantity).replace(/[^\d,.-]/g, "").replace(",", "."); quantity = parseFloat(qStr); if (!Number.isFinite(quantity) || quantity <= 0) quantity = null; }
      let pricePerUnit: number | null = null;
      if (parsed.pricePerUnit != null) { const pStr = String(parsed.pricePerUnit).replace(/[^\d,.-]/g, "").replace(",", "."); pricePerUnit = parseFloat(pStr); if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) pricePerUnit = null; }
      if (amount && quantity && !pricePerUnit) pricePerUnit = Math.round((amount / quantity) * 1000) / 1000;
      result.quantity = quantity;
      result.unit = parsed.unit || (quantity ? "L" : null);
      result.pricePerUnit = pricePerUnit;
    } else {
      result.quantity = null; result.unit = null; result.pricePerUnit = null;
    }

    // Record AI usage
    await recordAiUsage(user.id, "expense", requestId);

    // Optionally create a project_document record if tripId or projectId provided
    if (tripId || projectId) {
      try {
        await supabaseAdmin.from("project_documents").insert({ user_id: user.id, project_id: projectId || null, trip_id: tripId || null, name: storagePath.split("/").pop() || "receipt.webp", storage_path: storagePath, type: expenseType, kind: "invoice" });
      } catch (dbErr) { log.warn({ err: dbErr }, "expense_extract_doc_insert_warning"); }
    }

    log.info({ amount: result.amount, expenseType, quantity: result.quantity }, "expense_extract_success");
    res.status(200).json(result);
  } catch (err: any) {
    log.error({ err }, "expense_extract_error");
    captureServerException(err, { extra: { requestId } });
    res.status(500).json({ error: err.message || "Extraction failed" });
  }
});

// ─── Main router ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  const path = (req.url || "").split("?")[0].replace(/\/$/, "");

  if (path === "/api/expenses/extract") return handleExtract(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found" }));
}
