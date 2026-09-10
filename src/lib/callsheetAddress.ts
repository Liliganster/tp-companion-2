/** Formatting only: never infer a city, postal code or a venue's street. */
export function normalizeCallsheetAddress(raw: string): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return value
    .replace(/\r?\n+/g, ', ')
    .replace(/\s+Ecke\s+/gi, ' & ')
    .replace(/\b([\p{L}]+)str\.(?=\s|\d|$)/giu, '$1straße')
    .replace(/([\p{L}])(?=\d)/gu, '$1 ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^,\s*|,\s*$/g, '')
    // Reorder an explicit postal code + city, without adding missing data.
    .replace(/^(\d{4,5}\s+[\p{L} .-]+),\s*(.+\s\d[\s\S]*)$/u, '$2, $1');
}

export function callsheetAddressKey(raw: string): string {
  if (/^https?:\/\//i.test(raw.trim()) || /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(raw.trim())) return raw.trim().replace(/\s/g, '');
  return normalizeCallsheetAddress(raw).toLocaleLowerCase('de')
    .replace(/ß/g, 'ss').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

/** Postal components only; the establishment name is evidence, not a route address. */
export function googlePostalAddress(components: { long_name: string; types: string[] }[] = []): string {
  const component = (type: string) => components.find(c => c.types.includes(type))?.long_name ?? '';
  const street = component('route');
  if (!street) return '';
  const city = component('locality') || component('postal_town') || component('administrative_area_level_3');
  return [[street, component('street_number')].filter(Boolean).join(' '),
    [component('postal_code'), city].filter(Boolean).join(' '), component('country')].filter(Boolean).join(', ');
}
