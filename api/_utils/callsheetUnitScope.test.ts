import { expect, it } from 'vitest';
import { selectMainUnitLocations } from './callsheetUnitScope';
const main = { label: 'MOTIV', address: 'Main Street 10, City', unitScope: 'main_unit', unitEvidence: 'MAIN UNIT\nMOTIV: Main Street 10, City' };
it('retains multiple main-unit locations while excluding second unit', () => {
  const second = { label: 'SET', address: 'Other Street 20, City', unitScope: 'other_unit', unitEvidence: '2ND UNIT\nSET: Other Street 20, City' };
  const another = { ...main, address: 'Third Street 30, City', unitEvidence: 'MAIN UNIT\nSET: Third Street 30, City' };
  const result = selectMainUnitLocations([main, second, another], 'mixed', [main, second, another].map(l => l.unitEvidence).join('\n'));
  expect(result.accepted).toEqual([main, another]);
  expect(result.excluded[0].reason).toBe('other_filming_unit');
});
it.each(['SECOND UNIT', '2ND UNIT', 'B UNIT', 'UNIT 2', 'SEGUNDA UNIDAD', 'ZWEITE DREHEINHEIT', '2. EINHEIT'])('rejects explicit %s even if the model says main unit', heading => {
  const candidate = { ...main, unitEvidence: `${heading}\nMOTIV: ${main.address}` };
  expect(selectMainUnitLocations([candidate], 'unspecified', candidate.unitEvidence).accepted).toEqual([]);
});
it('inherits an exclusively second-unit document even without repeated block labels', () => {
  expect(selectMainUnitLocations([{ label: 'SET', address: 'Street 1, City' }], 'other_unit', '').accepted).toEqual([]);
});
it('does not discard documents without unit labels, building units, camera labels or Unit Base', () => {
  const items = [{ label: 'MOTIV', address: 'Unit 2, Studio Road', dayEvidence: 'MOTIV: Unit 2, Studio Road' }, { label: 'SET 2 / B CAMERA', address: 'Road 10' }, { label: 'UNIT BASE', address: 'Road 20' }];
  expect(selectMainUnitLocations(items, 'unspecified', '').accepted).toEqual(items);
});
it('requires review for ambiguous or unsupported main-unit attribution in mixed documents', () => {
  expect(selectMainUnitLocations([{ label: 'SET', address: 'Street 1' }], 'mixed', '').excluded[0].reason).toBe('filming_unit_uncertain');
  expect(selectMainUnitLocations([main], 'mixed', '2ND UNIT\nMOTIV: Main Street 10, City').excluded[0].reason).toBe('filming_unit_evidence_invalid');
});
it('supports attached scans with no OCR text but still requires explicit unit evidence in mixed documents', () => {
  expect(selectMainUnitLocations([main], 'mixed', '').accepted).toEqual([main]);
  expect(selectMainUnitLocations([{ ...main, unitEvidence: '' }], 'mixed', '').accepted).toEqual([]);
});

it('does not accept an unassigned block when the model omitted the source second-unit heading', () => {
  expect(selectMainUnitLocations([{ label: 'SET', address: 'Road 10', dayEvidence: 'SET: Road 10' }], 'unspecified', 'SECOND UNIT CALL SHEET\nSET: Road 10').accepted).toEqual([]);
});
