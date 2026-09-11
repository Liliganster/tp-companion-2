import { selectCallsheetLocations } from './callsheetSelection.js';
import { normalizeCallsheetAddress } from '../../src/lib/callsheetAddress.js';
import { createHash } from 'node:crypto';
import { CALLSHEET_PROFILE_VERSION, CALLSHEET_MODEL, CALLSHEET_GENERATION_OPTIONS } from '../../src/lib/ai/callsheetProfile.js';
/**
 * Pipeline de extracción de callsheets — módulo COMPARTIDO (Fase 2).
 *
 * Antes vivía duplicado en api/worker.ts y api/callsheets.ts (/process),
 * sincronizado a mano: cada mejora había que portarla dos veces y ya causó
 * inconsistencias reales (el /process se quedó con OCR semanas después de
 * quitarlo del worker). Este módulo es la ÚNICA implementación del núcleo:
 *
 *   descarga → mime real → PDF completo a IA → validación tolerante →
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

  // B. Text formats are decoded locally; PDFs and photos go intact to vision.
  const mimeType = resolveCallsheetMime(storagePath);
  const isImageCallsheet = isImageCallsheetMime(mimeType);
  const documentText = await callsheetDocumentText(buffer, storagePath);

  const pdfText = documentText ?? "";
  // The multimodal provider reads every page. A second sequential PDF parse
  // added up to 10 seconds, and its excerpt could lose first-page context.
  const attachedTag = isImageCallsheet ? "[IMAGE ATTACHED]" : "[PDF ATTACHED]";
  const promptSource = attachedTag;
  const systemInstruction = buildUniversalExtractorPrompt(documentText === null ? promptSource : documentText);

  // C. IA
  const aiStartTime = Date.now();
  const options = CALLSHEET_GENERATION_OPTIONS;
  const diagnostics = {
    profile: CALLSHEET_PROFILE_VERSION, fileHash: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length, mimeType, inputMode: documentText === null ? 'multimodal' : 'text',
    promptChars: systemInstruction.length, schemaChars: JSON.stringify(extractionSchema).length,
    limits: options, provider: userSettings?.openrouterEnabled ? 'openrouter' : 'gemini',
  };
  log.info({ jobId, ...diagnostics }, 'callsheet_ai_started');
  const aiResult = await (documentText !== null ? generateContent(CALLSHEET_MODEL, systemInstruction, extractionSchema, userSettings, options) : generateContentFromPDF(
    CALLSHEET_MODEL,
    systemInstruction,
    buffer,
    mimeType,
    extractionSchema,
    userSettings,
    options,
  )).catch(error => {
    log.error({ jobId, ...diagnostics, durationMs: Date.now() - aiStartTime, error: error instanceof Error ? error.message : String(error) }, 'callsheet_ai_failed');
    throw error;
  });
  const aiDurationMs = Date.now() - aiStartTime;
  log.info(
    {
      jobId,
      aiProvider: aiResult.provider,
      aiModel: aiResult.model,
      aiVendor: aiResult.vendor,
      length: aiResult.text?.length || 0,
      durationMs: aiDurationMs, usage: aiResult.usage ?? null, finishReason: aiResult.finishReason ?? null, profile: CALLSHEET_PROFILE_VERSION,
    },
    "callsheet_ai_response",
  );

  if (aiResult.finishReason && !['STOP', 'stop'].includes(aiResult.finishReason)) {
    return { ok: false, kind: 'invalid_extraction', message: ['MAX_TOKENS', 'length'].includes(aiResult.finishReason)
      ? 'La IA alcanzó el límite de generación sin completar el documento. No se ha guardado una extracción parcial ni se reintentará automáticamente.'
      : `La IA no completó la extracción (${aiResult.finishReason}). El original se conserva.` };
  }

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
  const currentData = { ...validated.data, locations: validated.data.locations.map(location => ({
    ...location, normalizedAddress: 'normalizedAddress' in location ? location.normalizedAddress ?? '' : '',
  })) };
  const selection = selectCallsheetLocations(currentData, resolvedDate, pdfText);
  const status = selection.reviewReasons.length ? 'needs_review' : 'done';
  const pendingLocations = selection.filming.filter(location => location.selection_state === 'candidate').length;
  const reviewReason = [...selection.documentReviewReasons,
    ...(pendingLocations ? [`Hay ${pendingLocations} locaciones pendientes de confirmar; revisa el motivo indicado en cada una.`] : []),
  ].join(' ') || null;
  const locs = selection.filming.map(location => ({
    address_raw: location.address, name_raw: null,
    formatted_address: normalizeCallsheetAddress(location.normalizedAddress ?? location.address),
    label_source: location.label, position: location.position,
    selection_state: location.selection_state, review_reason: location.review_reason,
    evidence_text: [ `${location.label}: ${location.address}`, location.siteEvidence ].filter(Boolean).join('\n'),
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
      // An absent title is not a conflicting title. NULL also prevents the
      // database mismatch trigger comparing a placeholder to a chosen project.
      project_value: validated.data.projectName === 'Untitled Project' ? null : validated.data.projectName,
      producer_value: validated.data.productionCompanies[0] ?? null,
      extraction_state: status, review_reason: reviewReason,
      model_output: { ...extractedJson, _diagnostics: { ...diagnostics, durationMs: aiDurationMs, model: aiResult.model, usage: aiResult.usage ?? null, finishReason: aiResult.finishReason ?? null } },
    },
    p_locations: locs, p_excluded: selection.excluded,
  });
  if (saveError) throw new Error(`Atomic extraction save failed: ${saveError.message}`);
  if (saved !== true) throw new Error('Atomic extraction save was not confirmed');
  const { data: persisted, error: stateError } = await supabaseAdmin.from('callsheet_results')
    .select('extraction_state, review_reason').eq('job_id', jobId).maybeSingle();
  if (stateError || !persisted?.extraction_state) throw new Error('No se pudo verificar el estado guardado de la extracción.');
  const finalStatus = persisted.extraction_state as 'done' | 'needs_review';
  const finalReviewReason = persisted.review_reason ?? null;
  log.info({ jobId, status: finalStatus, retained: locs.length, excluded: selection.excluded.length }, 'callsheet_committed');
  return {
    ok: true, status: finalStatus, reviewReason: finalReviewReason, date: resolvedDate,
    projectName: validated.data.projectName, locations: locs.map(l => l.formatted_address).filter(Boolean),
    aiProvider: aiResult.provider, aiModel: aiResult.model, aiVendor: aiResult.vendor,
    aiDurationMs, geocodingDurationMs: null, locationsCount: locs.length,
  };
}
