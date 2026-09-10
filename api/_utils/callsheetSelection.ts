import type { CallsheetExtractionResult } from '../../src/lib/ai/validation.js';
import { classifyLabeledLocations } from './callsheetLabels.js';
import { containsEvidence } from './callsheetEvidence.js';

/** One selection decision per block. Evidence supports review, never an
 * all-or-nothing gate requiring the date, unit and address in one quote. */
export function selectCallsheetLocations(data: CallsheetExtractionResult, date: string, source: string) {
  const excluded: Array<{ label: string; address: string; reason: string }> = [];
  const candidates: CallsheetExtractionResult['locations'] = [];
  const reviewReasons: string[] = [];
  if (!date) reviewReasons.push('Falta confirmar la fecha de rodaje.');
  for (const location of data.locations) {
    const label = location.label ?? '';
    const address = location.address ?? '';
    const dayScope = 'dayScope' in location ? location.dayScope : undefined;
    const dayDate = 'dayDate' in location ? location.dayDate : undefined;
    const unitScope = 'unitScope' in location ? location.unitScope : undefined;
    let reason = '';
    if (dayScope === 'other_day' || (date && dayDate && dayDate !== date)) reason = 'other_shooting_day';
    else if (data.documentUnit === 'other_unit' || unitScope === 'other_unit') reason = 'other_filming_unit';
    const classified = classifyLabeledLocations([{ ...location, label, address }]);
    if (!reason && classified.dropped.length) reason = classified.dropped[0].reason;
    if (reason) { excluded.push({ label, address, reason }); continue; }
    if (!address) { reviewReasons.push('Una locación no tiene dirección o nombre; comprueba el original.'); continue; }
    candidates.push(location);
    if (dayScope === 'uncertain' || unitScope === 'uncertain' || data.documentUnit === 'uncertain' ||
        (data.documentUnit === 'mixed' && (!unitScope || unitScope === 'unspecified'))) {
      reviewReasons.push(`Confirma el día o la unidad de: ${address}`);
    }
    // PDF text can be incomplete or ordered differently from the visual page.
    // Preserve a candidate instead of treating imperfect text matching as failure.
    if (source.trim() && !containsEvidence(source, address)) reviewReasons.push(`Contrasta con el original: ${address}`);
  }
  const classified = classifyLabeledLocations(candidates.map(location => ({ ...location, label: location.label ?? '', address: location.address ?? '' })));
  excluded.push(...classified.dropped);
  if (!classified.filming.length) reviewReasons.push('No se identificaron locaciones de filmación; completa los datos desde el original.');
  return { filming: classified.filming, excluded, reviewReasons: [...new Set(reviewReasons)], candidates };
}
