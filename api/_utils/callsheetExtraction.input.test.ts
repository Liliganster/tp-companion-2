import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ download: vi.fn(), text: vi.fn(), binary: vi.fn() }));
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  storage: { from: () => ({ download: mocks.download }) },
} }));
vi.mock('./storageOwnership.js', () => ({ assertStorageOwnership: async () => {} }));
vi.mock('../../src/lib/ai/geminiClient.js', () => ({ generateContent: mocks.text, generateContentFromPDF: mocks.binary }));
vi.mock('./pdf-parser.js', () => ({ parsePdfWithTimeout: async () => ({ text: 'Film' }) }));
import { extractCallsheet } from './callsheetExtraction';
const run = (name: string) => extractCallsheet({ userId: 'user', jobId: 'job', storagePath: `user/job/${name}`, referenceIso: '2026-09-09', skipGeocode: true, log: { info: () => {}, warn: () => {}, error: () => {} } });
beforeEach(() => {
  vi.clearAllMocks();
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
