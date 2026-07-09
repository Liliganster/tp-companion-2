/**
 * Red de seguridad por etiquetas — Fase 2 del PLAN.md (versión HÍBRIDA).
 *
 * El prompt sigue pidiendo SOLO lugares de rodaje (encuadre que funciona:
 * R100/P92 medido), pero ahora cada localización llega con su etiqueta
 * literal. Este módulo descarta las fugas evidentes de logística (BASIS,
 * PARKEN, CATERING… que a veces se cuelan, p. ej. en la dispo de REX) y
 * deduplica. Ante etiqueta desconocida o vacía se CONSERVA: el recall manda
 * y el usuario revisa en la UI.
 *
 * Regla de la propietaria (2026-07-09): meeting point/Parkplatz son logística.
 * Nota v2: las etiquetas descartadas quedan auditadas — en el futuro pueden
 * usarse para ofrecer parking/catering como datos adicionales del viaje.
 */
import type { LabeledLocation } from "../../src/lib/ai/validation.js";

const LOGISTICS_LABEL_RE =
  /\b(basis|base(?:camp)?|unit\s*base|park(?:en|ing|platz)|treffpunkt|sammelpunkt|meeting\s*point|catering|lunch|fr[uü]hst[uü]ck|breakfast|mittag|dinner|maske|make\s*-?\s*up|hmu|garderobe|wardrobe|kost[uü]m|produktions?\s*b[uü]ro|production\s*office|office|b[uü]ro|load|laderampe|anlieferung|hospital|krankenhaus|arzt|medic|unterkunft|technik|stellpl[aä]tze?|honeywagon|toiletten|wc|[oö]ffis?|e-?tankstelle)\b/i;

export type ClassifiedLocations = {
  /** Localizaciones de rodaje, en el orden del documento. */
  filming: LabeledLocation[];
  /** Descartes con su motivo (auditables). */
  dropped: Array<LabeledLocation & { reason: string }>;
};

export function classifyLabeledLocations(items: LabeledLocation[]): ClassifiedLocations {
  const filming: LabeledLocation[] = [];
  const dropped: Array<LabeledLocation & { reason: string }> = [];
  const seenAddresses = new Set<string>();

  for (const item of items ?? []) {
    const label = String(item?.label ?? "").trim();
    const address = String(item?.address ?? "").trim();
    if (!address) continue;

    // Normalizado sin diacríticos: el  de JS no entiende Ö/Ü (p. ej. "ÖFFIS").
    const labelAscii = label.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (LOGISTICS_LABEL_RE.test(labelAscii)) {
      dropped.push({ label, address, reason: `logistics_label:${label}` });
      continue;
    }

    // Nombre de escena sin dirección: sin dígitos, sin comas y sin palabras
    // de calle ("WEINBERGE - NÄHE HAUS MAX", "Tennisplatz"). Una esquina real
    // como "Lichtenfelsgasse Ecke Rathausplatz" se conserva por gasse/Ecke.
    const addressAscii = address.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const STREETISH_RE = /(gasse|stra(?:ss|ß)e|str|str\.|allee|ring|weg|ecke|markt|ufer|kai|zeile|l(?:ae|a)nde|chaussee|damm|promenade)/;
    if (!/\d/.test(address) && !address.includes(",") && !STREETISH_RE.test(addressAscii)) {
      dropped.push({ label, address, reason: "scene_descriptor_no_address" });
      continue;
    }

    const key = address
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (seenAddresses.has(key)) {
      dropped.push({ label, address, reason: "duplicate_address" });
      continue;
    }
    seenAddresses.add(key);
    // addressCorrected (errata corregida por el modelo) viaja con la entrada;
    // la guarda de aceptación vive en el pipeline (callsheetExtraction.ts).
    const addressCorrected = String((item as any)?.addressCorrected ?? "").trim();
    filming.push(addressCorrected ? { label, address, addressCorrected } : { label, address });
  }

  return { filming, dropped };
}
