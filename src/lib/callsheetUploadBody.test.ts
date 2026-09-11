import { expect, it, vi } from 'vitest';
import { CallsheetFileReadError, prepareCallsheetUploadBody } from './callsheetUploadBody';

it('copies exact bytes into a Blob independent of the selected File and infers MIME', async () => {
  const source = new File([new Uint8Array([37, 80, 68, 70, 0, 255])], '#50_Dispo.pdf');
  const body = await prepareCallsheetUploadBody(source);
  expect(body).not.toBe(source);
  expect(body).not.toBeInstanceOf(File);
  expect(body.type).toBe('application/pdf');
  const reader = new FileReader();
  const bytes = new Promise(resolve => { reader.onload = () => resolve(Array.from(new Uint8Array(reader.result as ArrayBuffer))); });
  reader.readAsArrayBuffer(body);
  expect(await bytes).toEqual([37, 80, 68, 70, 0, 255]);
});

it('rejects a truncated read instead of uploading incomplete content', async () => {
  const source = new File(['PDF'], 'Dispo.pdf');
  Object.defineProperty(source, 'size', { value: 7 });
  await expect(prepareCallsheetUploadBody(source)).rejects.toBeInstanceOf(CallsheetFileReadError);
});

it('stops a stalled local read after 30 seconds', async () => {
  vi.useFakeTimers();
  try {
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(() => {});
    const result = prepareCallsheetUploadBody(new File(['PDF'], 'Dispo.pdf'));
    const assertion = expect(result).rejects.toBeInstanceOf(CallsheetFileReadError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  } finally { vi.useRealTimers(); }
});
