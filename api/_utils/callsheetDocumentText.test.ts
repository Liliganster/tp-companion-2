import { it, expect } from 'vitest';
import JSZip from 'jszip';
import { callsheetDocumentText } from './callsheetDocumentText';
it('reads pasted messages and leaves native PDFs on their existing path', async () => {
  const bytes = new TextEncoder().encode('Rodaje el 9 de septiembre en Viena.');
  expect(await callsheetDocumentText(bytes, 'mensaje.txt')).toContain('Rodaje');
  expect(await callsheetDocumentText(bytes, 'dispo.pdf')).toBeNull();
});
it('reads Word paragraphs and table cells as document text', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:p><w:r><w:t>Film &amp; Co</w:t></w:r></w:p><w:tr><w:tc><w:t>Wien</w:t></w:tc><w:tc><w:t>09.09.2026</w:t></w:tc></w:tr></w:document>');
  const text = await callsheetDocumentText(await zip.generateAsync({ type: 'uint8array' }), 'dispo.docx');
  expect(text).toContain('Film & Co\n');
  expect(text).toContain('Wien\t09.09.2026');
});
it('rejects a ZIP without a Word document rather than sending binary to AI', async () => {
  const zip = new JSZip(); zip.file('other.txt', 'hello');
  await expect(callsheetDocumentText(await zip.generateAsync({ type: 'uint8array' }), 'fake.docx')).rejects.toThrow('DOCX válido');
});
