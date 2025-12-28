import { MainLayout } from "@/components/layout/MainLayout";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

type DocSection = { id: string; title: string; body: Array<string | { label: string; items: string[] }> };

export default function Docs() {
  const { language } = useI18n();
  const navigate = useNavigate();

  const backLabel = useMemo(() => {
    if (language === "de") return "Zurück";
    if (language === "en") return "Back";
    return "Volver";
  }, [language]);

  const content = useMemo(() => {
    const es: { title: string; subtitle: string; sections: DocSection[] } = {
      title: "Documentación",
      subtitle: "Guía rápida para usar Trip Companion.",
      sections: [
        {
          id: "start",
          title: "Empezar",
          body: [
            "Crea un proyecto y añade viajes para tener métricas (km, CO₂) y análisis.",
            "Conecta Google Calendar/Drive si quieres integrar calendarios o subir documentos desde Drive.",
            {
              label: "Recomendado",
              items: [
                "Configura el vehículo (consumo, precios) si quieres estimaciones sin facturas.",
                "Sube facturas para costes reales (IA extrae el importe).",
              ],
            },
          ],
        },
        {
          id: "trips",
          title: "Viajes",
          body: [
            "Cada viaje guarda fecha, ruta, proyecto, distancia y CO₂.",
            "En el detalle del viaje puedes adjuntar una factura (PDF/imagen).",
            {
              label: "Facturas por viaje",
              items: [
                "Al subir una factura se crea un job de extracción (IA).",
                "Cuando termina, se guarda el importe/currency y se refleja en Viajes, Proyectos y Análisis de costes.",
                "Puedes eliminar la factura desde el viaje: se borra el archivo y el resultado asociado.",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Proyectos",
          body: [
            "Los proyectos agrupan viajes y documentos.",
            "En el detalle del proyecto puedes subir facturas a nivel proyecto (sin viaje concreto).",
            "Las tablas de facturas muestran estado de IA (queued/processing/done/needs_review/failed).",
          ],
        },
        {
          id: "costs",
          title: "Análisis de costes",
          body: [
            "El coste total prioriza importes de facturas extraídas; si no hay, usa estimación por km según tu configuración.",
            {
              label: "Energía estimada (€/km)",
              items: [
                "Gasolina/diésel: (L/100km ÷ 100) × €/L",
                "Eléctrico: (kWh/100km ÷ 100) × €/kWh",
              ],
            },
            "El desglose (combustible/energía, mantenimiento, otros) depende de los parámetros configurados; si están a 0, el desglose es solo visual.",
          ],
        },
        {
          id: "emissions",
          title: "CO₂ y ranking",
          body: [
            "El CO₂ del viaje se calcula a partir de tu configuración del vehículo (si está completada).",
            "Si no hay datos del vehículo, la app usa los valores guardados en Supabase o una estimación básica.",
          ],
        },
        {
          id: "troubleshooting",
          title: "Solución de problemas",
          body: [
            {
              label: "No veo facturas o totales",
              items: [
                "Asegúrate de haber ejecutado las migraciones de Supabase.",
                "Si una factura no aparece en un proyecto, el viaje debe tener `project_id` asignado.",
              ],
            },
            {
              label: "IA en 'needs_review' o 'failed'",
              items: [
                "La factura puede no tener un total claro o la imagen/PDF no es legible.",
                "Prueba a subir una versión con mejor calidad o re-procesar.",
              ],
            },
          ],
        },
      ],
    };

    const en: typeof es = {
      title: "Documentation",
      subtitle: "Quick guide to using Trip Companion.",
      sections: [
        {
          id: "start",
          title: "Getting started",
          body: [
            "Create a project and add trips to get metrics (km, CO₂) and analysis.",
            "Connect Google Calendar/Drive if you want calendar integration or Drive uploads.",
            {
              label: "Recommended",
              items: [
                "Configure your vehicle (consumption, prices) for estimates without invoices.",
                "Upload invoices to use real costs (AI extracts the total).",
              ],
            },
          ],
        },
        {
          id: "trips",
          title: "Trips",
          body: [
            "Each trip stores date, route, project, distance and CO₂.",
            "In trip details you can attach an invoice (PDF/image).",
            {
              label: "Trip invoices",
              items: [
                "Uploading creates an extraction job (AI).",
                "When it finishes, the amount/currency is stored and shown in Trips, Projects and Cost analysis.",
                "You can delete the invoice from the trip; the file and AI result are removed.",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Projects",
          body: [
            "Projects group trips and documents.",
            "In project details you can upload project-level invoices (not tied to a specific trip).",
            "Invoice tables show AI status (queued/processing/done/needs_review/failed).",
          ],
        },
        {
          id: "costs",
          title: "Cost analysis",
          body: [
            "Total cost prioritizes extracted invoice amounts; otherwise it uses per‑km estimation from your configuration.",
            {
              label: "Estimated energy (€/km)",
              items: [
                "Gas/diesel: (L/100km ÷ 100) × €/L",
                "EV: (kWh/100km ÷ 100) × €/kWh",
              ],
            },
            "The breakdown (fuel/energy, maintenance, other) depends on configured parameters; if they are 0, the breakdown is visual only.",
          ],
        },
        {
          id: "emissions",
          title: "CO₂ & ranking",
          body: [
            "Trip CO₂ is computed from your vehicle configuration (when filled).",
            "If vehicle data is missing, the app uses stored Supabase values or a basic estimate.",
          ],
        },
        {
          id: "troubleshooting",
          title: "Troubleshooting",
          body: [
            {
              label: "I don't see invoices or totals",
              items: [
                "Make sure you ran the Supabase migrations.",
                "If an invoice doesn't show under a project, the trip needs `project_id` set.",
              ],
            },
            {
              label: "AI status is 'needs_review' or 'failed'",
              items: [
                "The invoice might not have a clear total or the PDF/image is not readable.",
                "Upload a higher-quality version or reprocess it.",
              ],
            },
          ],
        },
      ],
    };

    const de: typeof es = {
      title: "Dokumentation",
      subtitle: "Kurzanleitung für Trip Companion.",
      sections: [
        {
          id: "start",
          title: "Start",
          body: [
            "Erstelle ein Projekt und füge Fahrten hinzu, um Kennzahlen (km, CO₂) und Analysen zu sehen.",
            "Verbinde Google Calendar/Drive, wenn du Integrationen nutzen willst.",
            {
              label: "Empfohlen",
              items: [
                "Fahrzeug konfigurieren (Verbrauch, Preise) für Schätzungen ohne Rechnungen.",
                "Rechnungen hochladen für reale Kosten (KI extrahiert den Betrag).",
              ],
            },
          ],
        },
        {
          id: "trips",
          title: "Fahrten",
          body: [
            "Jede Fahrt speichert Datum, Route, Projekt, Distanz und CO₂.",
            "In den Fahrtdetails kannst du eine Rechnung anhängen (PDF/Bild).",
            {
              label: "Rechnungen pro Fahrt",
              items: [
                "Beim Upload wird ein Extraktions-Job erstellt (KI).",
                "Nach Abschluss werden Betrag/Währung gespeichert und in Fahrten, Projekten und Kostenanalyse angezeigt.",
                "Du kannst die Rechnung in der Fahrt löschen; Datei und KI-Ergebnis werden entfernt.",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Projekte",
          body: [
            "Projekte gruppieren Fahrten und Dokumente.",
            "Im Projektdetail kannst du Projekt-Rechnungen hochladen (nicht an eine Fahrt gebunden).",
            "Rechnungstabellen zeigen den KI-Status (queued/processing/done/needs_review/failed).",
          ],
        },
        {
          id: "costs",
          title: "Kostenanalyse",
          body: [
            "Gesamtkosten nutzen zuerst extrahierte Rechnungsbeträge; sonst wird pro km anhand deiner Konfiguration geschätzt.",
            {
              label: "Geschätzte Energie (€/km)",
              items: [
                "Benzin/Diesel: (L/100km ÷ 100) × €/L",
                "EV: (kWh/100km ÷ 100) × €/kWh",
              ],
            },
            "Die Aufteilung (Energie, Wartung, Sonstiges) hängt von deinen Parametern ab; bei 0 ist es nur eine Visualisierung.",
          ],
        },
        {
          id: "emissions",
          title: "CO₂ & Ranking",
          body: [
            "CO₂ pro Fahrt wird aus deiner Fahrzeugkonfiguration berechnet (wenn ausgefüllt).",
            "Ohne Fahrzeugdaten nutzt die App gespeicherte Supabase-Werte oder eine Basisschätzung.",
          ],
        },
        {
          id: "troubleshooting",
          title: "Fehlerbehebung",
          body: [
            {
              label: "Ich sehe keine Rechnungen oder Totale",
              items: [
                "Stelle sicher, dass die Supabase-Migrationen ausgeführt wurden.",
                "Wenn eine Rechnung nicht im Projekt erscheint, muss die Fahrt `project_id` gesetzt haben.",
              ],
            },
            {
              label: "KI-Status 'needs_review' oder 'failed'",
              items: [
                "Der Gesamtbetrag ist evtl. nicht eindeutig oder das PDF/Bild ist schlecht lesbar.",
                "Lade eine bessere Version hoch oder starte die Verarbeitung neu.",
              ],
            },
          ],
        },
      ],
    };

    if (language === "de") return de;
    if (language === "en") return en;
    return es;
  }, [language]);

  const toc = useMemo(() => content.sections.map((s) => ({ id: s.id, title: s.title })), [content.sections]);

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{content.title}</h1>
            <p className="text-muted-foreground mt-1">{content.subtitle}</p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            {backLabel}
          </Button>
        </div>

        <div className="glass-card p-4">
          <div className="flex flex-wrap gap-2">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="text-sm px-3 py-1 rounded-full bg-secondary/40 hover:bg-secondary/60 transition-colors"
              >
                {item.title}
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {content.sections.map((section) => (
            <section key={section.id} id={section.id} className="glass-card p-6 scroll-mt-24">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm text-foreground/90">
                {section.body.map((block, idx) => {
                  if (typeof block === "string") {
                    return <p key={idx} className="leading-relaxed">{block}</p>;
                  }
                  return (
                    <div key={idx}>
                      <p className="font-medium">{block.label}</p>
                      <ul className="mt-2 space-y-1 list-disc pl-5 text-muted-foreground">
                        {block.items.map((it) => (
                          <li key={it} className="leading-relaxed">{it}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className={cn("text-xs text-muted-foreground text-center py-4")}>
          Trip Companion — Docs v1
        </div>
      </div>
    </MainLayout>
  );
}
