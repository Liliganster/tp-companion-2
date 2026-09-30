import { afterEach, describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import { de } from './i18n/de';
import { normalizeLanguage, t, tf, type AppLanguage } from './i18n';
import { validateDocumentSize, parseDelimitedRows } from './importDocuments';

const originalLanguage = document.documentElement.lang;
afterEach(() => { document.documentElement.lang = originalLanguage; });
describe('complete, immediately available UI translations', () => {
  it.each([['en', en], ['de', de]] as const)('%s has every key and preserves template placeholders', (_language, dictionary) => {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(es).sort());
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      expect(dictionary[key].trim(), key).not.toBe('');
      expect(placeholders(dictionary[key]), key).toEqual(placeholders(es[key]));
    }
  });
  it.each([
    ['es', 'Cerrar', 'Proyecto "Rodaje" creado'],
    ['en', 'Close', 'Project "Rodaje" created'],
    ['de', 'Schließen', 'Projekt „Rodaje“ erstellt'],
  ])('%s is available without loading or a Spanish fallback', (language, close, project) => {
    expect(t(language as AppLanguage, 'modal.close')).toBe(close);
    expect(tf(language as AppLanguage, 'ui.projectCreatedNamed', { name: 'Rodaje' })).toBe(project);
  });
  it('normalizes regional language codes', () => {
    expect(normalizeLanguage('de-AT')).toBe('de');
    expect(normalizeLanguage('en_US')).toBe('en');
    expect(normalizeLanguage(undefined)).toBe('es');
  });
  it.each([
    ['es', 'el archivo está vacío', 'comillas sin cerrar'],
    ['en', 'the file is empty', 'unclosed quotation mark'],
    ['de', 'Die Datei ist leer', 'Anführungszeichen'],
  ])('uses the active %s language for import validation', (language, empty, quotes) => {
    document.documentElement.lang = language;
    expect(() => validateDocumentSize({ name: 'callsheet.csv', size: 0 })).toThrow(empty);
    expect(() => parseDelimitedRows('"unterminated')).toThrow(quotes);
  });
});
