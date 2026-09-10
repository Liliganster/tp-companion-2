import { containsEvidence, hasDocumentEvidence } from './callsheetEvidence.js';
type Candidate = { label?: string; address?: string; dayScope?: string; dayDate?: string; dayEvidence?: string };
const OTHER_DAY = /\b(next\s+(?:shooting\s+)?day|tomorrow|previous\s+day|yesterday|n[aä]chster\s+drehtag|folgetag|gestern|pr[oó]ximo\s+d[ií]a|siguiente\s+d[ií]a|d[ií]a\s+anterior|ayer)\b/i;

/** A missing/ambiguous day is not permission to put a location into today's route. */
export function selectDocumentDayLocations<T extends Candidate>(locations: T[], documentDate: string, sourceText: string) {
  const accepted: T[] = [];
  const excluded: Array<T & { reason: string }> = [];
  for (const location of locations) {
    const evidence = String(location.dayEvidence ?? '').trim();
    let reason = '';
    if (location.dayScope !== 'document_day') reason = location.dayScope === 'other_day' ? 'other_shooting_day' : 'shooting_day_uncertain';
    else if (location.dayDate && location.dayDate !== documentDate) reason = 'different_shooting_date';
    else if (!evidence || OTHER_DAY.test(evidence) || OTHER_DAY.test(location.label ?? '')) reason = 'shooting_day_evidence_invalid';
    else if (!containsEvidence(evidence, location.address ?? '')) reason = 'shooting_day_address_evidence_missing';
    else if (sourceText.trim() && !hasDocumentEvidence(sourceText, evidence, location.address ?? '')) reason = 'shooting_day_evidence_not_in_source';
    if (reason) excluded.push({ ...location, reason });
    else accepted.push(location);
  }
  return { accepted, excluded };
}
