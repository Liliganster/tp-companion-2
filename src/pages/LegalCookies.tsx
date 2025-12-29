import { useI18n } from "@/hooks/use-i18n";
import { PublicLegalLayout, type LegalSection } from "@/pages/_legal/PublicLegalLayout";
import { useMemo } from "react";

export default function LegalCookies() {
  const { language } = useI18n();

  const content = useMemo(() => {
    const placeholders =
      "Completa: [TU_EMPRESA], [EMAIL_CONTACTO], [FECHA_EFECTIVA]. Si activas GA4, añade un banner de consentimiento (opt-in) según tu jurisdicción.";

    const es = {
      title: "Política de Cookies",
      subtitle: `Información sobre cookies y tecnologías similares. ${placeholders}`,
      sections: [
        {
          title: "1. Qué son cookies",
          body: ["Las cookies son pequeños archivos que se almacenan en tu dispositivo para recordar información o medir uso."],
        },
        {
          title: "2. Qué usamos en Trip Companion",
          body: [
            {
              label: "Cookies/tokens esenciales (si aplica)",
              items: [
                "Autenticación (sesión) y preferencias básicas (idioma/tema).",
                "Seguridad y prevención de abuso.",
              ],
            },
            {
              label: "Analytics (opcional)",
              items: [
                "Si activas Google Analytics u otra herramienta, se pueden usar cookies de medición.",
                "Recomendación: no activar analytics sin un mecanismo de consentimiento donde aplique (p. ej. UE).",
              ],
            },
          ],
        },
        {
          title: "3. Cómo gestionar cookies",
          body: [
            "Puedes eliminar o bloquear cookies desde la configuración de tu navegador.",
            "Si bloqueas cookies esenciales, algunas partes del servicio pueden no funcionar.",
          ],
        },
        {
          title: "4. Contacto",
          body: ["Para dudas: [EMAIL_CONTACTO]."],
        },
      ] satisfies LegalSection[],
    };

    const en = {
      title: "Cookie Policy",
      subtitle: `Information about cookies and similar technologies. ${placeholders}`,
      sections: [
        { title: "1. What are cookies", body: ["Cookies are small files stored on your device to remember information or measure usage."] },
        {
          title: "2. What we use",
          body: [
            { label: "Essential", items: ["Auth/session and basic preferences (language/theme).", "Security and abuse prevention."] },
            { label: "Analytics (optional)", items: ["If GA4/analytics is enabled, measurement cookies may be used; require consent where applicable."] },
          ],
        },
        { title: "3. Managing cookies", body: ["You can delete/block cookies in your browser settings. Blocking essential cookies may break features."] },
        { title: "4. Contact", body: ["Contact: [CONTACT_EMAIL]."] },
      ] satisfies LegalSection[],
    };

    const de = {
      title: "Cookie-Richtlinie",
      subtitle: `Informationen über Cookies. ${placeholders}`,
      sections: [
        { title: "1. Was sind Cookies", body: ["Cookies sind kleine Dateien zur Speicherung von Informationen/Messung."] },
        { title: "2. Nutzung", body: ["Essentiell (Login/Präferenzen), optional Analytics (Einwilligung)."] },
        { title: "3. Verwaltung", body: ["Browser-Einstellungen: löschen/blockieren; essentielle Cookies können Funktionen beeinträchtigen."] },
        { title: "4. Kontakt", body: ["[KONTAKT_EMAIL]."] },
      ] satisfies LegalSection[],
    };

    if (language === "de") return de;
    if (language === "en") return en;
    return es;
  }, [language]);

  return (
    <PublicLegalLayout
      language={language}
      title={content.title}
      subtitle={content.subtitle}
      sections={content.sections}
    />
  );
}
