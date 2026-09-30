import { es, type I18nKey } from './i18n/es';
import { en } from './i18n/en';
import { de } from './i18n/de';

export type AppLanguage = 'es' | 'en' | 'de';
export const DEFAULT_LANGUAGE: AppLanguage = 'es';
export type { I18nKey };
const loaded: Record<AppLanguage, Record<I18nKey, string>> = { es, en, de };

export function normalizeLanguage(value: unknown): AppLanguage {
  const code = String(value ?? '').toLowerCase().split(/[-_]/)[0];
  return code === 'en' || code === 'de' ? code : 'es';
}
// Compatibility for existing callers; all UI dictionaries are available offline.
export function isLanguageLoaded(language: AppLanguage) { return Boolean(loaded[language]); }
export function loadLanguage(_language: AppLanguage): Promise<void> { return Promise.resolve(); }

export function getLocale(language: AppLanguage) {
  switch (language) {
    case "de":
      return "de-DE";
    case "en":
      return "en-US";
    default:
      return "es-ES";
  }
}

export function t(language: AppLanguage, key: I18nKey) {
  return loaded[normalizeLanguage(language)][key];
}

export function formatTemplate(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function tf(language: AppLanguage, key: I18nKey, params: Record<string, string | number>) {
  return formatTemplate(t(language, key), params);
}
