import { expect, it } from 'vitest';
import { CallsheetExtractionResultSchema } from '../../src/lib/ai/validation';
import { selectCallsheetLocations } from './callsheetSelection';
const select = (locations: object[], source = '', extra = {}) => selectCallsheetLocations(CallsheetExtractionResultSchema.parse({ date: '2025-08-07', projectName: 'Film', locations, ...extra }), '2025-08-07', source);
it('keeps venue names, district-first addresses and coordinates without repeated date or unit evidence', () => {
  const addresses = ['Staatsoper', 'Stadtpark', 'Nationalbibliothek', '1. Bezirk, Beispielgasse 5', '48.2082, 16.3738'];
  const result = select(addresses.map(address => ({ label: 'MOTIV', address, dayScope: 'document_day', unitScope: 'main_unit' })), addresses.join('\n'));
  expect(result.filming.map(l => l.address)).toEqual(addresses);
  expect(result.reviewReasons).toEqual([]);
});
it('separates multiple sets, logistics, tomorrow and second unit without blocking valid sets', () => {
  const result = select([
    { label: 'SET', address: 'Opera' },
    { label: 'PARKING', address: 'Parking Road 1', dayScope: 'uncertain' },
    { label: 'MOTIV', address: 'Tomorrow Road 2', dayScope: 'other_day' },
    { label: 'SET', address: 'Unit Road 3', unitScope: 'other_unit' },
    { label: 'SET', address: 'Park' },
  ]);
  expect(result.filming.map(l => l.address)).toEqual(['Opera', 'Park']);
  expect(result.excluded).toHaveLength(3);
  expect(result.reviewReasons).toEqual([]);
});
it('preserves all candidate locations for review when one attribution or textual match is uncertain', () => {
  const result = select([{ label: 'SET', address: 'Opera' }, { label: 'SET', address: 'Park', dayScope: 'uncertain' }], 'Opera');
  expect(result.filming.map(l => l.address)).toEqual(['Opera', 'Park']);
  expect(result.reviewReasons.length).toBeGreaterThan(0);
});
it('does not lose other locations when one address is empty', () => {
  const result = select([{ label: 'SET', address: '' }, { label: 'MOTIV', address: 'Opera' }]);
  expect(result.filming.map(l => l.address)).toEqual(['Opera']);
  expect(result.reviewReasons.length).toBeGreaterThan(0);
});
