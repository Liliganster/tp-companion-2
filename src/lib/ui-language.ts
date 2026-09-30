import { normalizeLanguage, tf, type I18nKey } from './i18n';

export function uiText(key: I18nKey, params: Record<string, string | number> = {}) {
  const language = normalizeLanguage(typeof document === 'undefined' ? 'es' : document.documentElement.lang);
  return tf(language, key, params);
}
