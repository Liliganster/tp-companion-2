/**
 * Pipeline de extracción de callsheets — módulo COMPARTIDO (Fase 2).
 *
 * Antes vivía duplicado en api/worker.ts y api/callsheets.ts (/process),
 * sincronizado a mano: cada mejora había que portarla dos veces y ya causó
 * inconsistencias reales (el /process se quedó con OCR semanas después de
 * quitarlo del worker). Este módulo es la ÚNICA implementación del núcleo:
 *
 *   descarga → mime real → texto nativo del PDF → IA → validación →
 *   clasificador de etiquetas → filtros → fecha por código →
 *   callsheet_results → enlaces Maps/geocoding → callsheet_locations
 *
 * Lo que NO entra aquí (es de cada caller): claim del job, cuota, reintentos,
 * marcado done/failed, contabilidad de uso y las respuestas HTTP.
 */
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import { generateContentFromPDF } from "../../src/lib/ai/geminiClient.js";
import { buildUniversalExtractorPrompt } from "../../src/lib/ai/prompts.js";
import { extractionSchema } from "../../src/lib/ai/schema.js";
import { CallsheetExtractionResultSchema } from "../../src/lib/ai/validation.js";
import {
  buildCallsheetPdfHintText,
  normalizeExtractedCallsheetLocations,
  filterHallucinatedLocations,
  postProcessLocationsForGeocoding,
} from "./callsheetLocationHints.js";
import { classifyLabeledLocations } from "./callsheetLabels.js";
import { parsePdfWithTimeout } from "./pdf-parser.js";
import { resolveCallsheetDate } from "./callsheetDate.js";
import {
  extractMapsLinkCandidates,
  matchMapsLinkToLocation,
  resolveMapsLink,
} from "./callsheetMapsLinks.js";
import { geocodeAddressCached } from "./googleCache.js";
import { isImageCallsheetMime, resolveCallsheetMime } from "../../src/lib/callsheetMime.js";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB: evita timeouts y latencia de la IA

type LogLike = {
  info: (obj: any, msg?: string) => void;
  warn: (obj: any, msg?: string) => void;
  error: (obj: any, msg?: string) => void;
};

export type ExtractCallsheetArgs = {
  jobId: string;
  storagePath: string;
  /** Configuración OpenRouter del usuario (undefined → Gemini directo). */
  userSettings?: { openrouterEnabled?: boolean; openrouterApiKey?: string; openrouterModel?: string };
  /** Fecha de referencia para resolver el año (subida del documento). */
  referenceIso: string;
  /** Eval local: no llamar a Google (los enlaces Maps sí se resuelven, son gratis). */
  skipGeocode?: boolean;
  /** Worker asíncrono: comprobar cancelación antes de gastar la llamada de IA. */
  checkCancellation?: boolean;
  log: LogLike;
};

export type ExtractCallsheetOutcome =
  | { ok: true; cached: true }
  | {
      ok: true;
      cached?: false;
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
  const { jobId, storagePath, userSettings, referenceIso, skipGeocode = false, checkCancellation = false, log } = args;

  // Caché: si ya hay resultados de este job, no gastar otra llamada de IA.
  // (También protege al /process de reintentar un job interrumpido tras
  // guardar resultados: antes el insert duplicado lo hacía fallar.)
  const { data: existingResult, error: existingError } = await supabaseAdmin
    .from("callsheet_results")
    .select("job_id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (existingError) {
    log.warn({ jobId, existingError }, "callsheet_existing_result_check_failed");
  } else if (existingResult?.job_id) {
    log.info({ jobId }, "callsheet_job_cached_done");
    return { ok: true, cached: true };
  }

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
    return { ok: false, kind: "file_too_large", message: `file_too_large:${sizeMB}MB_exceeds_15MB_limit` };
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

  let pdfText = "";
  if (!isImageCallsheet) {
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
  const systemInstruction = buildUniversalExtractorPrompt(promptSource);

  // C. IA
  const aiStartTime = Date.now();
  const aiResult = await generateContentFromPDF(
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
    const message = `invalid_callsheet_extraction:${validated.error.issues.map((i) => i.message).join("; ")}`;
    log.warn({ jobId, reason: message }, "callsheet_extraction_invalid");
    return { ok: false, kind: "invalid_extraction", message };
  }

  // E. Contrato híbrido: el modelo devuelve {label, address}; el clasificador
  // separa rodaje (visible) de logística/descriptores (invisible, auditado
  // en callsheet_excluded_blocks — base del futuro multi-crew).
  const { filming, dropped } = classifyLabeledLocations(validated.data.locations as any);
  if (dropped.length > 0) {
    log.info({ jobId, dropped: dropped.map((d: any) => `${d.label}|${d.reason}`) }, "callsheet_labels_dropped");
    try {
      await supabaseAdmin.from("callsheet_excluded_blocks").insert(
        dropped.map((d: any) => ({ job_id: jobId, label: d.label || null, evidence_text: d.address, reason: d.reason })),
      );
    } catch {
      /* auditoría best-effort */
    }
  }
  const filmingAddresses = filming.map((f: any) => f.address);

  // Dirección corregida (Fase 2): el verbatim es la EVIDENCIA (evidence_text);
  // para geocodificar y mostrar se usa la corrección de erratas del modelo
  // ('Matiellistrasse' impreso → calle real), con guarda determinista: la
  // corrección debe conservar todos los números del verbatim (no puede
  // cambiar de sitio ni inventar portales).
  const correctedByAddress = new Map<string, string>();
  for (const f of filming as any[]) {
    const corrected = String(f?.addressCorrected ?? "").trim();
    if (!corrected || corrected === f.address) continue;
    const digits = String(f.address).match(/\d+/g) ?? [];
    if (digits.every((d) => corrected.includes(d))) correctedByAddress.set(f.address, corrected);
  }

  const normalizedAiLocations = normalizeExtractedCallsheetLocations({
    locations: filmingAddresses,
    pdfText,
  });
  // Evidence: etiqueta + dirección literales del documento
  const evidenceLocations = filming.map((f: any) => (f.label ? `${f.label}: ${f.address}` : f.address));
  const locationLabels = filming.map((f: any) => f.label);
  const extracted = {
    ...validated.data,
    locations: normalizedAiLocations.length > 0 ? normalizedAiLocations : filmingAddresses,
  };
  if (extracted.locations.length === 0) extracted.locations = ["No location found"];

  // F. Filtro de alucinaciones (valida contra el MISMO texto que vio la IA;
  // en imágenes/PDFs escaneados no hay texto → no descarta nada)
  const verifiedLocations = filterHallucinatedLocations({
    locations: extracted.locations,
    pdfText,
  });
  extracted.locations = verifiedLocations.length > 0 ? verifiedLocations : extracted.locations;
  log.info(
    { jobId, aiLocs: validated.data.locations.length, verified: verifiedLocations.length, final: extracted.locations.length },
    "callsheet_hallucination_filter",
  );

  // La versión de trabajo de cada localización: corregida si el modelo dio
  // una corrección válida; el verbatim queda en evidence_text.
  const displayLocations = extracted.locations.map((locStr) => correctedByAddress.get(locStr) ?? locStr);

  // Normalización por código para geocodificar (Bezirk, abreviaturas)
  const geocodingLocations = postProcessLocationsForGeocoding(displayLocations);

  // G. Fecha: el año lo decide el CÓDIGO si el documento no lo trae impreso
  const resolvedDate = resolveCallsheetDate({
    date: extracted.date,
    dateRaw: validated.data.dateRaw ?? null,
    dateYearInDocument: validated.data.dateYearInDocument ?? null,
    referenceIso,
  });
  if (resolvedDate !== extracted.date) {
    log.info({ jobId, aiDate: extracted.date, resolvedDate, dateRaw: validated.data.dateRaw }, "callsheet_date_year_resolved");
  }

  const { error: resultInsertError } = await supabaseAdmin.from("callsheet_results").insert({
    job_id: jobId,
    date_value: resolvedDate,
    project_value: extracted.projectName,
    producer_value: extracted.productionCompanies?.[0],
    date_evidence: validated.data.dateRaw ?? null,
  });
  if (resultInsertError) {
    log.error({ jobId, resultInsertError }, "callsheet_result_insert_failed");
    throw new Error(`Failed to insert result: ${resultInsertError.message}`);
  }

  // H. Enlaces de Google Maps del documento = fuente primaria (apuntan al
  // sitio conducible exacto y resolverlos es gratis); si no, geocoding con
  // caché + sesgo AT. Todo en paralelo.
  let geocodingDurationMs: number | null = null;
  const mapsLinkCandidates = extractMapsLinkCandidates(pdfText);
  const geoStartTime = Date.now();
  const geoResults = await Promise.all(
    geocodingLocations.map(async (locStr, index) => {
      const linkUrl = matchMapsLinkToLocation(extracted.locations[index] ?? locStr, mapsLinkCandidates, {
        totalLocations: extracted.locations.length,
      });
      if (linkUrl) {
        const resolved = await resolveMapsLink(linkUrl);
        if (resolved) {
          log.info({ jobId, locStr, linkUrl, label: resolved.label }, "callsheet_maps_link_resolved");
          return {
            formatted_address: resolved.label ?? locStr,
            lat: resolved.lat,
            lng: resolved.lng,
            place_id: null as string | null,
            quality: "maps_link",
          };
        }
      }
      return skipGeocode ? null : geocodeAddressCached(locStr);
    }),
  );
  geocodingDurationMs = Date.now() - geoStartTime;
  log.info({ jobId, locations: extracted.locations.length, durationMs: geocodingDurationMs }, "geocoding_completed");

  const locs = displayLocations.map((locStr, index) => {
    const geo = geoResults[index];
    return {
      job_id: jobId,
      name_raw: /\d/.test(locStr) ? null : locStr,
      address_raw: locStr,
      label_source: locationLabels[index] || "EXTRACTED",
      evidence_text: evidenceLocations[index] ?? extracted.locations[index] ?? locStr,
      formatted_address: geo?.formatted_address ?? null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      place_id: geo?.place_id ?? null,
      geocode_quality: geo?.quality ?? null,
    };
  });

  if (locs.length > 0) {
    const { error: locsInsertError } = await supabaseAdmin.from("callsheet_locations").insert(locs);
    if (locsInsertError) {
      log.error({ jobId, locsInsertError }, "callsheet_locations_insert_failed");
      throw new Error(`Failed to insert locations: ${locsInsertError.message}`);
    }
    log.info({ jobId, locations: locs.length }, "callsheet_locations_saved");
  }

  return {
    ok: true,
    date: resolvedDate,
    projectName: extracted.projectName,
    locations: displayLocations,
    aiProvider: aiResult.provider,
    aiModel: aiResult.model,
    aiVendor: aiResult.vendor,
    aiDurationMs,
    geocodingDurationMs,
    locationsCount: extracted.locations.length,
  };
}
