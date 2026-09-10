import { selectCallsheetLocations } from './callsheetSelection.js';
import { normalizeCallsheetAddress } from '../../src/lib/callsheetAddress.js';
/**
 * Pipeline de extracción de callsheets — módulo COMPARTIDO (Fase 2).
 *
 * Antes vivía duplicado en api/worker.ts y api/callsheets.ts (/process),
 * sincronizado a mano: cada mejora había que portarla dos veces y ya causó
 * inconsistencias reales (el /process se quedó con OCR semanas después de
 * quitarlo del worker). Este módulo es la ÚNICA implementación del núcleo:
 *
 *   descarga → mime real → texto nativo del PDF → IA → validación →
 *   fecha documentada → selección contextual única → guardado atómico de
 *   resultado, bloques, orden, estado y consumo de la reserva de cuota.
 *
 * Cada caller adquiere la reserva y maneja fallos técnicos y respuestas HTTP.
 * El cálculo opcional de distancia ocurre después, sin alterar las locaciones.
 */
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { assertStorageOwnership } from "./storageOwnership.js";
import { generateContent, generateContentFromPDF } from "../../src/lib/ai/geminiClient.js";
import { callsheetDocumentText } from './callsheetDocumentText.js';
import { MAX_DOCUMENT_BYTES } from '../../src/lib/importDocuments.js';
import { buildUniversalExtractorPrompt } from "../../src/lib/ai/prompts.js";
import { extractionSchema } from "../../src/lib/ai/schema.js";
import { CallsheetExtractionResultSchema, describeCallsheetValidationError } from "../../src/lib/ai/validation.js";
import { buildCallsheetPdfHintText } from './callsheetLocationHints.js';
import { parsePdfWithTimeout } from './pdf-parser.js';
import { resolveCallsheetDate } from './callsheetDate.js';
import { isImageCallsheetMime, resolveCallsheetMime } from "../../src/lib/callsheetMime.js";

const MAX_FILE_SIZE_BYTES = MAX_DOCUMENT_BYTES;

type LogLike = {
  info: (obj: any, msg?: string) => void;
  warn: (obj: any, msg?: string) => void;
  error: (obj: any, msg?: string) => void;
};

export type ExtractCallsheetArgs = {
  userId: string;
  requestId: string;
  attemptId: string;
  jobId: string;
  storagePath: string;
  /** Configuración OpenRouter del usuario (undefined → Gemini directo). */
  userSettings?: { openrouterEnabled?: boolean; openrouterApiKey?: string; openrouterModel?: string };
  /** Legacy caller compatibility; never used to determine the shooting date. */
  referenceIso: string;
  /** Legacy eval compatibility; extraction never calls geocoding. */
  skipGeocode?: boolean;
  /** Worker asíncrono: comprobar cancelación antes de gastar la llamada de IA. */
  checkCancellation?: boolean;
  log: LogLike;
};

export type ExtractCallsheetOutcome =
  | { ok: true; cached: true; status: 'done' | 'needs_review' }
  | {
      ok: true;
      cached?: false;
      status: 'done' | 'needs_review';
      reviewReason: string | null;
      date: string;
      projectName: string;
      locations: string[];
      aiProvider: string;
      aiModel: string;
      aiVendor: string | null;
      aiDurationMs: number;
      geocodingDurationMs: number | null;
      locationsCount: number;
    }
  | { ok: false; kind: "download_failed" | "file_too_large" | "cancelled" | "invalid_extraction"; message: string };

export async function extractCallsheet(args: ExtractCallsheetArgs): Promise<ExtractCallsheetOutcome> {
  const { jobId, storagePath, userSettings, checkCancellation = false, log } = args;

  await assertStorageOwnership(args.userId, "callsheets", storagePath);

  // Only a versioned, atomically saved result is a complete cache entry.
  const { data: cached, error: cacheError } = await supabaseAdmin.from('callsheet_results')
    .select('extraction_state, extraction_request_id').eq('job_id', jobId).maybeSingle();
  if (cacheError) throw new Error(`Cannot inspect extraction cache: ${cacheError.message}`);
  if (cached?.extraction_state && cached.extraction_request_id === args.requestId) return { ok: true, cached: true, status: cached.extraction_state };

  // A. Descargar el documento
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("callsheets")
    .download(storagePath);
  if (downloadError || !fileData) {
    log.error({ jobId, downloadError }, "callsheet_download_error");
    return { ok: false, kind: "download_failed", message: downloadError?.message ?? "no data returned" };
  }
  log.info({ jobId, bytes: fileData.size }, "callsheet_downloaded");

  if (fileData.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = Math.round(fileData.size / 1024 / 1024);
    return { ok: false, kind: "file_too_large", message: `El archivo (${sizeMB} MB) supera los 50 MB por archivo.` };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());

  if (checkCancellation) {
    const { data: preAiJob } = await supabaseAdmin
      .from("callsheet_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();
    if (String((preAiJob as any)?.status ?? "") === "cancelled") {
      log.info({ jobId }, "callsheet_job_cancelled_pre_ai");
      return { ok: false, kind: "cancelled", message: "cancelled" };
    }
  }

  // B. Mime real por la extensión de storage (las dispos también llegan como
  // foto de WhatsApp) y texto nativo del PDF completo (sin OCR/Tesseract).
  const mimeType = resolveCallsheetMime(storagePath);
  const isImageCallsheet = isImageCallsheetMime(mimeType);
  const documentText = await callsheetDocumentText(buffer, storagePath);

  let pdfText = documentText ?? "";
  if (!isImageCallsheet && documentText === null) {
    const textStartTime = Date.now();
    try {
      const parsed = await parsePdfWithTimeout(buffer, 10_000);
      pdfText = String(parsed?.text ?? "");
    } catch (textErr) {
      log.warn({ jobId, err: textErr }, "callsheet_pdf_text_unavailable");
    }
    log.info(
      { jobId, textChars: pdfText.length, textDurationMs: Date.now() - textStartTime },
      "callsheet_pdf_text_extracted",
    );
  }

  const pdfHintText = buildCallsheetPdfHintText(pdfText);
  const attachedTag = isImageCallsheet ? "[IMAGE ATTACHED]" : "[PDF ATTACHED]";
  const promptSource = pdfHintText
    ? `${attachedTag}\n\nDOCUMENT TEXT EXCERPT (use for projectName/date/company):\n${pdfHintText}`
    : attachedTag;
  const systemInstruction = buildUniversalExtractorPrompt(documentText === null ? promptSource : documentText);

  // C. IA
  const aiStartTime = Date.now();
  const aiResult = documentText !== null ? await generateContent('gemini-2.5-flash', systemInstruction, extractionSchema, userSettings) : await generateContentFromPDF(
    "gemini-2.5-flash",
    systemInstruction,
    buffer,
    mimeType,
    extractionSchema,
    userSettings,
  );
  const aiDurationMs = Date.now() - aiStartTime;
  log.info(
    {
      jobId,
      aiProvider: aiResult.provider,
      aiModel: aiResult.model,
      aiVendor: aiResult.vendor,
      length: aiResult.text?.length || 0,
      durationMs: aiDurationMs,
    },
    "callsheet_ai_response",
  );

  // D. Parseo y validación
  let extractedJson: any = null;
  try {
    extractedJson = JSON.parse(aiResult.text);
  } catch {
    extractedJson = JSON.parse(aiResult.text.replace(/```json|```/g, "").trim());
  }
  if (!extractedJson) return { ok: false, kind: "invalid_extraction", message: "Empty extraction result" };

  const validated = CallsheetExtractionResultSchema.safeParse(extractedJson);
  if (!validated.success) {
    const message = describeCallsheetValidationError(validated.error);
    log.warn({ jobId, issues: validated.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code, message: issue.message })) }, "callsheet_extraction_invalid");
    return { ok: false, kind: "invalid_extraction", message };
  }

  const resolvedDate = resolveCallsheetDate({
    date: validated.data.date, dateRaw: validated.data.dateRaw,
    dateYearInDocument: validated.data.dateYearInDocument,
  });
  const selection = selectCallsheetLocations(validated.data, resolvedDate, pdfText);
  const status = selection.reviewReasons.length ? 'needs_review' : 'done';
  const reviewReason = selection.reviewReasons.join(' ') || null;
  const locs = selection.filming.map(location => ({
    address_raw: location.address, name_raw: null,
    formatted_address: normalizeCallsheetAddress(location.normalizedAddress ?? location.address),
    label_source: location.label, position: location.position,
    selection_state: location.selection_state, review_reason: location.review_reason,
    evidence_text: `${location.label}: ${location.address}`,
  }));
  // Geocoding is optional route enrichment in the client. It cannot delay,
  // replace, or invalidate the extraction, nor cross-associate Maps blocks.
  // The RPC checks the active request/attempt and commits result + ordered
  // locations + audit + quota + terminal state as one transaction.
  const { error: saveError, data: saved } = await supabaseAdmin.rpc('save_callsheet_extraction', {
    p_user_id: args.userId, p_job_id: jobId,
    p_request_id: args.requestId, p_attempt_id: args.attemptId,
    p_result: {
      date_value: resolvedDate || null, date_evidence: validated.data.dateRaw ?? null,
      project_value: validated.data.projectName,
      producer_value: validated.data.productionCompanies[0] ?? null,
      extraction_state: status, review_reason: reviewReason,
      model_output: extractedJson,
    },
    p_locations: locs, p_excluded: selection.excluded,
  });
  if (saveError) throw new Error(`Atomic extraction save failed: ${saveError.message}`);
  if (saved !== true) throw new Error('Atomic extraction save was not confirmed');
  log.info({ jobId, status, retained: locs.length, excluded: selection.excluded.length }, 'callsheet_committed');
  return {
    ok: true, status, reviewReason, date: resolvedDate,
    projectName: validated.data.projectName, locations: locs.map(l => l.formatted_address).filter(Boolean),
    aiProvider: aiResult.provider, aiModel: aiResult.model, aiVendor: aiResult.vendor,
    aiDurationMs, geocodingDurationMs: null, locationsCount: locs.length,
  };
}
