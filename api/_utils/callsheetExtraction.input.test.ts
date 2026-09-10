import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rejectLocations: false, rpc: vi.fn(), download: vi.fn(), text: vi.fn(), binary: vi.fn(), insert: vi.fn(async (_table: string, _rows: unknown) => ({ error: null })) }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {
  rpc: async (name: string, args: any) => {
    const response = await mocks.rpc(name, args);
    if (response?.error) return response;
    await mocks.insert('callsheet_results', args.p_result);
    if (args.p_locations.length) await mocks.insert('callsheet_locations', args.p_locations);
    if (args.p_excluded.length) await mocks.insert('callsheet_excluded_blocks', args.p_excluded.map((l: any) => ({ ...l, evidence_text: l.address })));
    return { data: true, error: null };
  },
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    insert: (rows: unknown) => mocks.insert(table, rows),
  }),
  storage: { from: () => ({ download: mocks.download }) },
} }));
vi.mock('./callsheetLocationHints.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./callsheetLocationHints')>();
  return { ...actual, filterHallucinatedLocations: (args: Parameters<typeof actual.filterHallucinatedLocations>[0]) => mocks.rejectLocations ? [] : actual.filterHallucinatedLocations(args) };
});
vi.mock('./storageOwnership.js', () => ({ assertStorageOwnership: async () => {} }));
vi.mock('../../src/lib/ai/geminiClient.js', () => ({ generateContent: mocks.text, generateContentFromPDF: mocks.binary }));
vi.mock('./pdf-parser.js', () => ({ parsePdfWithTimeout: async () => ({ text: 'Film' }) }));
import { extractCallsheet } from './callsheetExtraction';
import { getReviewCallsheetDrafts } from '../../src/lib/callsheetReview';
const run = (name: string) => extractCallsheet({ userId: 'user', requestId: 'request', attemptId: 'attempt', jobId: 'job', storagePath: `user/job/${name}`, referenceIso: '2026-09-09', skipGeocode: true, log: { info: () => {}, warn: () => {}, error: () => {} } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rejectLocations = false;
  mocks.text.mockRejectedValue(new Error('MOCK_PROVIDER_REACHED'));
  mocks.binary.mockRejectedValue(new Error('MOCK_PROVIDER_REACHED'));
});
it('sends pasted messages through the text provider with the full source', async () => {
  const buffer = new TextEncoder().encode('Rodaje 09.09.2026 - MOTIV: Wien, Austria');
  mocks.download.mockResolvedValue({ data: { size: buffer.byteLength, arrayBuffer: async () => buffer.buffer } });
  await expect(run('mensaje.txt')).rejects.toThrow('MOCK_PROVIDER_REACHED');
  expect(mocks.text).toHaveBeenCalledWith('gemini-2.5-flash', expect.stringContaining('MOTIV: Wien, Austria'), expect.any(Object), undefined);
  expect(mocks.binary).not.toHaveBeenCalled();
});
it('does not reject a PDF at the old 15 MB threshold or at exactly 50 MB', async () => {
  const buffer = new TextEncoder().encode('%PDF-1.7');
  for (const size of [16 * 1024 * 1024, 50 * 1024 * 1024]) {
    mocks.download.mockResolvedValue({ data: { size, arrayBuffer: async () => buffer.buffer } });
    await expect(run('file.pdf')).rejects.toThrow('MOCK_PROVIDER_REACHED');
  }
  expect(mocks.binary).toHaveBeenCalledTimes(2);
});
it('rejects over 50 MB before reading binary content or reaching the provider', async () => {
  const read = vi.fn(); mocks.download.mockResolvedValue({ data: { size: 50 * 1024 * 1024 + 1, arrayBuffer: read } });
  expect(await run('big.pdf')).toMatchObject({ ok: false, kind: 'file_too_large' });
  expect(read).not.toHaveBeenCalled(); expect(mocks.binary).not.toHaveBeenCalled();
});

it('saves only the document-day location, not tomorrow, through the actual pipeline', async () => {
  const today = { label: 'MOTIV', address: 'Example Street 10, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: 'SHOOT 10.09.2026\nMOTIV: Example Street 10, City' };
  const tomorrow = { label: 'SET', address: 'Other Street 20, City', dayScope: 'other_day', dayDate: '2026-09-11', dayEvidence: 'NEXT DAY\nSET: Other Street 20, City' };
  const bytes = new TextEncoder().encode(`${today.dayEvidence}\n${tomorrow.dayEvidence}`);
  mocks.download.mockResolvedValue({ data: { size: bytes.length, arrayBuffer: async () => bytes.buffer } });
  mocks.text.mockResolvedValue({ text: JSON.stringify({ date: '2026-09-10', dateRaw: '10.09.2026', dateYearInDocument: true, projectName: 'Test', locations: [today, tomorrow] }), provider: 'mock', model: 'mock', vendor: null });
  const result = await run('days.txt');
  expect(result).toMatchObject({ ok: true, locations: ['Example Street 10, City'] });
  const saved = mocks.insert.mock.calls.find(([table]) => table === 'callsheet_locations')?.[1] as any[];
  expect(saved).toHaveLength(1); expect(saved[0].address_raw).toBe(today.address);
});

it('does not save a successful result when the only location belongs to tomorrow', async () => {
  const source = 'SHOOT 10.09.2026\nNEXT DAY SET: Other Street 20, City';
  const bytes = new TextEncoder().encode(source);
  mocks.download.mockResolvedValue({ data: { size: bytes.length, arrayBuffer: async () => bytes.buffer } });
  mocks.text.mockResolvedValue({ text: JSON.stringify({ date: '2026-09-10', dateRaw: '10.09.2026', dateYearInDocument: true, projectName: 'Test', locations: [{ label: 'SET', address: 'Other Street 20, City', dayScope: 'other_day', dayDate: '2026-09-11', dayEvidence: source }] }), provider: 'mock', model: 'mock' });
  expect(await run('future.txt')).toMatchObject({ ok: true, status: 'needs_review' });
  expect(mocks.insert).not.toHaveBeenCalledWith('callsheet_locations', expect.anything());
});

const extractMockLocations = async (locations: object[], source: string) => {
  const bytes = new TextEncoder().encode(source);
  mocks.download.mockResolvedValue({ data: { size: bytes.length, arrayBuffer: async () => bytes.buffer } });
  mocks.text.mockResolvedValue({ text: JSON.stringify({ date: '2026-09-10', dateRaw: '10.09.2026', dateYearInDocument: true, projectName: 'Test', locations }), provider: 'mock', model: 'mock' });
  return run('review.txt');
};

it('carries partial extraction through stored results into the editable review draft with original document', async () => {
  const result = await extractMockLocations([
    { label: 'MOTIV', address: 'Staatsoper', unitScope: 'main_unit' },
    { label: 'SET', address: 'Stadtpark', dayScope: 'uncertain' },
    { label: 'CATERING', address: 'Catering Road 1' },
    { label: 'SET', address: 'Future Road 2', dayScope: 'other_day' },
    { label: 'SET', address: 'Second Road 3', unitScope: 'other_unit' },
  ], 'Staatsoper\nStadtpark\nCatering Road 1\nFuture Road 2\nSecond Road 3');
  expect(result).toMatchObject({ ok: true, status: 'needs_review' });
  const stored = mocks.insert.mock.calls.find(([table]) => table === 'callsheet_results')?.[1];
  const locations = mocks.insert.mock.calls.find(([table]) => table === 'callsheet_locations')?.[1];
  const [draft] = getReviewCallsheetDrafts([{ id: 'job', status: 'needs_review', storage_path: 'user/job/source.pdf', created_at: '2026-09-10', callsheet_results: stored as any, callsheet_locations: locations as any }], [], []);
  expect(draft.trip.route).toEqual(['Staatsoper', 'Stadtpark']);
  expect(draft.trip.date).toBe('2026-09-10');
  expect(draft.trip.distance).toBe(0);
  expect(draft.trip.documents?.[0].storagePath).toBe('user/job/source.pdf');
});

it('uses the printed shooting date rather than upload date and accepts a later-page location without a repeated date', async () => {
  const address = 'Example Street 10, City';
  const source = `PAGE 1\nSHOOT 10.09.2026\nCrew call 06:00\nPAGE 2\nScene list\nPAGE 3\nMOTIV: ${address}`;
  const result = await extractMockLocations([{ label: 'MOTIV', address, dayScope: 'document_day', dayDate: '', dayEvidence: `SHOOT 10.09.2026\nMOTIV: ${address}` }], source);
  expect(result).toMatchObject({ ok: true, locations: [address] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_results', expect.objectContaining({ date_value: '2026-09-10' }));
});

it('does not replace the original street with a model correction retaining the same number', async () => {
  const evidence = 'SHOOT 10.09.2026 MOTIV: Example Street 10, City';
  const result = await extractMockLocations([{ label: 'MOTIV', address: 'Example Street 10, City', addressCorrected: 'Invented Avenue 10, Elsewhere', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence }], evidence);
  expect(result).toMatchObject({ ok: true, locations: ['Example Street 10, City'] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', [expect.objectContaining({ address_raw: 'Example Street 10, City' })]);
});

it('preserves a visually read set when native PDF text does not contain its address', async () => {
  const evidence = 'SHOOT 10.09.2026 MOTIV: Example Street 10, City';
  const result = await extractMockLocations([
    { label: 'MOTIV', address: 'Example Street 10, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence },
    { label: 'SET', address: 'Invented Street 20, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: 'SET: Invented Street 20, City' },
  ], evidence);
  expect(result).toMatchObject({ ok: true, status: 'done' });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', expect.arrayContaining([expect.objectContaining({ address_raw: 'Example Street 10, City' }), expect.objectContaining({ address_raw: 'Invented Street 20, City' })]));
});

it('preserves venue-only locations without repeated date/unit evidence through persistence', async () => {
  const result = await extractMockLocations([{ label: 'MOTIV', address: 'Staatsoper', dayScope: 'document_day', unitScope: 'main_unit' }, { label: 'SET', address: 'Stadtpark' }], 'SHOOT 10.09.2026\nStaatsoper\nStadtpark');
  expect(result).toMatchObject({ ok: true, locations: ['Staatsoper', 'Stadtpark'] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', [expect.objectContaining({ address_raw: 'Staatsoper' }), expect.objectContaining({ address_raw: 'Stadtpark' })]);
});

it('excludes second-unit locations before persistence and keeps multiple main locations', async () => {
  const block = (heading: string, address: string, unitScope: string) => ({ label: 'SET', address, dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: `${heading}\nSET: ${address}`, unitScope, unitEvidence: `${heading}\nSET: ${address}` });
  const first = block('MAIN UNIT', 'Main Street 10, City', 'main_unit');
  const second = block('2ND UNIT', 'Other Street 20, City', 'other_unit');
  const third = block('MAIN UNIT', 'Third Street 30, City', 'main_unit');
  const result = await extractMockLocations([first, second, third], [first, second, third].map(l => l.dayEvidence).join('\n'));
  expect(result).toMatchObject({ ok: true, locations: [first.address, third.address] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_excluded_blocks', expect.arrayContaining([expect.objectContaining({ evidence_text: second.address, reason: 'other_filming_unit' })]));
});

it('sends a second-unit-only document to manual review without persisting a route', async () => {
  const evidence = 'SEGUNDA UNIDAD\nSET: Other Street 20, City';
  const result = await extractMockLocations([{ label: 'SET', address: 'Other Street 20, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence, unitScope: 'other_unit', unitEvidence: evidence }], evidence);
  expect(result).toMatchObject({ ok: true, status: 'needs_review' });
  expect(mocks.insert).not.toHaveBeenCalledWith('callsheet_locations', expect.anything());
});

it('sends result, ordered candidates, exclusions and the reservation to one atomic RPC', async () => {
  const result = await extractMockLocations([
    {label:'SET A',address:'Opera',role:'filming'},
    {label:'PARKING',address:'Parking',role:'logistics'},
    {label:'SET B',address:'Park',role:'filming',unitScope:'uncertain'},
  ],'Opera Park Parking');
  expect(result).toMatchObject({ok:true,status:'needs_review'});
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith('save_callsheet_extraction',expect.objectContaining({
    p_request_id:'request',p_attempt_id:'attempt',
    p_result:expect.objectContaining({extraction_state:'needs_review',model_output:expect.any(Object)}),
    p_locations:[expect.objectContaining({position:0,selection_state:'confirmed'}),expect.objectContaining({position:2,selection_state:'candidate'})],
  }));
});
it('does not report completion or create a draft after an atomic save error', async () => {
  mocks.rpc.mockResolvedValueOnce({error:{message:'reservation_lost'}});
  await expect(extractMockLocations([{label:'SET',address:'Opera'}],'Opera')).rejects.toThrow('reservation_lost');
  expect(mocks.insert).not.toHaveBeenCalled();
});
