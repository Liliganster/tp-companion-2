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
  expect(result.filming.map(l => l.address)).toEqual(['', 'Opera']);
  expect(result.filming[0].selection_state).toBe('candidate');
  expect(result.reviewReasons.length).toBeGreaterThan(0);
});

it('uses physical filming context even for hospitals, and excludes SET contact lists', () => {
  const result = select([
    {label:'MOTIV Krankenhaus',address:'Hospital Central',role:'filming'},
    {label:'SET',address:'Director Name, phone 123',role:'other'},
    {label:'Catering at SET',address:'Food Road',role:'logistics'},
    {label:'',address:'Parque Sur',role:'filming'},
    {label:'Unknown',address:'Unknown Road',role:'uncertain',reviewReason:'Two columns conflict about filming use'},
  ]);
  expect(result.filming.map(l=>[l.address,l.selection_state])).toEqual([
    ['Hospital Central','confirmed'],['Parque Sur','confirmed'],['Unknown Road','candidate'],
  ]);
  expect(result.excluded).toHaveLength(2);
  expect(result.reviewReasons.join(' ')).toContain('Two columns conflict');
});
it('keeps label/address relations and source order for separate sets sharing an address', () => {
  const result = select([{label:'SET A',address:'Shared Place'}, {label:'SET B',address:'Shared Place'}]);
  expect(result.filming.map(l=>[l.label,l.position])).toEqual([['SET A',0],['SET B',1]]);
});
