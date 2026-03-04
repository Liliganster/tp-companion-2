// Wrapper for pdf-parse to handle CommonJS/ESM compatibility
import * as pdfParseModule from "pdf-parse";

// Handle both default and named exports
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

export async function parsePdf(buffer: Buffer): Promise<{
  text: string;
  numpages: number;
  info: any;
  metadata: any;
  version: string;
}> {
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
