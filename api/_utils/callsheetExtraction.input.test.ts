import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rejectLocations: false, download: vi.fn(), text: vi.fn(), binary: vi.fn(), insert: vi.fn(async (_table: string, _rows: unknown) => ({ error: null })) }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {
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
const run = (name: string) => extractCallsheet({ userId: 'user', jobId: 'job', storagePath: `user/job/${name}`, referenceIso: '2026-09-09', skipGeocode: true, log: { info: () => {}, warn: () => {}, error: () => {} } });
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
  expect(await run('future.txt')).toMatchObject({ ok: false, kind: 'invalid_extraction' });
  expect(mocks.insert).not.toHaveBeenCalled();
});

const extractMockLocations = async (locations: object[], source: string) => {
  const bytes = new TextEncoder().encode(source);
  mocks.download.mockResolvedValue({ data: { size: bytes.length, arrayBuffer: async () => bytes.buffer } });
  mocks.text.mockResolvedValue({ text: JSON.stringify({ date: '2026-09-10', dateRaw: '10.09.2026', dateYearInDocument: true, projectName: 'Test', locations }), provider: 'mock', model: 'mock' });
  return run('review.txt');
};

it('does not replace the original street with a model correction retaining the same number', async () => {
  const evidence = 'SHOOT 10.09.2026 MOTIV: Example Street 10, City';
  const result = await extractMockLocations([{ label: 'MOTIV', address: 'Example Street 10, City', addressCorrected: 'Invented Avenue 10, Elsewhere', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence }], evidence);
  expect(result).toMatchObject({ ok: true, locations: ['Example Street 10, City'] });
  expect(mocks.insert).toHaveBeenCalledWith('callsheet_locations', [expect.objectContaining({ address_raw: 'Example Street 10, City' })]);
});

it('routes a partially unsupported extraction to review instead of silently saving only one location', async () => {
  const evidence = 'SHOOT 10.09.2026 MOTIV: Example Street 10, City';
  const result = await extractMockLocations([
    { label: 'MOTIV', address: 'Example Street 10, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence },
    { label: 'SET', address: 'Invented Street 20, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: 'SET: Invented Street 20, City' },
  ], evidence);
  expect(result).toMatchObject({ ok: false, kind: 'invalid_extraction' });
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('does not restore an address rejected by the hallucination filter', async () => {
  mocks.rejectLocations = true;
  const evidence = 'SHOOT 10.09.2026 MOTIV: Street 1, City';
  const result = await extractMockLocations([{ label: 'MOTIV', address: 'Street 1, City', dayScope: 'document_day', dayDate: '2026-09-10', dayEvidence: evidence }], evidence);
  expect(result).toMatchObject({ ok: false, kind: 'invalid_extraction' });
  expect(mocks.insert).not.toHaveBeenCalledWith('callsheet_results', expect.anything());
  expect(mocks.insert).not.toHaveBeenCalledWith('callsheet_locations', expect.anything());
});
