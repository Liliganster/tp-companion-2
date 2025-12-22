// Wrapper for pdf-parse to handle CommonJS/ESM compatibility
let pdfParse: any;

try {
  // Try ESM import
  pdfParse = require("pdf-parse");
} catch (e) {
  // Fallback for different module systems
  pdfParse = require("pdf-parse").default;
}

export async function parsePdf(buffer: Buffer): Promise<{
  text: string;
  numpages: number;
  info: any;
  metadata: any;
  version: string;
}> {
  return await pdfParse(buffer);
}
