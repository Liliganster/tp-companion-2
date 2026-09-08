export const UPLOAD_LIMITS = { callsheets: 10 * 1024 * 1024, project_documents: 5 * 1024 * 1024 } as const;
export type UploadBucket = keyof typeof UPLOAD_LIMITS;
export const UPLOAD_MIMES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" } as const;

export function uploadMime(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  return UPLOAD_MIMES[ext as keyof typeof UPLOAD_MIMES];
}

export function validateUploadMetadata(bucket: UploadBucket, name: string, type: string, size: number): string {
  const mime = uploadMime(name);
  if (!mime || (type && type !== mime)) throw new Error("Solo PDF, JPG y PNG; la extensión y el tipo deben coincidir.");
  if (!Number.isSafeInteger(size) || size <= 0 || size > UPLOAD_LIMITS[bucket]) {
    throw new Error(`El archivo debe ocupar entre 1 byte y ${UPLOAD_LIMITS[bucket] / 1024 / 1024} MB.`);
  }
  return mime;
}

// Check actual bytes, not a browser-supplied Content-Type. This is format validation,
// not antivirus scanning or a guarantee that a document has no active content.
export function validateUploadBytes(bytes: Uint8Array, mime: string): void {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  const tail = new TextDecoder("latin1").decode(bytes.slice(-1024));
  const valid = mime === "application/pdf"
    ? /^%PDF-(1\.[0-7]|2\.0)[\r\n\s]/.test(new TextDecoder().decode(bytes.slice(0, 12))) && /%%EOF\s*$/.test(tail)
    : mime === "image/jpeg"
      ? bytes.length >= 12 && starts(0xff, 0xd8, 0xff) && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
      : mime === "image/png"
        ? bytes.length >= 45 && starts(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82)
          && new TextDecoder("latin1").decode(bytes.slice(-8, -4)) === "IEND"
        : false;
  if (!valid) throw new Error("El contenido del archivo no corresponde a un PDF, JPG o PNG válido.");
}
