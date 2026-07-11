import { MainLayout } from "@/components/layout/MainLayout";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

type DocSection = { id: string; title: string; body: Array<string | { label: string; items: string[] }> };

/**
 * Documentación de Fahrtenbuch Pro — contenido INLINE en 3 idiomas.
 * Reescrita 2026-07-11 para reflejar el producto real (v13 del informe,
 * planes Free/Pro, extractor multimodal). Si cambias una función, actualiza
 * su sección aquí en LOS TRES idiomas.
 */
export default function Docs() {
  const { language } = useI18n();
  const navigate = useNavigate();

  const backLabel = useMemo(() => {
    if (language === "de") return "Zurück";
    if (language === "en") return "Back";
    return "Volver";
  }, [language]);

  const tourLabel = useMemo(() => {
    if (language === "de") return "Tour starten";
    if (language === "en") return "Start tour";
    return "Iniciar tutorial";
  }, [language]);

  const startTour = () => window.dispatchEvent(new CustomEvent("fb:start-tour"));

  const content = useMemo(() => {
    const es: { title: string; subtitle: string; sections: DocSection[] } = {
      title: "Documentación",
      subtitle: "Guía de Fahrtenbuch Pro: del callsheet al informe de Kilometergeld.",
      sections: [
        {
          id: "start",
          title: "Primeros pasos",
          body: [
            "Fahrtenbuch Pro organiza tus viajes de rodaje por proyecto y genera el informe de Kilometergeld listo para producción y para el fisco.",
            {
              label: "Antes de nada, completa tu perfil (Ajustes → Perfil)",
              items: [
                "Tarifa por km (€/km): sin ella no se calculan los importes.",
                "Dirección base: con ella el origen y el destino de cada viaje se rellenan solos y la distancia se calcula automáticamente.",
                "Recargo por pasajero (€/km), matrícula y datos del coche (consumo y precios, para el CO₂ y el margen).",
              ],
            },
            "El panel te avisará con un banner si falta la tarifa o la dirección base.",
          ],
        },
        {
          id: "trips",
          title: "Viajes",
          body: [
            "Crea viajes a mano con \"Añadir viaje\" o genera muchos de golpe subiendo callsheets con IA (siguiente sección).",
            {
              label: "Al crear un viaje",
              items: [
                "El origen y el destino parten de tu dirección base; escribe el destino (elige la sugerencia o sal del campo) y la distancia se calcula sola con Google Maps.",
                "Modos \"Continuación\" (el origen es el destino del viaje anterior) y \"Regreso\" (el destino es tu base).",
                "Hasta 25 paradas por viaje, arrastrables para reordenar.",
                "Pasajeros: su suplemento se muestra SIEMPRE separado del kilometraje, también en el informe.",
                "Gastos por viaje: peaje, parking, combustible y otros — van al informe como líneas propias.",
                "Tarifa propia por viaje (opcional): manda sobre la del proyecto y la del perfil.",
              ],
            },
            "Al borrar un viaje se eliminan también sus documentos y callsheets asociados (archivos incluidos). Si el proyecto se queda sin viajes, el proyecto y sus documentos se eliminan también. No hay papelera.",
          ],
        },
        {
          id: "callsheets",
          title: "Callsheets con IA",
          body: [
            "En Viajes → \"Carga masiva\" sube callsheets en PDF o foto (JPG, PNG, WebP, HEIC). La IA extrae la fecha, el proyecto, la productora y las localizaciones de rodaje, y te las presenta para revisar antes de guardar nada.",
            {
              label: "Cómo saca las direcciones",
              items: [
                "Solo cuenta el lugar de rodaje (Motiv/Set/Location); los puntos de encuentro y parkings se descartan.",
                "Si el callsheet trae enlaces de Google Maps, son la fuente preferida: apuntan al pin exacto.",
                "Puedes cancelar una extracción en curso desde el propio modal.",
              ],
            },
            {
              label: "Cuotas de IA",
              items: [
                "Gratuito: 3 callsheets al mes, hasta 3 por subida.",
                "Pro: 60 al mes, hasta 20 por subida.",
                "Pro además permite usar tu propia clave de OpenRouter y elegir el modelo de IA (cualquier modelo multimodal del catálogo).",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Proyectos",
          body: [
            "El proyecto es la carpeta que lo contiene todo: sus viajes, sus callsheets y sus gastos de proyecto (facturas no ligadas a un viaje concreto).",
            {
              label: "Detalles útiles",
              items: [
                "La productora se fija sola desde la primera extracción y se hereda a los viajes del proyecto.",
                "Cada proyecto puede tener su propia tarifa €/km (manda sobre la del perfil).",
                "Los estados de los callsheets (procesando, revisar, error, sin cuota) se ven en el detalle del proyecto.",
              ],
            },
            "Borrar un proyecto elimina sus viajes, callsheets y documentos, con sus archivos. Igual que con los viajes: no hay papelera.",
          ],
        },
        {
          id: "reports",
          title: "Informes",
          body: [
            "En Informes eliges proyecto y rango de fechas (al elegir un proyecto, el rango se ajusta solo a sus viajes) y generas el informe.",
            {
              label: "El informe",
              items: [
                "La tabla lleva sus totales integrados: viajes, km, CO₂ (opcional) e importes.",
                "El importe de cada viaje es SOLO km × tarifa; el suplemento por pasajeros va como línea separada del resumen — o únelo al kilometraje con el interruptor \"Unir suplemento\".",
                "\"Contenido del informe\": la columna de CO₂ y el bloque de firma son opcionales; el pie \"Creado con Fahrtenbuch Pro\" siempre está.",
                "El PDF sale en alemán por defecto (es para producción/Finanzamt) y también en inglés o español.",
                "Exporta PDF, CSV/Excel o un ZIP con el PDF y los recibos adjuntos; puedes guardar informes para reabrirlos.",
              ],
            },
          ],
        },
        {
          id: "co2",
          title: "CO₂",
          body: [
            "El CO₂ de cada viaje se calcula con la distancia y el consumo configurado de tu coche (factores oficiales tanque-a-rueda; para eléctricos, el mix eléctrico).",
            "En el panel lo ves como total mensual con su equivalencia en árboles; en el informe, como columna opcional.",
          ],
        },
        {
          id: "calendar",
          title: "Calendario",
          body: [
            "Conecta tu Google Calendar para ver tus eventos junto a tus viajes y crear viajes a partir de un evento con un clic.",
          ],
        },
        {
          id: "plans",
          title: "Planes",
          body: [
            "Gratuito: viajes, proyectos e informes ilimitados + 3 extracciones IA al mes. Para organizarte y probar el flujo completo.",
            "Pro: 60 extracciones al mes, lotes de 20, y tu propia clave de OpenRouter. Mensual sin permanencia o anual con descuento — ideal si acumulas los callsheets y los vuelcas de golpe.",
          ],
        },
        {
          id: "troubleshooting",
          title: "Solución de problemas",
          body: [
            {
              label: "La distancia no se calcula sola",
              items: [
                "Comprueba en Ajustes que tienes tarifa por km y dirección base.",
                "Confirma el destino: elige una sugerencia del desplegable o sal del campo (Tab). También tienes el botón de calcular junto a la distancia.",
              ],
            },
            {
              label: "Un callsheet quedó en \"Revisar\", \"Error\" o \"Sin cuota\"",
              items: [
                "Revisar: la IA no estuvo segura de algo; ábrelo en el proyecto y confirma los datos.",
                "Error: suele ser un PDF ilegible o una foto borrosa; sube una versión mejor.",
                "Sin cuota: se acabaron las extracciones del mes — espera al siguiente o pasa a Pro.",
              ],
            },
            {
              label: "Los importes no cuadran con lo que esperaba",
              items: [
                "El importe por viaje es solo kilometraje; pasajeros y gastos van en líneas separadas del informe.",
                "Si un viaje tiene tarifa propia, esa manda sobre la del proyecto y la del perfil.",
              ],
            },
          ],
        },
      ],
    };

    const en: typeof es = {
      title: "Documentation",
      subtitle: "Fahrtenbuch Pro guide: from callsheet to mileage report.",
      sections: [
        {
          id: "start",
          title: "Getting started",
          body: [
            "Fahrtenbuch Pro organizes your shoot trips by project and generates the mileage report ready for production and the tax office.",
            {
              label: "First, complete your profile (Settings → Profile)",
              items: [
                "Rate per km (€/km): without it, amounts can't be calculated.",
                "Base address: with it, origin and destination fill in automatically and the distance is computed for you.",
                "Passenger surcharge (€/km), license plate, and car data (consumption and prices, for CO₂ and margin).",
              ],
            },
            "The dashboard shows a banner if the rate or base address is missing.",
          ],
        },
        {
          id: "trips",
          title: "Trips",
          body: [
            "Create trips manually with \"Add trip\", or generate many at once by uploading callsheets with AI (next section).",
            {
              label: "When creating a trip",
              items: [
                "Origin and destination start from your base address; type the destination (pick a suggestion or leave the field) and the distance is computed via Google Maps.",
                "\"Continuation\" mode (origin = previous trip's destination) and \"Return\" mode (destination = your base).",
                "Up to 25 stops per trip, draggable to reorder.",
                "Passengers: their surcharge is ALWAYS shown separately from mileage, in the report too.",
                "Per-trip expenses: toll, parking, fuel and other — they appear as their own lines in the report.",
                "Optional per-trip rate: overrides the project's and the profile's.",
              ],
            },
            "Deleting a trip also removes its attached documents and callsheets (files included). If the project ends up with no trips, the project and its documents are removed too. There is no trash bin.",
          ],
        },
        {
          id: "callsheets",
          title: "Callsheets with AI",
          body: [
            "In Trips → \"Bulk upload\", upload callsheets as PDF or photo (JPG, PNG, WebP, HEIC). The AI extracts the date, project, production company and shooting locations, and shows everything for review before saving.",
            {
              label: "How it picks addresses",
              items: [
                "Only the shooting location counts (Motiv/Set/Location); meeting points and parking are discarded.",
                "If the callsheet contains Google Maps links, they are the preferred source: they point to the exact pin.",
                "You can cancel a running extraction from the modal.",
              ],
            },
            {
              label: "AI quotas",
              items: [
                "Free: 3 callsheets per month, up to 3 per upload.",
                "Pro: 60 per month, up to 20 per upload.",
                "Pro also lets you use your own OpenRouter key and choose the AI model (any multimodal model in the catalog).",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Projects",
          body: [
            "The project is the folder that contains everything: its trips, its callsheets and its project expenses (invoices not tied to a specific trip).",
            {
              label: "Useful details",
              items: [
                "The production company is set automatically from the first extraction and inherited by the project's trips.",
                "Each project can have its own €/km rate (overrides the profile's).",
                "Callsheet states (processing, review, error, out of quota) are visible in the project detail.",
              ],
            },
            "Deleting a project removes its trips, callsheets and documents, files included. Same as trips: no trash bin.",
          ],
        },
        {
          id: "reports",
          title: "Reports",
          body: [
            "In Reports, pick a project and date range (choosing a project auto-adjusts the range to its trips) and generate the report.",
            {
              label: "The report",
              items: [
                "The table carries its own totals: trips, km, CO₂ (optional) and amounts.",
                "Each trip's amount is ONLY km × rate; the passenger surcharge is a separate summary line — or merge it into mileage with the \"Merge surcharge\" switch.",
                "\"Report contents\": the CO₂ column and the signature block are optional; the \"Created with Fahrtenbuch Pro\" footer is always there.",
                "The PDF defaults to German (it's for production/tax office) and is also available in English and Spanish.",
                "Export PDF, CSV/Excel or a ZIP with the PDF plus attached receipts; you can save reports to reopen them.",
              ],
            },
          ],
        },
        {
          id: "co2",
          title: "CO₂",
          body: [
            "Each trip's CO₂ is computed from the distance and your configured car consumption (official tank-to-wheel factors; for EVs, the electricity mix).",
            "The dashboard shows it as a monthly total with its tree equivalence; in the report, as an optional column.",
          ],
        },
        {
          id: "calendar",
          title: "Calendar",
          body: [
            "Connect your Google Calendar to see your events next to your trips and create trips from an event in one click.",
          ],
        },
        {
          id: "plans",
          title: "Plans",
          body: [
            "Free: unlimited trips, projects and reports + 3 AI extractions per month. To get organized and try the full flow.",
            "Pro: 60 extractions per month, batches of 20, and your own OpenRouter key. Monthly with no commitment, or annual with a discount — ideal if you pile up callsheets and dump them all at once.",
          ],
        },
        {
          id: "troubleshooting",
          title: "Troubleshooting",
          body: [
            {
              label: "Distance doesn't calculate automatically",
              items: [
                "Check that Settings has your rate per km and base address.",
                "Confirm the destination: pick a suggestion from the dropdown or leave the field (Tab). There's also a calculate button next to the distance.",
              ],
            },
            {
              label: "A callsheet ended in \"Review\", \"Error\" or \"Out of quota\"",
              items: [
                "Review: the AI wasn't sure about something; open it in the project and confirm the data.",
                "Error: usually an unreadable PDF or a blurry photo; upload a better version.",
                "Out of quota: this month's extractions are used up — wait for next month or upgrade to Pro.",
              ],
            },
            {
              label: "Amounts don't match what I expected",
              items: [
                "The per-trip amount is mileage only; passengers and expenses are separate lines in the report.",
                "If a trip has its own rate, it overrides the project's and the profile's.",
              ],
            },
          ],
        },
      ],
    };

    const de: typeof es = {
      title: "Dokumentation",
      subtitle: "Fahrtenbuch Pro: vom Callsheet zur Kilometergeld-Abrechnung.",
      sections: [
        {
          id: "start",
          title: "Erste Schritte",
          body: [
            "Fahrtenbuch Pro organisiert deine Drehfahrten nach Projekt und erstellt die Kilometergeld-Abrechnung fertig für Produktion und Finanzamt.",
            {
              label: "Zuerst das Profil vervollständigen (Einstellungen → Profil)",
              items: [
                "Satz pro km (€/km): ohne ihn können keine Beträge berechnet werden.",
                "Basisadresse: mit ihr füllen sich Start und Ziel von selbst und die Distanz wird automatisch berechnet.",
                "Mitfahrer-Zuschlag (€/km), Kennzeichen und Fahrzeugdaten (Verbrauch und Preise, für CO₂ und Marge).",
              ],
            },
            "Das Dashboard zeigt einen Hinweis, wenn Satz oder Basisadresse fehlen.",
          ],
        },
        {
          id: "trips",
          title: "Fahrten",
          body: [
            "Lege Fahrten manuell mit \"Fahrt hinzufügen\" an oder erzeuge viele auf einmal per Callsheet-Upload mit KI (nächster Abschnitt).",
            {
              label: "Beim Anlegen einer Fahrt",
              items: [
                "Start und Ziel gehen von deiner Basisadresse aus; tippe das Ziel (Vorschlag wählen oder Feld verlassen) und die Distanz wird über Google Maps berechnet.",
                "Modus \"Fortsetzung\" (Start = Ziel der vorherigen Fahrt) und \"Rückfahrt\" (Ziel = deine Basis).",
                "Bis zu 25 Stopps pro Fahrt, per Drag & Drop sortierbar.",
                "Mitfahrer: ihr Zuschlag wird IMMER getrennt vom Kilometergeld ausgewiesen, auch im Bericht.",
                "Ausgaben pro Fahrt: Maut, Parken, Kraftstoff und Sonstiges — eigene Zeilen im Bericht.",
                "Optionaler Satz pro Fahrt: geht vor Projekt- und Profilsatz.",
              ],
            },
            "Beim Löschen einer Fahrt werden auch ihre Dokumente und Callsheets entfernt (inklusive Dateien). Bleibt das Projekt ohne Fahrten, werden Projekt und Dokumente ebenfalls gelöscht. Es gibt keinen Papierkorb.",
          ],
        },
        {
          id: "callsheets",
          title: "Callsheets mit KI",
          body: [
            "Unter Fahrten → \"Massen-Upload\" lädst du Callsheets als PDF oder Foto (JPG, PNG, WebP, HEIC) hoch. Die KI extrahiert Datum, Projekt, Produktionsfirma und Drehorte und zeigt alles zur Prüfung, bevor gespeichert wird.",
            {
              label: "Wie Adressen erkannt werden",
              items: [
                "Nur der Drehort zählt (Motiv/Set/Location); Treffpunkte und Parkplätze werden verworfen.",
                "Enthält das Callsheet Google-Maps-Links, sind sie die bevorzugte Quelle: sie zeigen auf den exakten Pin.",
                "Eine laufende Extraktion kannst du im Modal abbrechen.",
              ],
            },
            {
              label: "KI-Kontingente",
              items: [
                "Gratis: 3 Callsheets pro Monat, bis zu 3 pro Upload.",
                "Pro: 60 pro Monat, bis zu 20 pro Upload.",
                "Pro erlaubt zudem den eigenen OpenRouter-Schlüssel mit frei wählbarem KI-Modell (jedes multimodale Modell im Katalog).",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Projekte",
          body: [
            "Das Projekt ist der Ordner, der alles enthält: seine Fahrten, seine Callsheets und seine Projektausgaben (Rechnungen ohne konkrete Fahrt).",
            {
              label: "Nützliche Details",
              items: [
                "Die Produktionsfirma wird automatisch aus der ersten Extraktion gesetzt und an die Fahrten vererbt.",
                "Jedes Projekt kann einen eigenen €/km-Satz haben (geht vor dem Profilsatz).",
                "Callsheet-Status (in Arbeit, prüfen, Fehler, ohne Kontingent) siehst du im Projektdetail.",
              ],
            },
            "Das Löschen eines Projekts entfernt seine Fahrten, Callsheets und Dokumente samt Dateien. Wie bei Fahrten: kein Papierkorb.",
          ],
        },
        {
          id: "reports",
          title: "Berichte",
          body: [
            "Unter Berichte wählst du Projekt und Zeitraum (bei Projektwahl passt sich der Zeitraum automatisch an) und erzeugst den Bericht.",
            {
              label: "Der Bericht",
              items: [
                "Die Tabelle trägt ihre Summen selbst: Fahrten, km, CO₂ (optional) und Beträge.",
                "Der Betrag jeder Fahrt ist NUR km × Satz; der Mitfahrer-Zuschlag ist eine eigene Zeile — oder rechne ihn mit dem Schalter \"Zuschlag einrechnen\" ins Kilometergeld ein.",
                "\"Berichtsinhalt\": CO₂-Spalte und Unterschriftsblock sind optional; die Fußzeile \"Erstellt mit Fahrtenbuch Pro\" ist immer dabei.",
                "Das PDF ist standardmäßig Deutsch (für Produktion/Finanzamt) und auch auf Englisch und Spanisch verfügbar.",
                "Exportiere PDF, CSV/Excel oder ein ZIP mit PDF plus Belegen; Berichte lassen sich speichern und wieder öffnen.",
              ],
            },
          ],
        },
        {
          id: "co2",
          title: "CO₂",
          body: [
            "Das CO₂ jeder Fahrt wird aus Distanz und konfiguriertem Verbrauch berechnet (offizielle Tank-to-Wheel-Faktoren; bei E-Autos der Strommix).",
            "Im Dashboard als Monatssumme mit Baum-Äquivalent; im Bericht als optionale Spalte.",
          ],
        },
        {
          id: "calendar",
          title: "Kalender",
          body: [
            "Verbinde deinen Google Kalender, um Termine neben deinen Fahrten zu sehen und aus einem Termin mit einem Klick eine Fahrt zu erstellen.",
          ],
        },
        {
          id: "plans",
          title: "Pläne",
          body: [
            "Gratis: unbegrenzte Fahrten, Projekte und Berichte + 3 KI-Extraktionen pro Monat. Zum Organisieren und Ausprobieren des ganzen Flows.",
            "Pro: 60 Extraktionen pro Monat, Uploads zu 20, und eigener OpenRouter-Schlüssel. Monatlich ohne Bindung oder jährlich mit Rabatt — ideal, wenn du Callsheets sammelst und alles auf einmal hochlädst.",
          ],
        },
        {
          id: "troubleshooting",
          title: "Fehlerbehebung",
          body: [
            {
              label: "Die Distanz wird nicht automatisch berechnet",
              items: [
                "Prüfe in den Einstellungen, ob Satz pro km und Basisadresse gesetzt sind.",
                "Bestätige das Ziel: Vorschlag aus der Liste wählen oder das Feld verlassen (Tab). Neben der Distanz gibt es auch einen Berechnen-Button.",
              ],
            },
            {
              label: "Ein Callsheet steht auf \"Prüfen\", \"Fehler\" oder \"Ohne Kontingent\"",
              items: [
                "Prüfen: die KI war sich unsicher; im Projekt öffnen und die Daten bestätigen.",
                "Fehler: meist ein unlesbares PDF oder ein unscharfes Foto; bessere Version hochladen.",
                "Ohne Kontingent: die Extraktionen des Monats sind verbraucht — auf den nächsten Monat warten oder auf Pro wechseln.",
              ],
            },
            {
              label: "Beträge entsprechen nicht der Erwartung",
              items: [
                "Der Betrag pro Fahrt ist nur Kilometergeld; Mitfahrer und Ausgaben sind eigene Zeilen im Bericht.",
                "Hat eine Fahrt einen eigenen Satz, geht er vor Projekt- und Profilsatz.",
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
      <div className="max-w-[1800px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{content.title}</h1>
            <p className="text-muted-foreground mt-1">{content.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={startTour}>{tourLabel}</Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              {backLabel}
            </Button>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex flex-wrap gap-2">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="text-sm px-3 py-1 rounded-chip bg-secondary/40 hover:bg-secondary/60 transition-colors"
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
          Fahrtenbuch Pro · fahrtenbuchpro.com
        </div>
      </div>
    </MainLayout>
  );
}
