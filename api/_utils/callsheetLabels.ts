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

export function classifyLocationRole(item: LabeledLocation): 'filming' | 'logistics' | 'other' | 'uncertain' {
  if (item.role) return item.role;
  const label = item.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Compatibility for older provider responses. Unknown labels need context,
  // never automatic admission. A logistics heading containing "set" is not a set.
  if (/^(motiv|set|locations?|loc\.?|drehorte?|filming\s+location|locacion|rodaje)\b/i.test(label.trim())) return 'filming';
  return LOGISTICS_LABEL_RE.test(label) ? 'logistics' : 'uncertain';
}

export function classifyLabeledLocations(items: LabeledLocation[]): ClassifiedLocations {
  const filming: LabeledLocation[] = [];
  const dropped: Array<LabeledLocation & { reason: string }> = [];
  for (const item of items ?? []) {
    const role = classifyLocationRole(item);
    if (role === 'filming') filming.push(item);
    else dropped.push({ ...item, reason: role === 'logistics' ? `logistics_label:${item.label}` : `${role}_block` });
  }
  return { filming, dropped };
}
