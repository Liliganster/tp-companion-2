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
    const headers = await Promise.all(Object.keys(zip.files).filter(name => /^word\/header\d+\.xml$/.test(name)).sort().map(name => zip.files[name].async('string')));
    const footers = await Promise.all(Object.keys(zip.files).filter(name => /^word\/footer\d+\.xml$/.test(name)).sort().map(name => zip.files[name].async('string')));
    const xml = `HEADERS (may vary by section):\n${headers.join('\n')}\nDOCUMENT BODY:\n${await document.async('string')}\nFOOTERS:\n${footers.join('\n')}`;
    text = xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:(?:p|tr)>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  } else return null;
  if (!text.trim()) throw new Error('El documento no contiene texto legible.');
  if (text.length > 1_000_000) throw new Error('El documento contiene demasiado texto para una extracción. Divide su contenido en varios documentos.');
  return text;
}
