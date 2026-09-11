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

it('removes repeated variants of the same set without merging different street numbers', () => {
 const result=select([{label:'SET',address:'1080 Wien, Josefsagasse12'}, {label:'SET',address:'Josefsagasse 12, 1080 Wien'}, {label:'SET',address:'Josefsagasse 14, 1080 Wien'}]);
 expect(result.filming.map(l=>l.address)).toEqual(['1080 Wien, Josefsagasse12','Josefsagasse 14, 1080 Wien']);
 expect(result.excluded[0].reason).toBe('duplicate_filming_destination');
});

it('keeps physical sites and excludes their internal map markers without creating review destinations', () => {
  const result = select([
    {label:'LOCATION 1',address:'WAC Prater 2., Rustenschacherallee 9',normalizedAddress:'Rustenschacherallee 9, 1020 Wien',role:'filming',locationKind:'physical_destination'},
    {label:'LOCATION 2',address:'Jesuitenwiese Prater HV: 2., Rustenschacherallee 32-40',normalizedAddress:'Rustenschacherallee 32-40, 1020 Wien',role:'filming',locationKind:'physical_destination'},
    ...['PLATZ 16 & 17','LOCATION 2A','LOCATION 2B','LOCATION 2C'].map(label=>({label,address:label,normalizedAddress:'',role:'filming',locationKind:'internal_marker'})),
  ]);
  expect(result.filming.map(x=>x.normalizedAddress)).toEqual(['Rustenschacherallee 9, 1020 Wien','Rustenschacherallee 32-40, 1020 Wien']);
  expect(result.excluded).toHaveLength(4);
  expect(result.reviewReasons).toEqual([]);
});
it('does not hide named venues, unresolved markers or contradictory physical addresses',()=>{
  const result=select([
    {label:'LOCATION 2A',address:'Unspecified Theatre',normalizedAddress:'',role:'filming',locationKind:'physical_destination'},
    {label:'Zone bleue',address:'Zone bleue',normalizedAddress:'',role:'filming',locationKind:'uncertain',reviewReason:'Separate site or area inside the park?'},
    {label:'Position 4',address:'Other Road 14',normalizedAddress:'Other Road 14',role:'filming',locationKind:'internal_marker'},
  ]);
  expect(result.filming).toHaveLength(3);
  expect(result.filming.every(x=>x.selection_state==='candidate')).toBe(true);
  expect(result.reviewReasons.join(' ')).toContain('Separate site');
});

it('retains a concrete address conflict even when filming use is certain', () => {
  const result = select([{label:'Décor',address:'Harbour Road 4',normalizedAddress:'Harbour Road 4',role:'filming',locationKind:'physical_destination',addressRelation:'set_address',reviewReason:'The map and schedule identify different entrances.'}]);
  expect(result.filming[0].selection_state).toBe('candidate');
  expect(result.reviewReasons.join(' ')).toContain('different entrances');
});
it('keeps a set with access-only evidence without passing its parking address to routes', () => {
  const result = select([
    {label:'Lieu A',address:'Monument in gardens; loading at Riverside 20-28',normalizedAddress:'Riverside 20-28',role:'filming',locationKind:'physical_destination',addressRelation:'access_only',siteEvidence:'Page 1 names monument; page 4 map marks street as loading only.'},
    {label:'Lieu B',address:'Market Lane 2',normalizedAddress:'Market Lane 2',role:'filming',locationKind:'physical_destination',addressRelation:'set_address'},
  ]);
  expect(result.filming.map(x=>[x.normalizedAddress,x.selection_state])).toEqual([['','candidate'],['Market Lane 2','confirmed']]);
  expect(result.filming[0].siteEvidence).toContain('page 4');
});
it('distinguishes a fictional vehicle scene from a physical filming set without keyword filtering', () => {
  const result = select([
    {label:'CAR / MOVING',address:'A character drives home',normalizedAddress:'',role:'filming',locationKind:'mobile_scene',addressRelation:'unresolved'},
    {label:'CAR / MOVING',address:'Soundstage Road 7',normalizedAddress:'Soundstage Road 7',role:'filming',locationKind:'physical_destination',addressRelation:'set_address'},
    {label:'Clinic',address:'Hill Road 9',normalizedAddress:'Hill Road 9',role:'filming',locationKind:'physical_destination',addressRelation:'set_address'},
  ]);
  expect(result.filming.map(x=>x.normalizedAddress)).toEqual(['Soundstage Road 7','Hill Road 9']);
  expect(result.excluded[0].reason).toBe('mobile_scene_without_destination');
  expect(result.reviewReasons).toEqual([]);
});
it('does not silently discard a mobile scene with conflicting evidence about another physical site', () => {
  const result = select(['mobile_scene','internal_marker'].map(locationKind=>({label:'Scene',address:'Possible second building',normalizedAddress:'',role:'filming',locationKind,reviewReason:'Schedule may require a separate building not identified on the map.'})));
  expect(result.filming.every(x=>x.selection_state==='candidate')).toBe(true);
  expect(result.excluded.every(x=>x.reason==='duplicate_filming_destination')).toBe(true);
  expect(result.filming).toHaveLength(1);
  expect(result.reviewReasons.join(' ')).toContain('separate building');
});
it('retains a whole-document conflict while preserving individually supported locations', () => {
  const result = select([{label:'SET',address:'East Road 4',normalizedAddress:'East Road 4',role:'filming'}], '', {documentReviewReason:'A final exterior scene has no established physical site.'});
  expect(result.filming[0].selection_state).toBe('confirmed');
  expect(result.reviewReasons).toEqual(['A final exterior scene has no established physical site.']);
});
