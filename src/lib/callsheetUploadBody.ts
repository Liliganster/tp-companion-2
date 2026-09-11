import { resolveCallsheetMime } from './callsheetMime';
import { validateDocumentSize } from './importDocuments';

export class CallsheetFileReadError extends Error {
  constructor() {
    super('No se pudo leer el archivo seleccionado. Vuelve a seleccionarlo desde una carpeta local.');
    this.name = 'CallsheetFileReadError';
  }
}

/** Detach the request body from the disk-backed File before starting the upload. */
export async function prepareCallsheetUploadBody(file: File): Promise<Blob> {
  validateDocumentSize(file);
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => { reader.abort(); fail(); }, 30_000);
    const clear = () => {
      clearTimeout(timer);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const fail = () => { clear(); reject(new CallsheetFileReadError()); };
    reader.onerror = reader.onabort = fail;
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer) || reader.result.byteLength !== file.size) {
        fail(); return;
      }
      const result = reader.result;
      clear(); resolve(result);
    };
    try { reader.readAsArrayBuffer(file); } catch { fail(); }
  });
  return new Blob([bytes], { type: resolveCallsheetMime(file.name, file.type) });
}
