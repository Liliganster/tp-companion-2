export function normalizeEvidence(text: string) {
  return text.normalize('NFKC').replace(/\u00ad/g, '').toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? '';
}

export function containsEvidence(text: string, fragment: string) {
  const normalized = normalizeEvidence(fragment);
  return Boolean(normalized) && ` ${normalizeEvidence(text)} `.includes(` ${normalized} `);
}

/** Headers and address blocks need not be adjacent in PDF reading order.
 * Keep the address contiguous and verify every quoted fragment, allowing
 * intervening table cells/text but never inventing or reordering its words.
 */
export function hasDocumentEvidence(source: string, evidence: string, address: string) {
  if (!containsEvidence(evidence, address) || !containsEvidence(source, address)) return false;
  const sourceTokens = normalizeEvidence(source).split(' ');
  const fragments = evidence.split(/\r?\n/).map(normalizeEvidence).filter(Boolean);
  return fragments.length > 0 && fragments.every(fragment => {
    if (containsEvidence(source, fragment)) return true;
    let cursor = 0;
    for (const token of fragment.split(' ')) {
      const found = sourceTokens.indexOf(token, cursor);
      if (found < 0) return false;
      cursor = found + 1;
    }
    return true;
  });
}
