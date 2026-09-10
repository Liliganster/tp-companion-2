import type { CallsheetExtractionResult } from '../../src/lib/ai/validation.js';
import { classifyLocationRole } from './callsheetLabels.js';
import { callsheetAddressKey } from '../../src/lib/callsheetAddress.js';

/** One contextual decision per block. Text matching is not a gate: PDF text
 * order and OCR omissions cannot establish that a visually read set is wrong. */
export function selectCallsheetLocations(data: CallsheetExtractionResult, date: string, _source: string) {
  const excluded: Array<{ label: string; address: string; reason: string }> = [];
  const filming: Array<{ label: string; address: string; normalizedAddress?: string; position: number; selection_state: 'confirmed' | 'candidate'; review_reason: string | null }> = [];
  const reviewReasons: string[] = [];
  if (!date) reviewReasons.push('Confirma la fecha completa de rodaje de la primera página; falta o es inválida, incluido el año.');
  data.locations.forEach((location, position) => {
    const label = location.label ?? '';
    const address = location.address ?? '';
    const normalizedAddress = 'normalizedAddress' in location ? location.normalizedAddress : undefined;
    const day = 'dayScope' in location ? location.dayScope : undefined;
    const unit = 'unitScope' in location ? location.unitScope : undefined;
    const dayDate = 'dayDate' in location ? location.dayDate : undefined;
    const role = classifyLocationRole({ ...location, label, address });
    let excludedReason = '';
    if (day === 'other_day' || (date && dayDate && date !== dayDate)) excludedReason = 'other_shooting_day';
    else if (data.documentUnit === 'other_unit' || unit === 'other_unit') excludedReason = 'other_filming_unit';
    else if (role === 'logistics' || role === 'other') excludedReason = `${role}_block`;
    if (excludedReason) { excluded.push({ label, address, reason: excludedReason }); return; }
    const reasons: string[] = [];
    if (role === 'uncertain') reasons.push(('reviewReason' in location && location.reviewReason) || 'Confirma si el bloque identifica un set físico de filmación.');
    if (!address.trim()) reasons.push('Falta el nombre o dirección del set.');
    if (normalizedAddress === '') reasons.push('Falta resolver la dirección postal del lugar; confirma la calle y el número.');
    if (!date) reasons.push('Falta confirmar la fecha completa de rodaje.');
    if (day === 'uncertain') reasons.push('Confirma a qué día de rodaje pertenece el set.');
    if (unit === 'uncertain' || data.documentUnit === 'uncertain' || (data.documentUnit === 'mixed' && (!unit || unit === 'unspecified'))) reasons.push('Confirma a qué unidad pertenece el set.');
    const reason = reasons.length ? `${label || 'Bloque'} ${address}: ${reasons.join(' ')}` : null;
    const duplicate = address.trim() && filming.find(item =>
      item.label.trim().toLowerCase() === label.trim().toLowerCase() &&
      callsheetAddressKey(item.normalizedAddress || item.address) === callsheetAddressKey(normalizedAddress || address) &&
      item.selection_state === (reason ? 'candidate' : 'confirmed'));
    if (duplicate) {
      excluded.push({ label, address, reason: 'duplicate_filming_destination' });
      return;
    }
    if (reason) reviewReasons.push(reason);
    filming.push({ label, address, normalizedAddress, position, selection_state: reason ? 'candidate' : 'confirmed', review_reason: reason });
  });
  if (!filming.length) reviewReasons.push('No hay sets físicos de la fecha y unidad seleccionadas; comprueba el original.');
  return { filming, excluded, reviewReasons: [...new Set(reviewReasons)], candidates: filming };
}
