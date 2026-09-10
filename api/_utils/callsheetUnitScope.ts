import { containsEvidence, hasDocumentEvidence } from './callsheetEvidence.js';
type Candidate = { label?: string; address?: string; dayEvidence?: string; unitScope?: string; unitEvidence?: string };
const OTHER_UNIT = /\b(?:(?:second|2nd|2\.?|ii|b)[\s-]+unit|unit[\s-]+(?:2|ii|b)|segunda[\s-]+unidad|(?:zweite|2\.?)[\s-]+(?:dreh)?einheit)\b/i;
const MAIN_UNIT = /\b(?:(?:main|first|1st|1\.?|a)[\s-]+unit|unit[\s-]+(?:1|a)|(?:primera|principal)[\s-]+unidad|unidad[\s-]+principal|(?:erste|1\.?)[\s-]+(?:dreh)?einheit|haupt(?:dreh)?einheit)\b/i;
const unitContext = (location: Candidate) => {
  const text = `${location.label ?? ''}\n${location.dayEvidence ?? ''}\n${location.unitEvidence ?? ''}`;
  // Building addresses such as "Unit 2, Studio Road" are not filming units.
  return location.address ? text.split(location.address).join('') : text;
};

export function selectMainUnitLocations<T extends Candidate>(locations: T[], documentUnit: string, sourceText: string) {
  const accepted: T[] = [];
  const excluded: Array<T & { reason: string }> = [];
  const scopedText = locations.map(unitContext).join('\n');
  // A governing header may have been omitted from the model's quoted evidence.
  // Treat unassigned blocks as ambiguous when the source has an explicit unit heading.
  const otherHeading = new RegExp(`^\\s*${OTHER_UNIT.source}\\s*(?:$|[:|/–—-]|call\\s*sheet|dispo|tagesdispo|drehplan)`, 'i');
  const sourceHasOtherHeading = sourceText.split(/\r?\n/).some(line => otherHeading.test(line));
  const mixed = documentUnit === 'mixed' || OTHER_UNIT.test(scopedText) || sourceHasOtherHeading;
  for (const location of locations) {
    const scope = location.unitScope ?? 'unspecified';
    const evidence = location.unitEvidence?.trim() ?? '';
    const context = unitContext(location);
    let reason = '';
    if (documentUnit === 'other_unit' || scope === 'other_unit' || OTHER_UNIT.test(context)) reason = 'other_filming_unit';
    else if (documentUnit === 'uncertain' || scope === 'uncertain') reason = 'filming_unit_uncertain';
    else if (scope === 'main_unit') {
      if (!MAIN_UNIT.test(evidence) || !containsEvidence(evidence, location.address ?? '') || (sourceText.trim() && !hasDocumentEvidence(sourceText, evidence, location.address ?? ''))) reason = 'filming_unit_evidence_invalid';
    } else if (scope !== 'unspecified' || mixed) reason = 'filming_unit_uncertain';
    if (reason) excluded.push({ ...location, reason });
    else accepted.push(location);
  }
  return { accepted, excluded };
}
