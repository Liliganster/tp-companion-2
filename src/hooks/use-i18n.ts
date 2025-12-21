import { useMemo } from "react";
import { getLocale, t as translate, tf as translateFormat, type AppLanguage, DEFAULT_LANGUAGE } from "@/lib/i18n";
import { useUserProfile } from "@/contexts/UserProfileContext";

export function useI18n() {
  const { profile } = useUserProfile();

  const language = (profile.language ?? DEFAULT_LANGUAGE) as AppLanguage;
  const locale = useMemo(() => getLocale(language), [language]);

  const t = useMemo(() => (key: Parameters<typeof translate>[1]) => translate(language, key), [language]);
  const tf = useMemo(
    () => (key: Parameters<typeof translateFormat>[1], params: Record<string, string | number>) =>
      translateFormat(language, key, params),
    [language]
  );

  return { language, locale, t, tf };
}
