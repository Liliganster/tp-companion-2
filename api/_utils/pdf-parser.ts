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
