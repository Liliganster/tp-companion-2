import { expect, it } from 'vitest';
import { selectDocumentDayLocations } from './callsheetDayScope';
const date = '2026-09-10';
const current = (address: string, evidence = `SHOOT 10.09.2026\nMOTIV: ${address}`) => ({ label: 'MOTIV', address, dayScope: 'document_day', dayDate: date, dayEvidence: evidence });
it('retains multiple locations for the document day and excludes tomorrow and yesterday', () => {
  const a = current('Street A 1'); const b = current('Street B 2');
  const future = { ...current('Street C 3'), dayScope: 'other_day' };
  const previous = { ...current('Street D 4'), dayDate: '2026-09-09' };
  const rows = [a, future, b, previous];
  const result = selectDocumentDayLocations(rows, date, rows.map(r => r.dayEvidence).join('\n'));
  expect(result.accepted).toEqual([a, b]); expect(result.excluded).toHaveLength(2);
});
it.each(['NEXT DAY', 'NÄCHSTER DREHTAG', 'PRÓXIMO DÍA', 'YESTERDAY'])('rejects a %s block even if the model says current day', heading => {
  const item = current('Street A 1', `${heading}\nMOTIV: Street A 1`);
  expect(selectDocumentDayLocations([item], date, item.dayEvidence).accepted).toEqual([]);
});
it('does not revive other-day locations when none remain', () => {
  const item = { ...current('Street A 1'), dayScope: 'other_day' };
  expect(selectDocumentDayLocations([item], date, item.dayEvidence).accepted).toEqual([]);
});
it('requires day evidence and rejects evidence copied from a different address', () => {
  const a = { ...current('Street A 1'), dayEvidence: '' };
  const b = current('Street B 2', 'SHOOT 10.09.2026 MOTIV: Street A 1');
  expect(selectDocumentDayLocations([a, b], date, b.dayEvidence).accepted).toEqual([]);
});
it('accepts inherited date and multiline evidence but not a fabricated quote', () => {
  const item = { ...current('Street A 1'), dayDate: '' };
  expect(selectDocumentDayLocations([item], date, item.dayEvidence.replace(/\n/g, '   ')).accepted).toHaveLength(1);
  expect(selectDocumentDayLocations([item], date, 'Different source').accepted).toHaveLength(0);
});
it('keeps image candidates only with explicit day classification and evidence', () => {
  expect(selectDocumentDayLocations([current('Venue, City')], date, '').accepted).toHaveLength(1);
  expect(selectDocumentDayLocations([{ label: 'SET', address: 'Venue, City' }], date, '').accepted).toHaveLength(0);
});
