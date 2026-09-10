/** Separate explicit logistics and deduplicate without imposing an address
 * format. Physical venue names are valid; context is supplied by the model. */
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
    const filmingLabel = /\b(motiv|set|location|drehor(?:t|te)|film(?:ing)?\s*location|locaci[oó]n|rodaje)\b/i.test(labelAscii);
    if (!filmingLabel && LOGISTICS_LABEL_RE.test(labelAscii)) {
      dropped.push({ label, address, reason: `logistics_label:${label}` });
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
