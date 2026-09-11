import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rejectLocations: false, persisted: null as any, persistedOverride: null as any, rpc: vi.fn(), download: vi.fn(), text: vi.fn(), binary: vi.fn(), insert: vi.fn(async (_table: string, _rows: unknown) => ({ error: null })) }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {
  rpc: async (name: string, args: any) => {
    const response = await mocks.rpc(name, args);
    if (response?.error) return response;
    mocks.persisted = mocks.persistedOverride ?? args.p_result;
    await mocks.insert('callsheet_results', args.p_result);
    if (args.p_locations.length) await mocks.insert('callsheet_locations', args.p_locations);
    if (args.p_excluded.length) await mocks.insert('callsheet_excluded_blocks', args.p_excluded.map((l: any) => ({ ...l, evidence_text: l.address })));
    return { data: true, error: null };
  },
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.persisted }) }) }),
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
vi.mock('./pdf-parser.js', () => ({ parsePdfWithTimeout: vi.fn(async () => ({ text: 'Film' })) }));
import { extractCallsheet } from './callsheetExtraction';
import { getReviewCallsheetDrafts } from '../../src/lib/callsheetReview';
const run = (name: string) => extractCallsheet({ userId: 'user', requestId: 'request', attemptId: 'attempt', jobId: 'job', storagePath: `user/job/${name}`, referenceIso: '2026-09-09', skipGeocode: true, log: { info: () => {}, warn: () => {}, error: () => {} } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rejectLocations = false;
  mocks.persisted = null; mocks.persistedOverride = null;
  mocks.text.mockRejectedValue(new Error('MOCK_PROVIDER_REACHED'));
  mocks.binary.mockRejectedValue(new Error('MOCK_PROVIDER_REACHED'));
});
it('sends pasted messages through the text provider with the full source', async () => {
  const buffer = new TextEncoder().encode('Rodaje 09.09.2026 - MOTIV: Wien, Austria');
  mocks.download.mockResolvedValue({ data: { size: buffer.byteLength, arrayBuffer: async () => buffer.buffer } });
  await expect(run('mensaje.txt')).rejects.toThrow('MOCK_PROVIDER_REACHED');
  expect(mocks.text).toHaveBeenCalledWith('gemini-2.5-flash', expect.stringContaining('MOTIV: Wien, Austria'), expect.any(Object), undefined, expect.objectContaining({ timeoutMs: 100_000, maxOutputTokens: 8192, allowSchemaRetry: false }));
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
  const today = { label: 'MOTIV', address: 'Example Street 10, City', normalizedAddress: 'Example Street 10, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: 'SHOOT 10.09.2026\nMOTIV: Example Street 10, City' };
  const tomorrow = { label: 'SET', address: 'Other Street 20, City', normalizedAddress: 'Other Street 20, City', dayScope: 'other_day', dayDate: '2026-09-11', dayEvidence: 'NEXT DAY\nSET: Other Street 20, City' };
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
  mocks.text.mockResolvedValue({ text: JSON.stringify({ date: '2026-09-10', dateRaw: '10.09.2026', dateYearInDocument: true, projectName: 'Test', locations: [{ label: 'SET', address: 'Other Street 20, City', normalizedAddress: 'Other Street 20, City', dayScope: 'other_day', dayDate: '2026-09-11', dayEvidence: source }] }), provider: 'mock', model: 'mock' });
  expect(await run('future.txt')).toMatchObject({ ok: true, status: 'needs_review' });
  expect(mocks.insert).not.toHaveBeenCalledWith('callsheet_locations', expect.anything());
});

const extractMockLocations = async (locations: object[], source: string, extra: object = {}) => {
  const bytes = new TextEncoder().encode(source);
  mocks.download.mockResolvedValue({ data: { size: bytes.length, arrayBuffer: async () => bytes.buffer } });
  mocks.text.mockResolvedValue({ text: JSON.stringify({ date: '2026-09-10', dateRaw: '10.09.2026', dateYearInDocument: true, projectName: 'Test', locations, ...extra }), provider: 'mock', model: 'mock' });
  return run('review.txt');
};

it('carries partial extraction through stored results into the editable review draft with original document', async () => {
  const result = await extractMockLocations([
    { label: 'MOTIV', address: 'Staatsoper', unitScope: 'main_unit' },
    { label: 'SET', address: 'Stadtpark', dayScope: 'uncertain' },
    { label: 'CATERING', address: 'Catering Road 1', normalizedAddress: 'Catering Road 1' },
    { label: 'SET', address: 'Future Road 2', normalizedAddress: 'Future Road 2', dayScope: 'other_day' },
    { label: 'SET', address: 'Second Road 3', normalizedAddress: 'Second Road 3', unitScope: 'other_unit' },
  ], 'Staatsoper\nStadtpark\nCatering Road 1\nFuture Road 2\nSecond Road 3');
  expect(result).toMatchObject({ ok: true, status: 'needs_review' });
  const stored = mocks.insert.mock.calls.find(([table]) => table === 'callsheet_results')?.[1];
  const locations = mocks.insert.mock.calls.find(([table]) => table === 'callsheet_locations')?.[1];
  const [draft] = getReviewCallsheetDrafts([{ id: 'job', status: 'needs_review', storage_path: 'user/job/source.pdf', created_at: '2026-09-10', callsheet_results: stored as any, callsheet_locations: locations as any }], [], []);
  expect(draft.trip.route).toEqual([]);
  expect((locations as any[]).map(x=>x.address_raw)).toEqual(['Staatsoper','Stadtpark']);
  expect(draft.trip.date).toBe('2026-09-10');
  expect(draft.trip.distance).toBe(0);
  expect(draft.trip.documents?.[0].storagePath).toBe('user/job/source.pdf');
});

it('uses the printed shooting date rather than upload date and accepts a later-page location without a repeated date', async () => {
  const address = 'Example Street 10, City';
  const source = `PAGE 1\nSHOOT 10.09.2026\nCrew call 06:00\nPAGE 2\nScene list\nPAGE 3\nMOTIV: ${address}`;
  const result = await extractMockLocations([{ label: 'MOTIV', address, normalizedAddress: address, dayScope: 'document_day', dayDate: '', dayEvidence: `SHOOT 10.09.2026\nMOTIV: ${address}` }], source);
  expect(result).toMatchObject({ ok: true, locations: [address] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_results', expect.objectContaining({ date_value: '2026-09-10' }));
});

it('does not replace the original street with a model correction retaining the same number', async () => {
  const evidence = 'SHOOT 10.09.2026 MOTIV: Example Street 10, City';
  const result = await extractMockLocations([{ label: 'MOTIV', address: 'Example Street 10, City', normalizedAddress: 'Example Street 10, City', addressCorrected: 'Invented Avenue 10, Elsewhere', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence }], evidence);
  expect(result).toMatchObject({ ok: true, locations: ['Example Street 10, City'] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', [expect.objectContaining({ address_raw: 'Example Street 10, City' })]);
});

it('preserves a visually read set when native PDF text does not contain its address', async () => {
  const evidence = 'SHOOT 10.09.2026 MOTIV: Example Street 10, City';
  const result = await extractMockLocations([
    { label: 'MOTIV', address: 'Example Street 10, City', normalizedAddress: 'Example Street 10, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence },
    { label: 'SET', address: 'Invented Street 20, City', normalizedAddress: 'Invented Street 20, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: 'SET: Invented Street 20, City' },
  ], evidence);
  expect(result).toMatchObject({ ok: true, status: 'done' });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', expect.arrayContaining([expect.objectContaining({ address_raw: 'Example Street 10, City' }), expect.objectContaining({ address_raw: 'Invented Street 20, City' })]));
});

it('preserves venue-only locations without repeated date/unit evidence through persistence', async () => {
  const result = await extractMockLocations([{ label: 'MOTIV', address: 'Staatsoper', dayScope: 'document_day', unitScope: 'main_unit' }, { label: 'SET', address: 'Stadtpark' }], 'SHOOT 10.09.2026\nStaatsoper\nStadtpark');
  expect(result).toMatchObject({ ok: true, status: 'needs_review', locations: [] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', [expect.objectContaining({ address_raw: 'Staatsoper' }), expect.objectContaining({ address_raw: 'Stadtpark' })]);
});

it('excludes second-unit locations before persistence and keeps multiple main locations', async () => {
  const block = (heading: string, address: string, unitScope: string) => ({ label: 'SET', address, normalizedAddress: address, dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: `${heading}\nSET: ${address}`, unitScope, unitEvidence: `${heading}\nSET: ${address}` });
  const first = block('MAIN UNIT', 'Main Street 10, City', 'main_unit');
  const second = block('2ND UNIT', 'Other Street 20, City', 'other_unit');
  const third = block('MAIN UNIT', 'Third Street 30, City', 'main_unit');
  const result = await extractMockLocations([first, second, third], [first, second, third].map(l => l.dayEvidence).join('\n'));
  expect(result).toMatchObject({ ok: true, locations: [first.address, third.address] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_excluded_blocks', expect.arrayContaining([expect.objectContaining({ evidence_text: second.address, reason: 'other_filming_unit' })]));
});

it('persists the filming route of a document dedicated to second unit', async () => {
  const evidence = 'SEGUNDA UNIDAD\nSET: Other Street 20, City';
  const result = await extractMockLocations([{ label: 'SET', address: 'Other Street 20, City', normalizedAddress: 'Other Street 20, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence, unitScope: 'other_unit', unitEvidence: evidence }], evidence, {documentUnit:'other_unit'});
  expect(result).toMatchObject({ ok: true, status: 'done', locations:['Other Street 20, City'] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', [expect.objectContaining({selection_state:'confirmed'})]);
});

it('sends result, ordered candidates, exclusions and the reservation to one atomic RPC', async () => {
  const result = await extractMockLocations([
    {label:'SET A',address:'First Road 1',normalizedAddress:'First Road 1',role:'filming'},
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

it('saves the interpreted postal address separately and returns it as the destination', async () => {
 const bytes=new TextEncoder().encode('WAC Prater - 1020 Wien / Rustenschacherallee 9 - Eingang beim Tor');
 mocks.download.mockResolvedValue({data:{size:bytes.length,arrayBuffer:async()=>bytes.buffer}});
 mocks.text.mockResolvedValue({text:JSON.stringify({date:'2026-09-10',dateRaw:'10.09.2026',dateYearInDocument:true,projectName:'Test',locations:[{label:'SET',role:'filming',address:'WAC Prater - 1020 Wien / Rustenschacherallee 9 - Eingang beim Tor',normalizedAddress:'Rustenschacherallee 9, 1020 Wien'}]}),provider:'mock',model:'mock'});
 const result=await run('normalized.txt');
 expect(result).toMatchObject({ok:true,locations:['Rustenschacherallee 9, 1020 Wien']});
 const rows=mocks.insert.mock.calls.find(([table])=>table==='callsheet_locations')?.[1] as any[];
 expect(rows[0]).toMatchObject({address_raw:'WAC Prater - 1020 Wien / Rustenschacherallee 9 - Eingang beim Tor',formatted_address:'Rustenschacherallee 9, 1020 Wien'});
});
it('keeps an unresolved venue as evidence, not as a street destination',async()=>{
 const bytes=new TextEncoder().encode('SET: Unspecified Theatre');
 mocks.download.mockResolvedValue({data:{size:bytes.length,arrayBuffer:async()=>bytes.buffer}});
 mocks.text.mockResolvedValue({text:JSON.stringify({date:'2026-09-10',dateRaw:'10.09.2026',dateYearInDocument:true,projectName:'Test',locations:[{label:'SET',role:'filming',address:'Unspecified Theatre',normalizedAddress:''}]}),provider:'mock',model:'mock'});
 expect(await run('venue.txt')).toMatchObject({ok:true,status:'needs_review',locations:[]});
 const rows=mocks.insert.mock.calls.find(([table])=>table==='callsheet_locations')?.[1] as any[];
 expect(rows[0]).toMatchObject({address_raw:'Unspecified Theatre',formatted_address:'',selection_state:'candidate'});
});

it.each([
 ['19 novembre 2024','2024-11-19','done'],
 ['fecha ilegible','','needs_review'],
])('preserves PDF data while interpreting date %s, without a sequential local parse',async(date,dateValue,status)=>{
 const bytes=new TextEncoder().encode('%PDF-1.7 test all pages');
 mocks.download.mockResolvedValue({data:{size:bytes.length,arrayBuffer:async()=>bytes.buffer}});
 mocks.binary.mockResolvedValue({text:JSON.stringify({date,dateRaw:date,projectName:'Film',locations:[{label:'SET',address:'Printed Street 1',normalizedAddress:'Printed Street 1',role:'filming'}]}),provider:'mock',model:'mock'});
 expect(await run('multilingual.pdf')).toMatchObject({ok:true,date:dateValue,status,locations:['Printed Street 1']});
 expect(mocks.binary).toHaveBeenCalledOnce();
 expect(mocks.binary.mock.calls[0][2]).toEqual(Buffer.from(bytes));
 const {parsePdfWithTimeout}=await import('./pdf-parser.js');
 expect(parsePdfWithTimeout).not.toHaveBeenCalled();
});

it('keeps good sites when a sibling block is null and never routes the malformed block',async()=>{
 const result=await extractMockLocations([{label:'SET',address:'Main Road 1',normalizedAddress:'Main Road 1',role:'filming'},null as any],'SET Main Road 1');
 expect(result).toMatchObject({ok:true,status:'needs_review',locations:['Main Road 1']});
 const rows=mocks.insert.mock.calls.find(([table])=>table==='callsheet_locations')?.[1] as any[];
 expect(rows[0]).toMatchObject({selection_state:'confirmed',formatted_address:'Main Road 1'});
 expect(rows[1]).toMatchObject({selection_state:'candidate',formatted_address:''});
});
it('uses the persisted trigger-adjusted state and records request diagnostics alongside evidence',async()=>{
 mocks.persistedOverride={extraction_state:'needs_review',review_reason:'Project does not match'};
 const result=await extractMockLocations([{label:'SET',address:'Main Road 1',normalizedAddress:'Main Road 1',role:'filming'}],'SET Main Road 1');
 expect(result).toMatchObject({ok:true,status:'needs_review',reviewReason:'Project does not match'});
 const stored=mocks.insert.mock.calls.find(([table])=>table==='callsheet_results')?.[1] as any;
 expect(stored.model_output._diagnostics).toMatchObject({profile:'callsheet-2026-09-11-v4-review',inputMode:'text',limits:{allowSchemaRetry:false,maxOutputTokens:8192}});
 expect(stored.model_output._diagnostics.fileHash).toMatch(/^[a-f0-9]{64}$/);
});
it('rejects even syntactically valid but truncated provider output before atomic saving',async()=>{
 const bytes=new TextEncoder().encode('%PDF offline');
 mocks.download.mockResolvedValue({data:{size:bytes.length,arrayBuffer:async()=>bytes.buffer}});
 mocks.binary.mockResolvedValue({text:JSON.stringify({date:'2026-09-10',projectName:'Film',locations:[]}),provider:'mock',model:'mock',finishReason:'MAX_TOKENS'});
 expect(await run('truncated.pdf')).toMatchObject({ok:false,kind:'invalid_extraction'});
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.binary).toHaveBeenCalledOnce();
});
it('does not silently use raw addresses when the current provider omits normalization',async()=>{
 expect(await extractMockLocations([{label:'SET',address:'Venue - odd address',role:'filming'}],'Venue - odd address')).toMatchObject({ok:true,status:'needs_review',locations:[]});
});

it('carries whole-document understanding through the actual PDF pipeline and atomic-save payload', async () => {
 const bytes=new TextEncoder().encode('%PDF-1.7 unchanged complete document');
 mocks.download.mockResolvedValue({data:{size:bytes.length,arrayBuffer:async()=>bytes.buffer}});
 const data={
  date:'2026-09-10',dateRaw:'10 septembre 2026',dateYearInDocument:true,projectName:'Across the River',
  documentReviewReason:'The final exterior has no established relation to the listed sites.',
  locations:[
   {label:'Décor A / Maison',address:'River Road 12',normalizedAddress:'River Road 12',role:'filming',locationKind:'physical_destination',addressRelation:'set_address',siteEvidence:'Header names Décor A; page 3 links the house scenes to River Road 12.'},
   {label:'Jardins',address:'Sculpture garden; loading at River Road 20-28',normalizedAddress:'River Road 20-28',role:'filming',locationKind:'physical_destination',addressRelation:'access_only',siteEvidence:'Page 2: garden filming; page 4: street marked loading only.',reviewReason:'No filming entrance is specified.'},
   {label:'CAR',address:'The character drives home',normalizedAddress:'',role:'filming',locationKind:'mobile_scene',addressRelation:'unresolved',reviewReason:''},
  ],
 };
 mocks.binary.mockResolvedValue({text:JSON.stringify(data),provider:'mock',model:'mock',finishReason:'STOP'});
 const result=await run('context.pdf');
 expect(mocks.binary).toHaveBeenCalledOnce();
 expect(mocks.binary.mock.calls[0][2]).toEqual(Buffer.from(bytes));
 expect(result).toMatchObject({ok:true,status:'needs_review',locations:['River Road 12']});
 const payload=mocks.rpc.mock.calls[0][1];
 expect(payload.p_result.review_reason).toContain(data.documentReviewReason);
 expect(payload.p_result.model_output.locations[1].normalizedAddress).toBe('River Road 20-28');
 expect(payload.p_locations).toHaveLength(2);
 expect(payload.p_locations[0]).toMatchObject({label_source:'Décor A / Maison',formatted_address:'River Road 12',selection_state:'confirmed'});
 expect(payload.p_locations[0].evidence_text).toContain(data.locations[0].siteEvidence);
 expect(payload.p_locations[1]).toMatchObject({formatted_address:'',selection_state:'candidate'});
 expect(payload.p_excluded).toEqual([expect.objectContaining({label:'CAR',reason:'mobile_scene_without_destination'})]);
 const drafts=getReviewCallsheetDrafts([{id:'job',storage_path:'user/job/context.pdf',status:'needs_review',created_at:'2026-09-10',callsheet_results:payload.p_result,callsheet_locations:payload.p_locations}],[],[]);
 expect(drafts[0].trip.route).toEqual(['River Road 12']);
 expect(drafts[0].trip.distance).toBe(0);
});

it('does not block a usable route or trigger project mismatch with an unknown-title placeholder', async () => {
 const result=await extractMockLocations([{label:'Hotel',address:'Frankenberggasse 10, 1040 Wien',normalizedAddress:'Frankenberggasse 10, 1040 Wien',role:'filming'}],'Callsheet',{
  projectName:'Untitled Project',documentReviewScope:'metadata',documentReviewReason:"Project name is not explicitly stated; inferred as 'Untitled Project'.",
 });
 expect(result).toMatchObject({status:'done',reviewReason:null,locations:['Frankenberggasse 10, 1040 Wien']});
 const payload=mocks.rpc.mock.calls[0][1];
 expect(payload.p_result).toMatchObject({project_value:null,extraction_state:'done',review_reason:null});
 expect(payload.p_result.model_output.documentReviewScope).toBe('metadata');
 expect(payload.p_result.model_output.documentReviewReason).toContain('Project name');
});

it('persists a single document date warning and independent address states for review', async () => {
 const result=await extractMockLocations([
  {label:'SET A',address:'Example Street 1',normalizedAddress:'Example Street 1',role:'filming'},
  {label:'SET B',address:'Unresolved garden; access at Example Street 3',normalizedAddress:'Example Street 3',role:'filming',addressRelation:'access_only'},
 ],'Tuesday, 19th Nov',{date:'',dateRaw:'Tuesday, 19th Nov',dateYearInDocument:false,documentReviewScope:'date',documentReviewReason:'Missing year.'});
 expect(result.status).toBe('needs_review');
 const payload=mocks.rpc.mock.calls[0][1];
 expect(payload.p_result.date_value).toBeNull();
 expect(payload.p_result.review_reason).toContain('Hay 1 locaciones');
 expect(payload.p_result.review_reason).not.toContain('Example Street');
 expect(payload.p_locations[0]).toMatchObject({selection_state:'confirmed',review_reason:null});
 expect(payload.p_locations[1]).toMatchObject({selection_state:'candidate',formatted_address:''});
 expect(payload.p_locations[1].review_reason).not.toContain('fecha');
});
