import { es, type I18nKey } from "./i18n/es";

/**
 * i18n con carga perezosa por idioma (Fase 1 del PLAN.md).
 *
 * - ES es el idioma base: viaja en el bundle principal y define las claves
 *   tipadas (I18nKey) — una traducción que falte en EN/DE rompe el typecheck.
 * - EN y DE viven en chunks separados (src/lib/i18n/en.ts, de.ts) y se cargan
 *   con import() la primera vez que se necesitan; mientras tanto se muestra ES.
 */

export type AppLanguage = "es" | "en" | "de";

export const DEFAULT_LANGUAGE: AppLanguage = "es";

export type { I18nKey };

const loaded: Partial<Record<AppLanguage, Record<I18nKey, string>>> = { es };
const loading: Partial<Record<AppLanguage, Promise<void>>> = {};

export function isLanguageLoaded(language: AppLanguage): boolean {
  return Boolean(loaded[language]);
}

export function loadLanguage(language: AppLanguage): Promise<void> {
  if (loaded[language]) return Promise.resolve();
  if (!loading[language]) {
    const promise =
      language === "en"
        ? import("./i18n/en").then((m) => { loaded.en = m.en; })
        : language === "de"
          ? import("./i18n/de").then((m) => { loaded.de = m.de; })
          : Promise.resolve();
    loading[language] = promise.catch((err) => {
      // Si el chunk falla (offline), permitir reintentar; mientras, fallback a ES.
      delete loading[language];
      throw err;
    });
  }
  return loading[language]!;
}

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
  return loaded[language]?.[key] ?? es[key];
}

export function formatTemplate(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function tf(language: AppLanguage, key: I18nKey, params: Record<string, string | number>) {
  return formatTemplate(t(language, key), params);
}
