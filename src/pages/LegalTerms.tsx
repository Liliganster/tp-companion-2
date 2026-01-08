import { useI18n } from "@/hooks/use-i18n";
import { PublicLegalLayout, type LegalSection } from "@/pages/_legal/PublicLegalLayout";
import { useMemo } from "react";

export default function LegalTerms() {
  const { language } = useI18n();

  const content = useMemo(() => {
    const placeholders =
      "Completa: [TU_EMPRESA], [EMAIL_CONTACTO], [PAÍS], [FECHA_EFECTIVA].";

    const es = {
      title: "Términos del Servicio",
      subtitle: `Condiciones de uso de Trip Companion. ${placeholders}`,
      sections: [
        {
          title: "1. Aceptación",
          body: [
            "Al crear una cuenta o usar el servicio, aceptas estos términos.",
            "Si no estás de acuerdo, no uses la aplicación.",
          ],
        },
        {
          title: "2. Cuenta y seguridad",
          body: [
            "Eres responsable de la actividad en tu cuenta y de mantener tu acceso seguro.",
            "Podemos suspender cuentas en caso de abuso, fraude o uso indebido.",
          ],
        },
        {
          title: "3. Uso permitido",
          body: [
            {
              label: "Permitido",
              items: ["Registrar viajes y proyectos propios.", "Subir documentos que tengas derecho a usar."],
            },
            {
              label: "No permitido",
              items: [
                "Intentar acceder a datos de otros usuarios.",
                "Sobrecargar el sistema (abuso/DDoS), eludir límites o automatizar sin permiso.",
                "Subir contenido ilegal o que infrinja derechos de terceros.",
              ],
            },
          ],
        },
        {
          title: "4. IA y extracción",
          body: [
            "La extracción con IA es best-effort: puede fallar o requerir revisión (p. ej. documento ilegible).",
            "Eres responsable de verificar los resultados antes de usarlos para contabilidad o reportes oficiales.",
          ],
        },
        {
          title: "5. Propiedad y licencias",
          body: [
            "Tú conservas la propiedad del contenido que subes.",
            "Nos concedes una licencia limitada para procesar tus datos con el fin de prestar el servicio.",
          ],
        },
        {
          title: "6. Limitación de responsabilidad",
          body: [
            "El servicio se proporciona “tal cual”. No garantizamos disponibilidad ininterrumpida ni ausencia de errores.",
            "En la medida permitida por ley, limitamos responsabilidad por daños indirectos o pérdidas derivadas del uso.",
          ],
        },
        {
          title: "7. Terminación",
          body: [
            "Puedes cerrar tu cuenta. Podemos suspender/terminar por incumplimiento de estos términos.",
            "Define el efecto: borrado/retención de datos conforme a la Política de Privacidad.",
          ],
        },
        {
          title: "8. Ley aplicable",
          body: ["Estos términos se rigen por las leyes de [PAÍS] and the jurisdicción competente será [CIUDAD/PAÍS]."],
        },
        {
          title: "9. Contacto",
          body: ["Soporte y reclamaciones: [EMAIL_CONTACTO]."],
        },
      ] satisfies LegalSection[],
    };

    const en = {
      title: "Terms of Service",
      subtitle: `Rules for using Trip Companion. ${placeholders}`,
      sections: [
        { title: "1. Acceptance", body: ["By using the service you agree to these terms."] },
        { title: "2. Account", body: ["You are responsible for your account activity and security."] },
        {
          title: "3. Acceptable use",
          body: [
            { label: "Allowed", items: ["Track your own trips/projects.", "Upload content you have rights to."] },
            { label: "Not allowed", items: ["Access other users' data.", "Abuse/DoS, bypass limits, unlawful content."] },
          ],
        },
        { title: "4. AI extraction", body: ["AI extraction is best-effort; verify results before relying on them."] },
        { title: "5. Ownership", body: ["You keep ownership of your content; we process it to provide the service."] },
        { title: "6. Liability", body: ["Provided as-is; liability limited to the extent permitted by law."] },
        { title: "7. Termination", body: ["You may close your account; we may terminate for violations."] },
        { title: "8. Governing law", body: ["Governing law: [COUNTRY]."] },
        { title: "9. Contact", body: ["Contact: [CONTACT_EMAIL]."] },
      ] satisfies LegalSection[],
    };

    const de = {
      title: "Nutzungsbedingungen",
      subtitle: `Bedingungen für die Nutzung. ${placeholders}`,
      sections: [
        { title: "1. Zustimmung", body: ["Durch Nutzung akzeptierst du diese Bedingungen."] },
        { title: "2. Konto", body: ["Du bist für Sicherheit und Aktivitäten verantwortlich."] },
        { title: "3. Zulässige Nutzung", body: ["Kein Zugriff auf fremde Daten, kein Missbrauch, keine illegalen Inhalte."] },
        { title: "4. KI-Extraktion", body: ["Best-effort; Ergebnisse prüfen."] },
        { title: "5. Eigentum", body: ["Du behältst Eigentum an deinen Inhalten."] },
        { title: "6. Haftung", body: ["Wie gesehen; Haftung beschränkt."] },
        { title: "7. Kündigung", body: ["Konto schließen / Sperre bei Verstößen."] },
        { title: "8. Recht", body: ["[LAND]."] },
        { title: "9. Kontakt", body: ["[KONTAKT_EMAIL]."] },
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
