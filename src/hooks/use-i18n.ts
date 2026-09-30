import { useMemo } from 'react';
import { getLocale, normalizeLanguage, t as translate, tf as translateFormat, type I18nKey } from '@/lib/i18n';
import { useUserProfile } from '@/contexts/UserProfileContext';

export function useI18n() {
  const { profile } = useUserProfile();
  const language = normalizeLanguage(profile.language);
  const locale = getLocale(language);
  const t = useMemo(() => (key: I18nKey) => translate(language, key), [language]);
  const tf = useMemo(() => (key: I18nKey, params: Record<string, string | number>) => translateFormat(language, key, params), [language]);
  return { language, locale, t, tf };
}
