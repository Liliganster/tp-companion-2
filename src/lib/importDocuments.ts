export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MANUAL_ACCEPT = '.csv,.tsv,.xlsx,.xls';

export function validateDocumentSize(file: { size: number; name: string }) {
  if (!file.size) throw new Error(`${file.name}: el archivo está vacío.`);
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${file.name}: supera los 50 MB por archivo.`);
}

export function normalizeImportHeader(value: string): string {
  const key = value.replace(/^\uFEFF/, '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ _-]/g, '');
  const aliases: Record<string, string> = {
    fecha: 'date', datum: 'date', proyecto: 'projectname', project: 'projectname', projekt: 'projectname',
    origen: 'origin', start: 'origin', destino: 'destination', ziel: 'destination',
    motivo: 'reason', purpose: 'reason', zweck: 'reason', distancia: 'distance', entfernung: 'distance',
  };
  return aliases[key] ?? key;
}

/** Quoted newlines, escaped quotes, comma/semicolon/tab delimiters. */
export function parseDelimitedRows(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = text.split('\n')[0];
  const counts = [',', ';', '\t'].map(separator => {
    let quoted = false, count = 0;
    for (const c of firstLine) { if (c === '"') quoted = !quoted; else if (!quoted && c === separator) count++; }
    return { separator, count };
  });
  const separator = counts.sort((a, b) => b.count - a.count)[0].separator;
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  const endRow = () => { row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else cell += c;
    } else if (!quoted && c === separator) { row.push(cell); cell = ''; }
    else if (!quoted && c === '\n') endRow();
    else cell += c;
  }
  if (quoted) throw new Error('Hay una celda con comillas sin cerrar. Revisa el texto antes de guardar.');
  endRow(); return rows;
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
}

export function mergeImportTables(tables: string[]): string {
  const parsed = tables.map(parseDelimitedRows).filter(rows => rows.length);
  const headers = [...new Set(parsed.flatMap(rows => rows[0].map(normalizeImportHeader)))];
  return rowsToCsv([headers, ...parsed.flatMap(rows => {
    const keys = rows[0].map(normalizeImportHeader);
    if (new Set(keys).size !== keys.length) throw new Error('Hay columnas con el mismo nombre. Renómbralas antes de importar.');
    return rows.slice(1).map(row => headers.map(key => row[keys.indexOf(key)] ?? ''));
  })]);
}

type DocumentFile = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
/** Inspect ZIP expansion before parsing Office files (no decompression needed). */
export function validateOfficeZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('El documento Office está dañado.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), expanded = 0;
  if (count === 65535 || offset === 0xffffffff) throw new Error('Este documento Office es demasiado complejo. Divídelo en varios archivos.');
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('El documento Office está dañado.');
    expanded += view.getUint32(offset + 24, true);
    if (expanded > 128 * 1024 * 1024) throw new Error('El documento Office contiene demasiados datos descomprimidos. Divídelo en varios archivos.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

export async function readSpreadsheetTables(file: DocumentFile): Promise<{ name: string; text: string }[]> {
  validateDocumentSize(file);
  const ext = file.name.split('.').pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(bytes);
    else { try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('windows-1252').decode(bytes); } }
    return [{ name: file.name, text: text.replace(/^\uFEFF/, '') }];
  }
  if (ext !== 'xlsx' && ext !== 'xls') throw new Error(`${file.name}: selecciona CSV, TSV o Excel (.xlsx, .xls).`);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if ((ext === 'xlsx' && !isZip) || (ext === 'xls' && !isOle)) throw new Error(`${file.name}: no es un libro Excel válido.`);
  if (isZip) validateOfficeZip(bytes);
  const XLSX = await import('xlsx');
  const book = XLSX.read(bytes, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false });
  const result = book.SheetNames.filter(name => !book.Workbook?.Sheets?.find(s => s.name === name)?.Hidden).map(name => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
    const normalized = rows.map(row => row.map(cell => cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '')));
    return { name: `${file.name} / ${name}`, text: rowsToCsv(normalized) };
  }).filter(sheet => sheet.text.trim());
  if (!result.length) throw new Error(`${file.name}: no hay hojas visibles con datos.`);
  return result;
}

export function parseImportDistance(raw: string): number | null {
  let value = raw.trim().replace(/[\s\u00a0]/g, '');
  if (!value) return 0;
  if (value.includes(',') && value.includes('.')) {
    value = value.lastIndexOf(',') > value.lastIndexOf('.') ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  } else value = value.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseImportDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw.trim());
  if (!iso && !dmy) return null;
  const [y, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(dmy![3]), Number(dmy![2]), Number(dmy![1])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
