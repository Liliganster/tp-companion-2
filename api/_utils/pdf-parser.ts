// Wrapper for pdf-parse to handle CommonJS/ESM compatibility.
// pdf-parse's index.js has a debug-mode check (!module.parent) that tries to
// read ./test/data/05-versions-space.pdf at import time. In Vercel's bundled
// environment module.parent can be null, triggering the read.
// We import the internal lib directly AND keep a dummy test PDF in the repo
// (test/data/05-versions-space.pdf) as a safety net.

let _pdfParse: ((buf: Buffer, opts?: any) => Promise<any>) | null = null;

async function loadPdfParse() {
  if (_pdfParse) return _pdfParse;
  try {
    // Prefer the internal lib (skips index.js entirely)
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    _pdfParse = (mod as any).default || mod;
  } catch {
    // Fallback: main entry (requires test/data/05-versions-space.pdf to exist)
    const mod = await import("pdf-parse");
    _pdfParse = (mod as any).default || mod;
  }
  return _pdfParse!;
}

export async function parsePdf(buffer: Buffer): Promise<{
  text: string;
  numpages: number;
  info: any;
  metadata: any;
  version: string;
}> {
  const pdfParse = await loadPdfParse();
  return await pdfParse(buffer);
}

export async function parsePdfWithTimeout(buffer: Buffer, timeoutMs = 5_000) {
  return await Promise.race([
    parsePdf(buffer),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`pdf_parse_timeout_${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}
