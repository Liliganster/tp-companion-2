import { useEffect, useMemo, useState } from "react";
import {
  getLocale,
  isLanguageLoaded,
  loadLanguage,
  t as translate,
  tf as translateFormat,
  type AppLanguage,
  DEFAULT_LANGUAGE,
} from "@/lib/i18n";
import { useUserProfile } from "@/contexts/UserProfileContext";

export function useI18n() {
  const { profile } = useUserProfile();

  const language = (profile.language ?? DEFAULT_LANGUAGE) as AppLanguage;
  const locale = useMemo(() => getLocale(language), [language]);

  // EN/DE se cargan perezosamente; mientras llega el chunk se muestra ES.
  // `ready` fuerza un re-render (y nueva identidad de t/tf) al completarse.
  const [ready, setReady] = useState(() => isLanguageLoaded(language));
  useEffect(() => {
    if (isLanguageLoaded(language)) {
      setReady(true);
      return;
    }
    setReady(false);
    let alive = true;
    loadLanguage(language)
      .then(() => { if (alive) setReady(true); })
      .catch(() => { /* fallback a ES; se reintenta en el próximo mount */ });
    return () => { alive = false; };
  }, [language]);

  const t = useMemo(
    () => (key: Parameters<typeof translate>[1]) => translate(language, key),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ready` invalida t al llegar el chunk
    [language, ready]
  );
  const tf = useMemo(
    () => (key: Parameters<typeof translateFormat>[1], params: Record<string, string | number>) =>
      translateFormat(language, key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ready` invalida tf al llegar el chunk
    [language, ready]
  );

  return { language, locale, t, tf };
}
