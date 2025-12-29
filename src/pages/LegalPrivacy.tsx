import { useI18n } from "@/hooks/use-i18n";
import { PublicLegalLayout, type LegalSection } from "@/pages/_legal/PublicLegalLayout";
import { useMemo } from "react";

export default function LegalPrivacy() {
  const { language } = useI18n();

  const content = useMemo(() => {
    const placeholders = "Completa: [TU_EMPRESA], [DIRECCIÓN], [PAÍS], [EMAIL_CONTACTO], [FECHA_EFECTIVA].";

    const es = {
      title: "Política de Privacidad",
      subtitle: `Cómo recopilamos, usamos y protegemos tus datos. ${placeholders}`,
      sections: [
        {
          title: "1. Responsable del tratamiento",
          body: [
            "Responsable: [TU_EMPRESA]. Dirección: [DIRECCIÓN]. Contacto: [EMAIL_CONTACTO].",
            "Si usas Supabase y Vercel, parte del tratamiento lo realizan como encargados del tratamiento.",
          ],
        },
        {
          title: "2. Datos que tratamos",
          body: [
            {
              label: "Datos de cuenta",
              items: ["Email, identificador de usuario, proveedor de login (p. ej. Google)."],
            },
            {
              label: "Datos introducidos por el usuario",
              items: ["Proyectos, viajes (fecha, ruta, distancia), configuración del vehículo, etc."],
            },
            {
              label: "Documentos",
              items: ["Archivos subidos (p. ej. facturas) y metadatos asociados."],
            },
            {
              label: "Datos técnicos",
              items: ["Logs de errores/seguridad y datos de uso (si activas analytics)."],
            },
          ],
        },
        {
          title: "3. Finalidades y base legal",
          body: [
            {
              label: "Prestación del servicio",
              items: ["Crear y gestionar tu cuenta, proyectos, viajes y análisis."],
            },
            {
              label: "Seguridad y prevención de abuso",
              items: ["Rate limiting, detección de fraude y auditoría."],
            },
            {
              label: "Mejora del producto (opcional)",
              items: ["Analytics y métricas de rendimiento si se habilitan y consientes (cookies/consent)."],
            },
          ],
        },
        {
          title: "4. Procesamiento con IA",
          body: [
            "Si subes documentos para extracción (p. ej. facturas), el contenido puede procesarse con un proveedor de IA para extraer campos (importe, moneda, etc.).",
            "Recomendación: detalla el proveedor, región, retención y si se usa para entrenamiento (idealmente: no).",
          ],
        },
        {
          title: "5. Conservación",
          body: [
            "Conservamos los datos mientras mantengas la cuenta activa o el tiempo necesario para prestarte el servicio y cumplir obligaciones legales.",
            "Define periodos concretos (por ejemplo, borrado bajo solicitud, y retención mínima por facturación si aplica).",
          ],
        },
        {
          title: "6. Derechos",
          body: [
            "Puedes solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a [EMAIL_CONTACTO].",
            "Si estás en la UE, también puedes reclamar ante tu autoridad de control.",
          ],
        },
        {
          title: "7. Transferencias y subencargados",
          body: [
            "Indica países/entidades: Supabase (DB/Storage), Vercel (hosting/functions), proveedor de IA, Sentry (errores), Upstash (rate limiting).",
            "Si hay transferencias internacionales, especifica la base (p. ej. SCCs).",
          ],
        },
        {
          title: "8. Seguridad",
          body: [
            "Aplicamos controles como RLS en Supabase, separación de roles y claves, y medidas contra abuso (rate limiting).",
            "Ningún sistema es 100% seguro; reporta incidentes a [EMAIL_CONTACTO].",
          ],
        },
      ] satisfies LegalSection[],
    };

    const en = {
      title: "Privacy Policy",
      subtitle: `How we collect, use and protect your data. ${placeholders}`,
      sections: [
        {
          title: "1. Data controller",
          body: ["Controller: [YOUR_COMPANY]. Address: [ADDRESS]. Contact: [CONTACT_EMAIL]."],
        },
        {
          title: "2. Data we process",
          body: [
            { label: "Account data", items: ["Email, user identifier, auth provider (e.g. Google)."] },
            { label: "User-provided data", items: ["Projects, trips, vehicle settings, etc."] },
            { label: "Documents", items: ["Uploaded files (e.g. invoices) and related metadata."] },
            { label: "Technical data", items: ["Security/error logs and usage analytics (if enabled)."] },
          ],
        },
        {
          title: "3. Purposes & legal basis",
          body: [
            { label: "Service delivery", items: ["Operate your account and provide product functionality."] },
            { label: "Security", items: ["Rate limiting, abuse prevention and auditing."] },
            { label: "Product improvement (optional)", items: ["Analytics/performance if enabled with consent."] },
          ],
        },
        {
          title: "4. AI processing",
          body: [
            "If you upload documents for extraction (e.g. invoices), we may process content with an AI provider to extract fields (amount, currency, etc.).",
          ],
        },
        {
          title: "5. Retention",
          body: ["We retain data while your account is active and as required for legal obligations."],
        },
        {
          title: "6. Your rights",
          body: ["You can request access, deletion, correction, portability, etc. via [CONTACT_EMAIL]."],
        },
        {
          title: "7. Subprocessors / transfers",
          body: ["List: Supabase, Vercel, AI provider, Sentry, Upstash; specify international transfer safeguards if applicable."],
        },
        {
          title: "8. Security",
          body: ["We use RLS, role separation, key management and anti-abuse controls. Report issues to [CONTACT_EMAIL]."],
        },
      ] satisfies LegalSection[],
    };

    const de = {
      title: "Datenschutzerklärung",
      subtitle: `Wie wir Daten verarbeiten. ${placeholders}`,
      sections: [
        { title: "1. Verantwortlicher", body: ["[IHR_UNTERNEHMEN], [ADRESSE], [KONTAKT_EMAIL]."] },
        { title: "2. Verarbeitete Daten", body: ["Kontodaten, Nutzungsdaten, Dokumente, technische Logs/Analytics (falls aktiviert)."] },
        { title: "3. Zweck & Rechtsgrundlage", body: ["Servicebereitstellung, Sicherheit, optionale Produktanalyse (Einwilligung)."] },
        { title: "4. KI-Verarbeitung", body: ["Dokumente können zur Extraktion (Betrag/Währung) von einem KI-Anbieter verarbeitet werden."] },
        { title: "5. Speicherdauer", body: ["Solange Konto aktiv + gesetzliche Pflichten."] },
        { title: "6. Rechte", body: ["Auskunft, Löschung, Berichtigung etc. über [KONTAKT_EMAIL]."] },
        { title: "7. Auftragsverarbeiter", body: ["Supabase, Vercel, KI-Anbieter, Sentry, Upstash; Transfers angeben."] },
        { title: "8. Sicherheit", body: ["RLS, Schlüsselmanagement, Rate Limiting."] },
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
