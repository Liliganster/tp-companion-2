import { expect, it } from 'vitest';
import { hasDocumentEvidence } from './callsheetEvidence';

it('verifies separate first-page date and later address blocks with intervening content', () => {
  const source = 'SHOOT 10.09.2026\nCrew call 06:00\nPage 3\nMOTIV: Example Street 10, City';
  expect(hasDocumentEvidence(source, 'SHOOT 10.09.2026\nMOTIV: Example Street 10, City', 'Example Street 10, City')).toBe(true);
  expect(hasDocumentEvidence(source, 'SHOOT 10.09.2026 MOTIV: Example Street 10, City', 'Example Street 10, City')).toBe(true);
});

it('tolerates punctuation and line wrapping without changing address tokens', () => {
  expect(hasDocumentEvidence('MOTIV: Example Street\n10 City', 'MOTIV: Example Street 10, City', 'Example Street 10, City')).toBe(true);
});

it.each(['Example Street 11, City', 'Invented Street 10, City', 'Street 10, Invented City'])('rejects an unsupported address: %s', address => {
  expect(hasDocumentEvidence('SHOOT 10.09.2026 MOTIV: Example Street 10, City', `SHOOT 10.09.2026 MOTIV: ${address}`, address)).toBe(false);
});

it('rejects invented dates and headings even when the address exists', () => {
  const source = 'SHOOT 10.09.2026 MOTIV: Example Street 10, City';
  expect(hasDocumentEvidence(source, 'SHOOT 11.09.2026\nMOTIV: Example Street 10, City', 'Example Street 10, City')).toBe(false);
  expect(hasDocumentEvidence(source, 'MAIN UNIT\nMOTIV: Example Street 10, City', 'Example Street 10, City')).toBe(false);
});
