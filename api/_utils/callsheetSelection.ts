import type { CallsheetExtractionResult } from '../../src/lib/ai/validation.js';
import { classifyLocationRole } from './callsheetLabels.js';
import { callsheetAddressKey } from '../../src/lib/callsheetAddress.js';
import { resolveCallsheetDate } from './callsheetDate.js';

/** One contextual decision per block. Text matching is not a gate: PDF text
 * order and OCR omissions cannot establish that a visually read set is wrong. */
export function selectCallsheetLocations(data: CallsheetExtractionResult, date: string, _source: string) {
  const excluded: Array<{ label: string; address: string; reason: string }> = [];
  const filming: Array<{ label: string; address: string; normalizedAddress?: string; siteEvidence?: string; position: number; selection_state: 'confirmed' | 'candidate'; review_reason: string | null }> = [];
  const documentReviewReasons: string[] = [];
  if (data.documentReviewReason && data.documentReviewScope !== 'metadata' && !(data.documentReviewScope === 'date' && !date)) documentReviewReasons.push(data.documentReviewReason);
  if (!date) documentReviewReasons.push('Confirma la fecha completa de rodaje; falta o es ambigua, incluido el año.');
  const reviewReasons = [...documentReviewReasons];
  data.locations.forEach((location, position) => {
    const label = location.label ?? '';
    const address = location.address ?? '';
    const addressRelation = 'addressRelation' in location ? location.addressRelation : undefined;
    // Preserve provider evidence, but an access address must never become a set
    // address merely because it has a plausible postal format.
    const normalizedAddress = addressRelation === 'access_only' || addressRelation === 'unresolved'
      ? '' : 'normalizedAddress' in location ? location.normalizedAddress : undefined;
    const siteEvidence = 'siteEvidence' in location ? location.siteEvidence : '';
    const day = 'dayScope' in location ? location.dayScope : undefined;
    const unit = 'unitScope' in location ? location.unitScope : undefined;
    const dayDateRaw = 'dayDate' in location ? location.dayDate : undefined;
    const dayDate = dayDateRaw ? resolveCallsheetDate({date:dayDateRaw,dateRaw:dayDateRaw,dateYearInDocument:true}) : '';
    const locationKind = 'locationKind' in location ? location.locationKind : undefined;
    const contextConflict = 'reviewReason' in location ? location.reviewReason : '';
    const role = classifyLocationRole({ ...location, label, address });
    let excludedReason = '';
    if (locationKind === 'internal_marker' && !normalizedAddress && !contextConflict) excludedReason = 'internal_site_marker';
    else if (locationKind === 'mobile_scene' && !normalizedAddress) excludedReason = 'mobile_scene_without_destination';
    else if (day === 'other_day' || (date && dayDate && date !== dayDate)) excludedReason = 'other_shooting_day';
    else if ((data.documentUnit === 'other_unit' && unit === 'main_unit') || (data.documentUnit !== 'other_unit' && unit === 'other_unit')) excludedReason = 'other_filming_unit';
    else if (role === 'logistics' || role === 'other') excludedReason = `${role}_block`;
    if (excludedReason) { excluded.push({ label, address, reason: excludedReason }); return; }
    const reasons: string[] = [];
    // Filming use can be certain while the address or its association is not.
    // Do not discard that contextual finding just because role === filming.
    if (contextConflict) reasons.push(contextConflict);
    if (addressRelation === 'access_only') reasons.push('El documento aporta una dirección de acceso o logística; falta confirmar la del set físico.');
    if (addressRelation === 'unresolved') reasons.push('Confirma qué dirección corresponde al set físico.');
    if (locationKind === 'mobile_scene') reasons.push('La escena móvil contiene una posible referencia a un lugar; confirma si identifica otro set físico.');
    if (locationKind === 'uncertain' || (locationKind === 'internal_marker' && normalizedAddress)) reasons.push(('reviewReason' in location && location.reviewReason) || 'Confirma si es un destino independiente o una posición dentro del mismo recinto.');
    if (role === 'uncertain') reasons.push(('reviewReason' in location && location.reviewReason) || 'Confirma si el bloque identifica un set físico de filmación.');
    if (!address.trim()) reasons.push('Falta el nombre o dirección del set.');
    if (normalizedAddress === '') reasons.push('Falta resolver la dirección postal del lugar; confirma la calle y el número.');
    if (day === 'uncertain') reasons.push('Confirma a qué día de rodaje pertenece el set.');
    if (dayDateRaw && !dayDate) reasons.push('Confirma la fecha indicada para este set.');
    if (unit === 'uncertain' || data.documentUnit === 'uncertain') reasons.push('Confirma a qué unidad pertenece el set.');
    // The caller already has label/address. A field-specific reason must not
    // copy the whole address, Maps URL and document-level date warning again.
    const reason = reasons.length ? [...new Set(reasons)].join(' ') : null;
    // Adjacent aliases with the same resolved postal destination are one road
    // stop. Preserve all labels/evidence and later return visits (A -> B -> A).
    const previous = filming.at(-1);
    const duplicate = address.trim() && previous &&
      (previous.label.trim().toLowerCase() === label.trim().toLowerCase() ||
        (!reason && previous.selection_state === 'confirmed' && previous.normalizedAddress && normalizedAddress)) &&
      callsheetAddressKey(previous.normalizedAddress || previous.address) === callsheetAddressKey(normalizedAddress || address) &&
      previous.selection_state === (reason ? 'candidate' : 'confirmed') ? previous : undefined;
    if (duplicate) {
      if (label && duplicate.label !== label) duplicate.label = [duplicate.label, label].filter(Boolean).join(' / ');
      duplicate.siteEvidence = [duplicate.siteEvidence, `${label}: ${address}`, siteEvidence].filter(Boolean).join('\n');
      excluded.push({ label, address, reason: 'duplicate_filming_destination' });
      return;
    }
    if (reason) reviewReasons.push(reason);
    filming.push({ label, address, normalizedAddress, siteEvidence, position, selection_state: reason ? 'candidate' : 'confirmed', review_reason: reason });
  });
  if (!filming.length) {
    const reason = excluded.some(block => block.reason === 'other_filming_unit')
      ? 'Las locaciones detectadas pertenecen a una unidad excluida por la selección actual.'
      : 'No hay sets físicos de la fecha y unidad seleccionadas; comprueba el original.';
    documentReviewReasons.push(reason);
    reviewReasons.push(reason);
  }
  return { filming, excluded, reviewReasons: [...new Set(reviewReasons)], documentReviewReasons: [...new Set(documentReviewReasons)], candidates: filming };
}
