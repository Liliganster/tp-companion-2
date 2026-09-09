import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { MAX_DOCUMENT_BYTES, validateDocumentSize, parseDelimitedRows, parseImportDate, readSpreadsheetTables, mergeImportTables, parseImportDistance, validateOfficeZip } from './importDocuments';

describe('document import', () => {
  it('parses decimal distances without silently saving malformed values', () => {
    expect(parseImportDistance('1.234,56')).toBe(1234.56);
    expect(parseImportDistance('1,234.56')).toBe(1234.56);
    expect(parseImportDistance('12,5')).toBe(12.5);
    expect(parseImportDistance('12km')).toBeNull();
    expect(parseImportDistance('-5')).toBeNull();
  });
  it('rejects a ZIP declaring excessive expansion before reading its entries', () => {
    const bytes = new Uint8Array(68), view = new DataView(bytes.buffer);
    view.setUint32(0, 0x02014b50, true); view.setUint32(24, 200 * 1024 * 1024, true);
    view.setUint32(46, 0x06054b50, true); view.setUint16(56, 1, true);
    expect(() => validateOfficeZip(bytes)).toThrow('descomprimidos');
  });
  it('accepts exactly 50 MB and rejects larger or empty files', () => {
    expect(() => validateDocumentSize({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES })).not.toThrow();
    expect(() => validateDocumentSize({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES + 1 })).toThrow('50 MB');
    expect(() => validateDocumentSize({ name: 'a.csv', size: 0 })).toThrow('vacío');
  });
  it('preserves quoted separators, escaped quotes and multiline cells', () => {
    expect(parseDelimitedRows('\uFEFFdate;reason\r\n2026-09-09;"uno; dos\n""tres"""')).toEqual([['date', 'reason'], ['2026-09-09', 'uno; dos\n"tres"']]);
    expect(parseDelimitedRows('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(() => parseDelimitedRows('a,b\n"oops')).toThrow('comillas');
  });
  it('rejects impossible dates without rolling into another month', () => {
    expect(parseImportDate('31/02/2026')).toBeNull();
    expect(parseImportDate('2026-13-01')).toBeNull();
    expect(parseImportDate('09.09.2026')).toBe('2026-09-09');
    expect(parseImportDate('29/02/2024')).toBe('2024-02-29');
  });
  it.each(['xlsx', 'xls'] as const)('reads real %s files with dates and multiple visible worksheets', async bookType => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['fecha', 'proyecto', 'origen', 'destino', 'km'], [new Date('2026-09-09T00:00:00Z'), 'Film', 'Wien', 'Graz', 200]]), 'Viajes');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['fecha'], ['2026-09-10']]), 'Segundo');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['secret']]), 'Oculto');
    book.Workbook = { Sheets: [{ name: 'Viajes', Hidden: 0 }, { name: 'Segundo', Hidden: 0 }, { name: 'Oculto', Hidden: 1 }] };
    const buffer = XLSX.write(book, { type: 'array', bookType });
    const tables = await readSpreadsheetTables({ name: `test.${bookType}`, size: buffer.byteLength, arrayBuffer: async () => buffer });
    expect(tables).toHaveLength(2);
    expect(parseDelimitedRows(tables[0].text)[1]).toEqual(['2026-09-09', 'Film', 'Wien', 'Graz', '200']);
  });
  it('does not accept a text file renamed to Excel', async () => {
    const bytes = new TextEncoder().encode('hello');
    await expect(readSpreadsheetTables({ name: 'fake.xlsx', size: 5, arrayBuffer: async () => bytes.buffer })).rejects.toThrow('Excel válido');
  });
  it('merges localized headers in different orders without losing cells', () => {
    const combined = mergeImportTables(['fecha;proyecto;origen;destino\n09/09/2026;Film;A;B', 'projectName,date,destination,origin\nOther,2026-09-10,D,C']);
    expect(parseDelimitedRows(combined)).toEqual([['date', 'projectname', 'origin', 'destination'], ['09/09/2026', 'Film', 'A', 'B'], ['2026-09-10', 'Other', 'C', 'D']]);
  });
});
