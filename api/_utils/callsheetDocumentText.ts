import { readSpreadsheetTables, validateOfficeZip } from '../../src/lib/importDocuments.js';

/** Returns null for native PDF/images. Text documents are sent as text, never as fake PDFs. */
export async function callsheetDocumentText(bytes: Uint8Array, name: string): Promise<string | null> {
  const ext = name.split('.').pop()?.toLowerCase();
  let text: string;
  if (['txt', 'csv', 'tsv', 'xlsx', 'xls'].includes(ext ?? '')) {
    const tables = await readSpreadsheetTables({ name, size: bytes.byteLength, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
    text = tables.map(table => `DOCUMENT: ${table.name}\n${table.text}`).join('\n\n');
  } else if (ext === 'docx') {
    validateOfficeZip(bytes);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const document = zip.file('word/document.xml');
    if (!document) throw new Error('El archivo no es un documento DOCX válido.');
    const xml = await document.async('string');
    text = xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:(?:p|tr)>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  } else return null;
  if (!text.trim()) throw new Error('El documento no contiene texto legible.');
  if (text.length > 1_000_000) throw new Error('El documento contiene demasiado texto para una extracción. Divide su contenido en varios documentos.');
  return text;
}
