import { MainLayout } from "@/components/layout/MainLayout";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

type DocSection = { id: string; title: string; body: Array<string | { label: string; items: string[] }> };

/**
 * Documentación de Fahrtenbuch Pro — contenido INLINE en 3 idiomas.
 * Ampliada 2026-07-11 (2ª pasada): 11 secciones con el inventario completo
 * de funciones (panel, viajes, callsheets IA, proyectos, informes, CO₂,
 * calendario, planes, ajustes, problemas). Si cambias una función,
 * actualiza su sección aquí en LOS TRES idiomas.
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
      subtitle: "Guía completa de Fahrtenbuch Pro: del callsheet al informe de Kilometergeld.",
      sections: [
        {
          id: "start",
          title: "Primeros pasos",
          body: [
            "Fahrtenbuch Pro organiza tus viajes de rodaje por proyecto y genera el informe de Kilometergeld listo para producción y para el fisco. Entra con tu cuenta de Google o con email y contraseña (con recuperación si la olvidas).",
            {
              label: "Antes de nada, completa tu perfil (Ajustes → Perfil)",
              items: [
                "Tarifa por km (€/km): sin ella no se calculan los importes.",
                "Dirección base (con ciudad y país): con ella el origen y el destino de cada viaje se rellenan solos, la distancia se calcula automáticamente y funcionan la importación del calendario y los modos de ruta.",
                "Recargo por pasajero (€/km), matrícula y NIF/UID: salen en la cabecera del informe.",
                "Datos del coche (tipo de combustible y consumo): activan el CO₂ y el margen neto del panel.",
              ],
            },
            "El panel te avisará con un banner si falta la tarifa o la dirección base.",
            "La primera vez que entras, un tutorial interactivo te lleva de visita guiada por la app en 12 pasos. Puedes repetirlo cuando quieras: botón \"Iniciar tutorial\" aquí arriba o en Ajustes → Ayuda y docs. El formulario de añadir viaje tiene además su propio tutorial (el botón ? junto al título).",
          ],
        },
        {
          id: "dashboard",
          title: "Panel de control",
          body: [
            "El panel resume tu mes de un vistazo y concentra los accesos rápidos: \"Subir callsheet\" y \"Añadir viaje\" desde la cabecera.",
            {
              label: "Qué muestra",
              items: [
                "Cuatro tarjetas del mes con comparación contra el mes anterior: € a facturar, kilómetros, viajes y CO₂.",
                "Contador de callsheets IA: cuántas extracciones llevas del mes y cuándo se renueva la cuota (el día 1).",
                "Campana \"Necesita tu atención\": callsheets fallidas o pendientes de revisión y advertencias de viajes (sin proyecto, distancia 0 o improbable, sin motivo). Cada línea te lleva al lugar donde se arregla.",
                "Margen neto de tu coche: lo facturado menos el coste estimado del coche. Necesita consumo y precios en Ajustes.",
                "% de uso profesional: tus km de trabajo frente a los km totales anuales del coche (introdúcelos en Ajustes, de la factura del taller o la ITV). Útil para el fisco.",
                "Últimos 6 meses (barras de km y €) y la lista de viajes recientes.",
              ],
            },
            "Los primeros días del mes aparece un banner \"Informe de {mes} listo\" para generar el PDF del mes anterior con un clic.",
          ],
        },
        {
          id: "trips",
          title: "Viajes",
          body: [
            "Crea viajes a mano con \"Añadir viaje\" o genera muchos de golpe subiendo callsheets con \"Carga masiva\" (siguiente sección).",
            {
              label: "Al crear o editar un viaje",
              items: [
                "El origen y el destino parten de tu dirección base; escribe el destino (elige la sugerencia o sal del campo) y la distancia se calcula sola con Google Maps.",
                "Hasta 25 paradas por viaje, arrastrables para reordenar.",
                "Tres modos de ruta: salida desde tu base, \"Continuar desde el último destino\" (encadena viajes de un mismo día) y \"Regresar a mi dirección base\".",
                "Proyecto: búscalo o créalo sin salir del campo (\"Crear …\" / \"Usar … como cliente\").",
                "Pasajeros: su suplemento se muestra SIEMPRE separado del kilometraje, también en el informe.",
                "Tarifa propia por viaje (opcional): manda sobre la del proyecto y la del perfil.",
                "Motivo: rellénalo — el checklist del informe avisa si falta.",
                "Si ya existe un viaje con la misma fecha y ruta, la app te avisa antes de crear un duplicado.",
              ],
            },
            {
              label: "Gastos por viaje",
              items: [
                "Peaje, parking, combustible y otros: introduce el importe en EUR y adjunta la foto del recibo (cámara o archivo, se puede rotar). Van al informe como líneas propias y el recibo entra en el ZIP de documentación.",
                "Recibos extranjeros (CZK/HUF): introduce el importe ya convertido a EUR.",
                "Litros o kWh del viaje (opcional): afinan el cálculo de CO₂ y de costes.",
              ],
            },
            {
              label: "La tabla de viajes",
              items: [
                "Filtros por proyecto y año, orden por fecha, y \"Cargar más\" a partir de 10 filas.",
                "Selección múltiple con casillas para borrar en lote.",
                "Menú de cada fila (⋮): Ver mapa, Añadir al calendario, Editar y Eliminar.",
                "Clic en la fila = detalle del viaje: desglose de costes, pestaña Mapa con la ruta en Google Maps y pestaña Documento con vista previa, descarga y adjuntos.",
              ],
            },
            "Al borrar un viaje se eliminan también sus documentos y callsheets asociados (archivos incluidos). Si el proyecto se queda sin viajes, el proyecto y sus documentos se eliminan también. No hay papelera.",
          ],
        },
        {
          id: "callsheets",
          title: "Callsheets con IA",
          body: [
            "En Viajes → \"Carga masiva\" sube callsheets en PDF o foto (JPG, PNG, WebP, HEIC). La IA extrae la fecha, el proyecto, la productora y las localizaciones de rodaje, y te las presenta para revisar antes de guardar nada. También puedes subir callsheets dentro de una carpeta de proyecto (\"Subir hojas de llamada\") y lanzar \"Extraer datos con IA\" desde ahí.",
            {
              label: "Cómo saca las direcciones",
              items: [
                "Solo cuenta el lugar de rodaje (Motiv/Set/Location); los puntos de encuentro y parkings se descartan.",
                "Si el callsheet trae enlaces de Google Maps, son la fuente preferida: apuntan al pin exacto.",
                "Puedes cancelar una extracción en curso desde el propio modal.",
              ],
            },
            {
              label: "Estados y revisión",
              items: [
                "Procesando → Completado: revisa los viajes propuestos y pulsa \"Guardar N viajes\" (o \"Descartar todos\").",
                "\"Revisar\": la IA no está segura de algún dato (p. ej. la fecha) — confírmalo tú.",
                "\"Error\": suele ser un PDF ilegible o una foto borrosa; \"Volver a procesar\" con una versión mejor.",
                "\"Límite agotado\": se acabó la cuota del mes.",
                "Si un viaje propuesto ya existe (misma fecha y ruta), se salta y se te avisa: sin duplicados.",
              ],
            },
            {
              label: "Cuotas de IA",
              items: [
                "Gratuito: 3 extracciones al mes, lotes de hasta 3 archivos.",
                "Pro: 60 extracciones al mes, lotes de hasta 20 archivos y procesamiento en paralelo.",
                "Pro además puede usar su propia clave de OpenRouter y elegir casi cualquier modelo multimodal (Ajustes → APIs).",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Proyectos",
          body: [
            "Cada producción es una carpeta: contiene sus viajes, callsheets, documentos y facturas, y hereda la productora. Los viajes creados desde un callsheet caen automáticamente en su proyecto.",
            {
              label: "La página de proyectos",
              items: [
                "Búsqueda por nombre y filtros por productora y año; selección múltiple para borrar en lote.",
                "La tabla muestra por proyecto: viajes, distancia total, CO₂, documentos/callsheets, facturas y reembolso acumulado.",
                "Marca con la estrella tus proyectos destacados.",
              ],
            },
            {
              label: "Dentro de la carpeta (Ver detalles)",
              items: [
                "Estadísticas: kilómetros totales, días de rodaje, km por día y CO₂ estimado.",
                "Hojas de llamada: sube hasta 20, extrae datos con IA, reprocesa o cancela; los viajes guardados quedan vinculados al callsheet.",
                "Documentos y facturas del proyecto (las facturas adjuntadas a un viaje se gestionan desde ese viaje).",
                "Tarifas propias del proyecto (€/km y €/pasajero): las heredan todos sus viajes, salvo que un viaje tenga tarifa propia.",
              ],
            },
            "Borrar un proyecto elimina en cascada todos sus viajes, callsheets, documentos y archivos. Y al revés: si borras el último viaje de un proyecto, el proyecto entero (con sus documentos) desaparece. No hay papelera.",
          ],
        },
        {
          id: "reports",
          title: "Informes",
          body: [
            "En Informes → \"Generar nuevo informe\" eliges proyecto (o todos), y el período: mes y año, o un rango libre desde–hasta.",
            {
              label: "Antes de generar",
              items: [
                "Un checklist automático revisa los viajes del período y avisa de problemas típicos: distancia 0 o improbable y motivo vacío. Puedes corregirlos o continuar.",
              ],
            },
            {
              label: "En la vista del informe",
              items: [
                "Los totales viven dentro de la tabla, con el número de viajes en la etiqueta (\"Summe (12 Fahrten)\").",
                "El suplemento de pasajeros va SIEMPRE separado del kilometraje; si la producción lo quiere unido, activa \"Unir suplemento de pasajeros al kilometraje\" — el total no cambia.",
                "Menú \"Contenido del informe\": columna de CO₂ y bloque de firma, opcionales.",
                "La tarifa por km y la matrícula salen en la cabecera; los gastos de los viajes aparecen como líneas propias.",
                "\"Idioma del PDF\" es independiente del idioma de la app: entrega el informe en alemán a una producción alemana aunque uses la app en español.",
              ],
            },
            {
              label: "Exportar y guardar",
              items: [
                "PDF (el formato para producción y Finanzamt), CSV para hojas de cálculo e imprimir directamente.",
                "\"Descargar ZIP con documentación\" (Pro): el informe junto a todos los recibos y callsheets del período, listo para adjuntar a un email.",
                "\"Guardar\" añade el informe a la lista de Informes para volver a abrirlo o exportarlo más tarde.",
              ],
            },
            "Todos los PDF llevan el pie \"Creado con Fahrtenbuch Pro\".",
          ],
        },
        {
          id: "co2",
          title: "CO₂",
          body: [
            "El CO₂ se calcula con factores estáticos citados (metodología tanque-a-rueda) y el consumo real de tu coche configurado en Ajustes. Para eléctricos se usa la intensidad media anual de la red de tu país (AT/DE/CZ/HU).",
            {
              label: "Dónde aparece",
              items: [
                "En el panel: CO₂ del mes con equivalencia en árboles (~21 kg CO₂ por árbol y año).",
                "Por proyecto y por viaje, y como columna opcional del informe (menú \"Contenido del informe\").",
                "Litros o kWh reales introducidos en un viaje afinan el cálculo de ese viaje.",
              ],
            },
            "Las fuentes exactas de los factores están citadas en Ajustes → Perfil (sección de emisiones).",
          ],
        },
        {
          id: "calendar",
          title: "Calendario",
          body: [
            "Conecta tu Google Calendar (\"Conectar Google\" en la página Calendario) y la sincronización funciona en las dos direcciones.",
            {
              label: "Del calendario a Fahrtenbuch Pro (evento → viaje)",
              items: [
                "Haz clic en un evento y elige \"Importar como viaje\": la ruta se monta sola como ida y vuelta desde tu dirección base hasta la ubicación del evento, y la distancia se calcula con Google Maps.",
                "El viaje cae en un proyecto \"Unknown\" con el título del evento como productora — muévelo luego al proyecto correcto si quieres.",
                "Necesita tu dirección base completa en el perfil (dirección, ciudad y país) y que el evento tenga ubicación.",
              ],
            },
            {
              label: "De Fahrtenbuch Pro al calendario (viaje → evento)",
              items: [
                "En la tabla de Viajes, abre el menú de la fila (⋮) y elige \"Añadir al calendario\": se crea un evento en tu Google Calendar el día del viaje, con el proyecto en el título, el destino como ubicación y la ruta con los km en la descripción.",
              ],
            },
            "Además puedes activar varios calendarios con sus interruptores y crear eventos de Google desde la propia app (botón \"Crear evento\" o clic en un día).",
          ],
        },
        {
          id: "plans",
          title: "Planes",
          body: [
            "Gratuito: viajes, proyectos e informes ilimitados + 3 extracciones IA al mes (lotes de 3). Para organizarte y probar el flujo completo.",
            "Pro: 60 extracciones al mes, lotes de 20, ZIP de documentación en los informes y tu propia clave de OpenRouter con el modelo multimodal que prefieras. Mensual sin permanencia o anual con descuento — ideal si acumulas los callsheets y los vuelcas de golpe.",
          ],
        },
        {
          id: "settings",
          title: "Ajustes",
          body: [
            "Todo lo configurable vive en Ajustes (rueda dentada de la barra lateral).",
            {
              label: "Pestañas",
              items: [
                "Perfil: tus datos (nombre, NIF/UID, matrícula, tarifa, recargo por pasajero, dirección base) — son los que salen en el informe — y el vehículo (combustible, consumo, red eléctrica) para CO₂ y margen. Al final está la eliminación de cuenta (borra TODO de forma permanente).",
                "APIs y servicios: la IA del servidor viene incluida; OpenRouter propio (Pro) con selector de modelos multimodales; conectar/desconectar Google Calendar.",
                "Personalización: imagen de fondo propia o preestablecida, opacidad de la interfaz y desenfoques.",
                "Idioma: español, inglés o alemán — cambia toda la app al instante (el PDF del informe tiene su propio selector).",
                "Novedades: versión y changelog. Ayuda y docs: esta documentación, el tutorial interactivo y el contacto de soporte.",
              ],
            },
          ],
        },
        {
          id: "troubleshooting",
          title: "Solución de problemas",
          body: [
            {
              label: "La distancia no se calcula",
              items: [
                "Comprueba que tu dirección base está completa en Ajustes → Perfil (dirección, ciudad y país).",
                "Escribe el destino y elige una sugerencia o sal del campo (tabulador o clic fuera); ahí se dispara el cálculo.",
                "Si editaste a mano las direcciones, usa el botón de calcular junto al campo de distancia.",
              ],
            },
            {
              label: "Un callsheet está en \"Revisar\", \"Error\" o \"Límite agotado\"",
              items: [
                "Revisar: la IA no estaba segura; abre el proyecto y confirma los datos.",
                "Error: suele ser un PDF ilegible o una foto borrosa; sube una versión mejor y reprocesa.",
                "Límite agotado: se acabaron las extracciones del mes — espera al día 1 o pásate a Pro.",
              ],
            },
            {
              label: "Los importes no cuadran con lo que esperaba",
              items: [
                "El importe por viaje es solo kilometraje; pasajeros y gastos van como líneas separadas en el informe.",
                "Prioridad de tarifas: la del viaje manda sobre la del proyecto, y esta sobre la del perfil.",
              ],
            },
            {
              label: "La importación desde el calendario falla",
              items: [
                "Necesita tu dirección base completa y que el evento tenga ubicación.",
                "Si Google avisa de permisos insuficientes, desconecta y vuelve a conectar el calendario.",
              ],
            },
            {
              label: "El margen del coche o el % de uso profesional no aparecen",
              items: [
                "Faltan datos del coche en Ajustes: consumo y precios para el margen; km totales anuales para el % de uso.",
              ],
            },
            {
              label: "Quiero volver a ver el tutorial",
              items: [
                "Ajustes → Ayuda y docs → \"Iniciar tutorial\", o el botón de arriba de esta página.",
              ],
            },
          ],
        },
      ],
    };

    const en: { title: string; subtitle: string; sections: DocSection[] } = {
      title: "Documentation",
      subtitle: "The complete Fahrtenbuch Pro guide: from callsheet to Kilometergeld report.",
      sections: [
        {
          id: "start",
          title: "Getting started",
          body: [
            "Fahrtenbuch Pro organizes your shooting-day trips by project and generates the Kilometergeld report, ready for production and the tax office. Sign in with your Google account or with email and password (with recovery if you forget it).",
            {
              label: "First of all, complete your profile (Settings → Profile)",
              items: [
                "Rate per km (€/km): without it no amounts are calculated.",
                "Base address (with city and country): with it the origin and destination of every trip are pre-filled, the distance is calculated automatically, and calendar import and route modes work.",
                "Passenger surcharge (€/km), license plate and VAT ID: they appear in the report header.",
                "Car data (fuel type and consumption): they enable CO₂ and the net margin on the dashboard.",
              ],
            },
            "The dashboard will warn you with a banner if the rate or the base address is missing.",
            "The first time you sign in, an interactive tour walks you through the app in 12 steps. Replay it anytime: \"Start tour\" button above, or Settings → Help & docs. The add-trip form also has its own tutorial (the ? button next to its title).",
          ],
        },
        {
          id: "dashboard",
          title: "Dashboard",
          body: [
            "The dashboard sums up your month at a glance and holds the quick actions: \"Upload call sheet\" and \"Add trip\" in the header.",
            {
              label: "What it shows",
              items: [
                "Four cards for the month, compared with the previous one: € to invoice, kilometres, trips and CO₂.",
                "AI callsheet counter: how many extractions you've used this month and when the quota renews (the 1st).",
                "The \"Needs your attention\" bell: failed or review-pending callsheets plus trip warnings (no project, zero or unlikely distance, missing purpose). Each line takes you to where it's fixed.",
                "Your car's net margin: what you invoiced minus the car's estimated cost. Needs consumption and prices in Settings.",
                "Professional-use %: your work km against the car's total yearly km (enter them in Settings, from the garage bill or the inspection). Useful for the tax office.",
                "Last 6 months (km and € bars) and the recent trips list.",
              ],
            },
            "During the first days of each month a \"Report ready\" banner lets you generate last month's PDF in one click.",
          ],
        },
        {
          id: "trips",
          title: "Trips",
          body: [
            "Create trips by hand with \"Add trip\" or generate many at once by uploading callsheets with \"Bulk upload\" (next section).",
            {
              label: "When creating or editing a trip",
              items: [
                "Origin and destination start from your base address; type the destination (pick the suggestion or leave the field) and the distance is calculated automatically with Google Maps.",
                "Up to 25 stops per trip, draggable to reorder.",
                "Three route modes: leave from your base, \"Continue from the last destination\" (chains same-day trips) and \"Return to my base address\".",
                "Project: search it or create it right in the field (\"Create …\" / \"Use … as client\").",
                "Passengers: their surcharge is ALWAYS shown separate from the mileage, in the report too.",
                "Per-trip rate (optional): overrides the project's and the profile's.",
                "Purpose: fill it in — the report checklist warns if it's missing.",
                "If a trip with the same date and route already exists, the app warns you before creating a duplicate.",
              ],
            },
            {
              label: "Per-trip expenses",
              items: [
                "Toll, parking, fuel and others: enter the amount in EUR and attach the receipt photo (camera or file, rotatable). They appear as their own lines in the report and the receipt goes into the documentation ZIP.",
                "Foreign receipts (CZK/HUF): enter the amount already converted to EUR.",
                "Litres or kWh for the trip (optional): they refine CO₂ and cost calculations.",
              ],
            },
            {
              label: "The trips table",
              items: [
                "Filters by project and year, date sorting, and \"Load more\" past 10 rows.",
                "Multi-select with checkboxes for bulk deleting.",
                "Row menu (⋮): View map, Add to calendar, Edit and Delete.",
                "Click the row for the trip detail: cost breakdown, a Map tab with the route on Google Maps and a Document tab with preview, download and attachments.",
              ],
            },
            "Deleting a trip also removes its documents and linked callsheets (files included). If the project is left with no trips, the project and its documents are removed too. There is no trash bin.",
          ],
        },
        {
          id: "callsheets",
          title: "Callsheets with AI",
          body: [
            "In Trips → \"Bulk upload\", upload callsheets as PDF or photo (JPG, PNG, WebP, HEIC). The AI extracts the date, project, production company and shooting locations, and presents them for review before saving anything. You can also upload callsheets inside a project folder (\"Upload call sheets\") and run \"Extract data with AI\" from there.",
            {
              label: "How it picks addresses",
              items: [
                "Only the shooting location counts (Motiv/Set/Location); meeting points and parkings are discarded.",
                "If the callsheet contains Google Maps links, they are the preferred source: they point at the exact pin.",
                "You can cancel a running extraction from the modal itself.",
              ],
            },
            {
              label: "States and review",
              items: [
                "Processing → Done: review the proposed trips and press \"Save N trips\" (or \"Discard all\").",
                "\"Review\": the AI is unsure about something (e.g. the date) — confirm it yourself.",
                "\"Error\": usually an unreadable PDF or a blurry photo; \"Reprocess\" with a better version.",
                "\"Out of quota\": this month's quota is used up.",
                "If a proposed trip already exists (same date and route), it's skipped and you're told: no duplicates.",
              ],
            },
            {
              label: "AI quotas",
              items: [
                "Free: 3 extractions per month, batches of up to 3 files.",
                "Pro: 60 extractions per month, batches of up to 20 files and parallel processing.",
                "Pro can also use its own OpenRouter key and pick almost any multimodal model (Settings → APIs).",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Projects",
          body: [
            "Each production is a folder: it holds its trips, callsheets, documents and invoices, and passes down the production company. Trips created from a callsheet land in their project automatically.",
            {
              label: "The projects page",
              items: [
                "Search by name and filters by producer and year; multi-select for bulk deleting.",
                "The table shows per project: trips, total distance, CO₂, documents/callsheets, invoices and accumulated reimbursement.",
                "Star your favourite projects.",
              ],
            },
            {
              label: "Inside the folder (View details)",
              items: [
                "Stats: total kilometres, shooting days, km per day and estimated CO₂.",
                "Call sheets: upload up to 20, extract data with AI, reprocess or cancel; saved trips stay linked to their callsheet.",
                "Project documents and invoices (invoices attached to a trip are managed from that trip).",
                "Project rates (€/km and €/passenger): all its trips inherit them, unless a trip has its own rate.",
              ],
            },
            "Deleting a project cascades: all its trips, callsheets, documents and files go with it. And the other way round: deleting a project's last trip removes the whole project (documents included). There is no trash bin.",
          ],
        },
        {
          id: "reports",
          title: "Reports",
          body: [
            "In Reports → \"Generate new report\" you pick a project (or all) and the period: month and year, or a free from–to range.",
            {
              label: "Before generating",
              items: [
                "An automatic checklist scans the period's trips and warns about typical issues: zero or unlikely distances and missing purposes. Fix them or continue.",
              ],
            },
            {
              label: "In the report view",
              items: [
                "Totals live inside the table, with the trip count in the label (\"Summe (12 Fahrten)\").",
                "The passenger surcharge is ALWAYS separate from the mileage; if the production wants it merged, switch on \"Merge passenger surcharge into mileage\" — the total doesn't change.",
                "\"Report contents\" menu: CO₂ column and signature block, both optional.",
                "The rate per km and the license plate appear in the header; trip expenses appear as their own lines.",
                "\"PDF language\" is independent from the app language: hand a German report to a German production while using the app in English.",
              ],
            },
            {
              label: "Export and save",
              items: [
                "PDF (the format for production and the tax office), CSV for spreadsheets, and direct printing.",
                "\"Download ZIP with documentation\" (Pro): the report together with all the period's receipts and callsheets, ready to attach to an email.",
                "\"Save\" adds the report to the Reports list to reopen or re-export it later.",
              ],
            },
            "Every PDF carries the \"Created with Fahrtenbuch Pro\" footer.",
          ],
        },
        {
          id: "co2",
          title: "CO₂",
          body: [
            "CO₂ is calculated with cited static factors (tank-to-wheel methodology) and your car's real consumption from Settings. For EVs, the yearly average grid intensity of your country (AT/DE/CZ/HU) is used.",
            {
              label: "Where it appears",
              items: [
                "On the dashboard: the month's CO₂ with a tree equivalence (~21 kg CO₂ per tree per year).",
                "Per project and per trip, and as an optional report column (\"Report contents\" menu).",
                "Real litres or kWh entered on a trip refine that trip's number.",
              ],
            },
            "The exact factor sources are cited in Settings → Profile (emissions section).",
          ],
        },
        {
          id: "calendar",
          title: "Calendar",
          body: [
            "Connect your Google Calendar (\"Connect Google\" on the Calendar page) and the sync works in both directions.",
            {
              label: "From the calendar into Fahrtenbuch Pro (event → trip)",
              items: [
                "Click an event and choose \"Import as trip\": the route is built automatically as a round trip from your base address to the event's location, and the distance is calculated with Google Maps.",
                "The trip lands in an \"Unknown\" project with the event title as the production company — move it to the right project later if you like.",
                "Requires your complete base address in the profile (address, city and country) and a location on the event.",
              ],
            },
            {
              label: "From Fahrtenbuch Pro into the calendar (trip → event)",
              items: [
                "In the Trips table, open the row menu (⋮) and choose \"Add to calendar\": an event is created in your Google Calendar on the trip's date, with the project in the title, the destination as the location and the route with the km in the description.",
              ],
            },
            "You can also enable several calendars with their switches and create Google events right from the app (\"Create event\" button or clicking a day).",
          ],
        },
        {
          id: "plans",
          title: "Plans",
          body: [
            "Free: unlimited trips, projects and reports + 3 AI extractions per month (batches of 3). To get organized and try the full flow.",
            "Pro: 60 extractions per month, batches of 20, the documentation ZIP on reports, and your own OpenRouter key with the multimodal model you prefer. Monthly with no commitment, or annual with a discount — ideal if you pile up callsheets and dump them all at once.",
          ],
        },
        {
          id: "settings",
          title: "Settings",
          body: [
            "Everything configurable lives in Settings (the gear in the sidebar).",
            {
              label: "Tabs",
              items: [
                "Profile: your data (name, VAT ID, license plate, rate, passenger surcharge, base address) — the ones printed on the report — and the vehicle (fuel, consumption, grid) for CO₂ and margin. Account deletion is at the bottom (removes EVERYTHING permanently).",
                "APIs & services: server AI is included; your own OpenRouter (Pro) with a multimodal model picker; connect/disconnect Google Calendar.",
                "Personalization: your own or preset background image, UI opacity and blur.",
                "Language: Spanish, English or German — switches the whole app instantly (the report PDF has its own selector).",
                "News: version and changelog. Help & docs: this documentation, the interactive tour and support contact.",
              ],
            },
          ],
        },
        {
          id: "troubleshooting",
          title: "Troubleshooting",
          body: [
            {
              label: "The distance isn't calculated",
              items: [
                "Check that your base address is complete in Settings → Profile (address, city and country).",
                "Type the destination and pick a suggestion or leave the field (tab or click away); that's what triggers the calculation.",
                "If you hand-edited the addresses, use the calculate button next to the distance field.",
              ],
            },
            {
              label: "A callsheet shows \"Review\", \"Error\" or \"Out of quota\"",
              items: [
                "Review: the AI was unsure; open the project and confirm the data.",
                "Error: usually an unreadable PDF or a blurry photo; upload a better version and reprocess.",
                "Out of quota: this month's extractions are used up — wait for the 1st or upgrade to Pro.",
              ],
            },
            {
              label: "Amounts don't match what I expected",
              items: [
                "The per-trip amount is mileage only; passengers and expenses are separate lines in the report.",
                "Rate priority: the trip's rate beats the project's, which beats the profile's.",
              ],
            },
            {
              label: "Calendar import fails",
              items: [
                "It needs your complete base address and a location on the event.",
                "If Google reports insufficient permissions, disconnect and reconnect the calendar.",
              ],
            },
            {
              label: "Car margin or professional-use % don't show up",
              items: [
                "Car data is missing in Settings: consumption and prices for the margin; total yearly km for the usage %.",
              ],
            },
            {
              label: "I want to see the tour again",
              items: [
                "Settings → Help & docs → \"Start tour\", or the button at the top of this page.",
              ],
            },
          ],
        },
      ],
    };

    const de: { title: string; subtitle: string; sections: DocSection[] } = {
      title: "Dokumentation",
      subtitle: "Der komplette Fahrtenbuch-Pro-Leitfaden: vom Callsheet zum Kilometergeld-Bericht.",
      sections: [
        {
          id: "start",
          title: "Erste Schritte",
          body: [
            "Fahrtenbuch Pro organisiert deine Drehtag-Fahrten nach Projekt und erstellt den Kilometergeld-Bericht — fertig für Produktion und Finanzamt. Melde dich mit deinem Google-Konto oder mit E-Mail und Passwort an (mit Wiederherstellung, falls du es vergisst).",
            {
              label: "Zuallererst: Profil vervollständigen (Einstellungen → Profil)",
              items: [
                "Kilometersatz (€/km): ohne ihn werden keine Beträge berechnet.",
                "Basisadresse (mit Stadt und Land): mit ihr füllen sich Start und Ziel jeder Fahrt von selbst, die Distanz wird automatisch berechnet, und Kalender-Import und Routenmodi funktionieren.",
                "Mitfahrer-Zuschlag (€/km), Kennzeichen und UID: sie erscheinen im Berichtskopf.",
                "Fahrzeugdaten (Kraftstoffart und Verbrauch): sie aktivieren CO₂ und die Netto-Marge am Dashboard.",
              ],
            },
            "Das Dashboard warnt dich mit einem Banner, wenn Satz oder Basisadresse fehlen.",
            "Beim ersten Anmelden führt dich eine interaktive Tour in 12 Schritten durch die App. Jederzeit wiederholbar: Button \"Tour starten\" oben oder Einstellungen → Hilfe & Docs. Das Fahrt-Formular hat zusätzlich ein eigenes Tutorial (der ?-Button neben dem Titel).",
          ],
        },
        {
          id: "dashboard",
          title: "Dashboard",
          body: [
            "Das Dashboard fasst deinen Monat auf einen Blick zusammen und bündelt die Schnellaktionen: \"Callsheet hochladen\" und \"Fahrt hinzufügen\" im Kopfbereich.",
            {
              label: "Was es zeigt",
              items: [
                "Vier Monatskarten im Vergleich zum Vormonat: € zu fakturieren, Kilometer, Fahrten und CO₂.",
                "KI-Callsheet-Zähler: wie viele Extraktionen du diesen Monat verbraucht hast und wann das Kontingent sich erneuert (am 1.).",
                "Die Glocke \"Braucht deine Aufmerksamkeit\": fehlgeschlagene oder zu prüfende Callsheets plus Fahrt-Warnungen (ohne Projekt, Distanz 0 oder unplausibel, ohne Zweck). Jede Zeile führt dorthin, wo es sich beheben lässt.",
                "Netto-Marge deines Autos: Fakturiertes minus geschätzte Autokosten. Braucht Verbrauch und Preise in den Einstellungen.",
                "Beruflicher Nutzungsanteil: deine Arbeits-km gegen die Jahres-km des Autos (in den Einstellungen eintragen, von Werkstattrechnung oder Pickerl). Nützlich fürs Finanzamt.",
                "Letzte 6 Monate (km- und €-Balken) und die Liste der letzten Fahrten.",
              ],
            },
            "In den ersten Tagen des Monats erscheint ein Banner \"Bericht fertig\", um das PDF des Vormonats mit einem Klick zu erstellen.",
          ],
        },
        {
          id: "trips",
          title: "Fahrten",
          body: [
            "Lege Fahrten von Hand mit \"Fahrt hinzufügen\" an oder erzeuge viele auf einmal per Callsheet-Upload mit \"Massenimport\" (nächster Abschnitt).",
            {
              label: "Beim Anlegen oder Bearbeiten einer Fahrt",
              items: [
                "Start und Ziel gehen von deiner Basisadresse aus; tippe das Ziel (Vorschlag wählen oder Feld verlassen) und die Distanz berechnet sich automatisch über Google Maps.",
                "Bis zu 25 Stopps pro Fahrt, per Ziehen umsortierbar.",
                "Drei Routenmodi: Abfahrt von der Basis, \"Vom letzten Ziel fortsetzen\" (verkettet Fahrten eines Tages) und \"Zurück zu meiner Basisadresse\".",
                "Projekt: direkt im Feld suchen oder anlegen (\"… erstellen\" / \"… als Kunde verwenden\").",
                "Mitfahrer: ihr Zuschlag wird IMMER getrennt vom Kilometergeld gezeigt, auch im Bericht.",
                "Eigener Satz pro Fahrt (optional): geht vor Projekt- und Profilsatz.",
                "Zweck: ausfüllen — die Checkliste des Berichts warnt, wenn er fehlt.",
                "Existiert schon eine Fahrt mit gleichem Datum und gleicher Route, warnt die App vor dem Duplikat.",
              ],
            },
            {
              label: "Ausgaben pro Fahrt",
              items: [
                "Maut, Parken, Kraftstoff und Sonstiges: Betrag in EUR eintragen und Belegfoto anhängen (Kamera oder Datei, drehbar). Sie erscheinen als eigene Zeilen im Bericht, der Beleg wandert ins Dokumentations-ZIP.",
                "Ausländische Belege (CZK/HUF): Betrag bereits in EUR umgerechnet eintragen.",
                "Liter oder kWh der Fahrt (optional): verfeinern CO₂- und Kostenrechnung.",
              ],
            },
            {
              label: "Die Fahrten-Tabelle",
              items: [
                "Filter nach Projekt und Jahr, Sortierung nach Datum, \"Mehr laden\" ab 10 Zeilen.",
                "Mehrfachauswahl mit Checkboxen zum Löschen im Stapel.",
                "Zeilenmenü (⋮): Karte ansehen, Zum Kalender hinzufügen, Bearbeiten und Löschen.",
                "Klick auf die Zeile = Fahrtdetail: Kostenaufstellung, Karten-Tab mit der Route auf Google Maps und Dokument-Tab mit Vorschau, Download und Anhängen.",
              ],
            },
            "Beim Löschen einer Fahrt werden auch ihre Dokumente und verknüpften Callsheets entfernt (Dateien inklusive). Bleibt das Projekt ohne Fahrten, werden Projekt und Dokumente ebenfalls gelöscht. Es gibt keinen Papierkorb.",
          ],
        },
        {
          id: "callsheets",
          title: "Callsheets mit KI",
          body: [
            "Unter Fahrten → \"Massenimport\" lädst du Callsheets als PDF oder Foto hoch (JPG, PNG, WebP, HEIC). Die KI extrahiert Datum, Projekt, Produktionsfirma und Drehorte und legt sie dir zur Prüfung vor, bevor irgendetwas gespeichert wird. Callsheets lassen sich auch im Projektordner hochladen (\"Callsheets hochladen\") und dort mit \"Daten mit KI extrahieren\" verarbeiten.",
            {
              label: "Wie sie Adressen auswählt",
              items: [
                "Nur der Drehort zählt (Motiv/Set/Location); Treffpunkte und Parkplätze werden verworfen.",
                "Enthält das Callsheet Google-Maps-Links, sind sie die bevorzugte Quelle: Sie zeigen auf den exakten Pin.",
                "Eine laufende Extraktion kannst du direkt im Modal abbrechen.",
              ],
            },
            {
              label: "Status und Prüfung",
              items: [
                "In Bearbeitung → Fertig: die vorgeschlagenen Fahrten prüfen und \"N Fahrten speichern\" drücken (oder \"Alle verwerfen\").",
                "\"Prüfen\": die KI ist sich bei etwas unsicher (z. B. beim Datum) — bestätige es selbst.",
                "\"Fehler\": meist ein unlesbares PDF oder ein unscharfes Foto; mit besserer Version neu verarbeiten.",
                "\"Ohne Kontingent\": das Monatskontingent ist aufgebraucht.",
                "Existiert eine vorgeschlagene Fahrt schon (gleiches Datum, gleiche Route), wird sie übersprungen und du wirst informiert: keine Duplikate.",
              ],
            },
            {
              label: "KI-Kontingente",
              items: [
                "Gratis: 3 Extraktionen pro Monat, Uploads zu maximal 3 Dateien.",
                "Pro: 60 Extraktionen pro Monat, Uploads zu maximal 20 Dateien und parallele Verarbeitung.",
                "Pro kann außerdem den eigenen OpenRouter-Schlüssel nutzen und fast jedes multimodale Modell wählen (Einstellungen → APIs).",
              ],
            },
          ],
        },
        {
          id: "projects",
          title: "Projekte",
          body: [
            "Jede Produktion ist ein Ordner: Er enthält ihre Fahrten, Callsheets, Dokumente und Rechnungen und vererbt die Produktionsfirma. Aus Callsheets erzeugte Fahrten landen automatisch in ihrem Projekt.",
            {
              label: "Die Projektseite",
              items: [
                "Suche nach Name, Filter nach Produktionsfirma und Jahr; Mehrfachauswahl zum Löschen im Stapel.",
                "Die Tabelle zeigt pro Projekt: Fahrten, Gesamtdistanz, CO₂, Dokumente/Callsheets, Rechnungen und kumulierte Erstattung.",
                "Markiere deine wichtigsten Projekte mit dem Stern.",
              ],
            },
            {
              label: "Im Ordner (Details ansehen)",
              items: [
                "Statistiken: Gesamtkilometer, Drehtage, km pro Drehtag und geschätztes CO₂.",
                "Callsheets: bis zu 20 hochladen, Daten mit KI extrahieren, neu verarbeiten oder abbrechen; gespeicherte Fahrten bleiben mit ihrem Callsheet verknüpft.",
                "Projektdokumente und -rechnungen (an eine Fahrt angehängte Rechnungen werden bei der Fahrt verwaltet).",
                "Projektsätze (€/km und €/Mitfahrer): alle Fahrten erben sie — außer eine Fahrt hat einen eigenen Satz.",
              ],
            },
            "Ein Projekt zu löschen kaskadiert: alle Fahrten, Callsheets, Dokumente und Dateien gehen mit. Und umgekehrt: Löschst du die letzte Fahrt eines Projekts, verschwindet das ganze Projekt (Dokumente inklusive). Es gibt keinen Papierkorb.",
          ],
        },
        {
          id: "reports",
          title: "Berichte",
          body: [
            "Unter Berichte → \"Neuen Bericht erstellen\" wählst du Projekt (oder alle) und den Zeitraum: Monat und Jahr oder einen freien Von–Bis-Bereich.",
            {
              label: "Vor dem Erstellen",
              items: [
                "Eine automatische Checkliste prüft die Fahrten des Zeitraums und warnt vor typischen Problemen: Distanz 0 oder unplausibel, fehlender Zweck. Beheben oder weitermachen.",
              ],
            },
            {
              label: "In der Berichtsansicht",
              items: [
                "Die Summen stehen in der Tabelle selbst, mit der Fahrtenzahl im Label (\"Summe (12 Fahrten)\").",
                "Der Mitfahrer-Zuschlag ist IMMER vom Kilometergeld getrennt; will die Produktion ihn vereint, aktiviere \"Mitfahrer-Zuschlag ins Kilometergeld einrechnen\" — die Summe ändert sich nicht.",
                "Menü \"Berichtsinhalt\": CO₂-Spalte und Unterschriftsblock, beide optional.",
                "Kilometersatz und Kennzeichen stehen im Kopf; Fahrtausgaben erscheinen als eigene Zeilen.",
                "\"PDF-Sprache\" ist unabhängig von der App-Sprache: liefere einer deutschen Produktion den Bericht auf Deutsch, auch wenn du die App auf Spanisch nutzt.",
              ],
            },
            {
              label: "Exportieren und speichern",
              items: [
                "PDF (das Format für Produktion und Finanzamt), CSV für Tabellenkalkulationen und direktes Drucken.",
                "\"ZIP mit Dokumentation herunterladen\" (Pro): der Bericht zusammen mit allen Belegen und Callsheets des Zeitraums — fertig für den E-Mail-Anhang.",
                "\"Speichern\" legt den Bericht in der Berichtsliste ab, um ihn später wieder zu öffnen oder zu exportieren.",
              ],
            },
            "Jedes PDF trägt die Fußzeile \"Erstellt mit Fahrtenbuch Pro\".",
          ],
        },
        {
          id: "co2",
          title: "CO₂",
          body: [
            "CO₂ wird mit zitierten statischen Faktoren (Tank-to-Wheel-Methodik) und dem realen Verbrauch deines Autos aus den Einstellungen berechnet. Bei E-Autos zählt die Jahresdurchschnitts-Intensität des Stromnetzes deines Landes (AT/DE/CZ/HU).",
            {
              label: "Wo es erscheint",
              items: [
                "Am Dashboard: das Monats-CO₂ mit Baum-Äquivalenz (~21 kg CO₂ pro Baum und Jahr).",
                "Pro Projekt und pro Fahrt, und als optionale Berichtsspalte (Menü \"Berichtsinhalt\").",
                "Real eingetragene Liter oder kWh einer Fahrt verfeinern deren Wert.",
              ],
            },
            "Die genauen Quellen der Faktoren sind in Einstellungen → Profil (Emissionsbereich) zitiert.",
          ],
        },
        {
          id: "calendar",
          title: "Kalender",
          body: [
            "Verbinde deinen Google Kalender (\"Google verbinden\" auf der Kalender-Seite) — die Synchronisation funktioniert in beide Richtungen.",
            {
              label: "Vom Kalender in Fahrtenbuch Pro (Termin → Fahrt)",
              items: [
                "Klicke einen Termin an und wähle \"Als Fahrt importieren\": Die Route wird automatisch als Hin- und Rückfahrt von deiner Basisadresse zum Ort des Termins gebaut, die Distanz berechnet Google Maps.",
                "Die Fahrt landet in einem \"Unknown\"-Projekt mit dem Termintitel als Produktionsfirma — verschiebe sie später ins richtige Projekt, wenn du magst.",
                "Braucht deine vollständige Basisadresse im Profil (Adresse, Stadt und Land) und einen Ort am Termin.",
              ],
            },
            {
              label: "Von Fahrtenbuch Pro in den Kalender (Fahrt → Termin)",
              items: [
                "Öffne in der Fahrten-Tabelle das Zeilenmenü (⋮) und wähle \"Zum Kalender hinzufügen\": In deinem Google Kalender entsteht ein Termin am Tag der Fahrt — Projekt im Titel, Ziel als Ort, Route mit km in der Beschreibung.",
              ],
            },
            "Außerdem kannst du mehrere Kalender per Schalter aktivieren und Google-Termine direkt aus der App erstellen (\"Termin erstellen\" oder Klick auf einen Tag).",
          ],
        },
        {
          id: "plans",
          title: "Pläne",
          body: [
            "Gratis: unbegrenzte Fahrten, Projekte und Berichte + 3 KI-Extraktionen pro Monat (Uploads zu 3). Zum Organisieren und Ausprobieren des ganzen Flows.",
            "Pro: 60 Extraktionen pro Monat, Uploads zu 20, das Dokumentations-ZIP bei Berichten und dein eigener OpenRouter-Schlüssel mit dem multimodalen Modell deiner Wahl. Monatlich ohne Bindung oder jährlich mit Rabatt — ideal, wenn du Callsheets sammelst und alles auf einmal hochlädst.",
          ],
        },
        {
          id: "settings",
          title: "Einstellungen",
          body: [
            "Alles Konfigurierbare wohnt in den Einstellungen (Zahnrad in der Seitenleiste).",
            {
              label: "Tabs",
              items: [
                "Profil: deine Daten (Name, UID, Kennzeichen, Satz, Mitfahrer-Zuschlag, Basisadresse) — sie stehen im Bericht — und das Fahrzeug (Kraftstoff, Verbrauch, Netz) für CO₂ und Marge. Ganz unten die Kontolöschung (entfernt ALLES dauerhaft).",
                "APIs & Dienste: Server-KI ist inklusive; eigener OpenRouter (Pro) mit multimodaler Modellauswahl; Google Kalender verbinden/trennen.",
                "Personalisierung: eigenes oder vorgegebenes Hintergrundbild, UI-Deckkraft und Weichzeichner.",
                "Sprache: Spanisch, Englisch oder Deutsch — stellt die ganze App sofort um (das Berichts-PDF hat einen eigenen Wähler).",
                "Neuigkeiten: Version und Changelog. Hilfe & Docs: diese Dokumentation, die interaktive Tour und der Support-Kontakt.",
              ],
            },
          ],
        },
        {
          id: "troubleshooting",
          title: "Problemlösung",
          body: [
            {
              label: "Die Distanz wird nicht berechnet",
              items: [
                "Prüfe, ob deine Basisadresse in Einstellungen → Profil vollständig ist (Adresse, Stadt und Land).",
                "Tippe das Ziel und wähle einen Vorschlag oder verlasse das Feld (Tab oder Klick daneben); das löst die Berechnung aus.",
                "Hast du Adressen von Hand editiert, nutze den Berechnen-Button neben dem Distanzfeld.",
              ],
            },
            {
              label: "Ein Callsheet steht auf \"Prüfen\", \"Fehler\" oder \"Ohne Kontingent\"",
              items: [
                "Prüfen: die KI war sich unsicher; im Projekt öffnen und die Daten bestätigen.",
                "Fehler: meist ein unlesbares PDF oder ein unscharfes Foto; bessere Version hochladen und neu verarbeiten.",
                "Ohne Kontingent: die Extraktionen des Monats sind verbraucht — auf den 1. warten oder auf Pro wechseln.",
              ],
            },
            {
              label: "Beträge entsprechen nicht der Erwartung",
              items: [
                "Der Betrag pro Fahrt ist nur Kilometergeld; Mitfahrer und Ausgaben sind eigene Zeilen im Bericht.",
                "Satz-Priorität: der Satz der Fahrt schlägt den des Projekts, dieser den des Profils.",
              ],
            },
            {
              label: "Der Kalender-Import schlägt fehl",
              items: [
                "Er braucht deine vollständige Basisadresse und einen Ort am Termin.",
                "Meldet Google unzureichende Berechtigungen, trenne den Kalender und verbinde ihn neu.",
              ],
            },
            {
              label: "Auto-Marge oder Nutzungsanteil erscheinen nicht",
              items: [
                "Fahrzeugdaten fehlen in den Einstellungen: Verbrauch und Preise für die Marge; Jahres-km für den Nutzungsanteil.",
              ],
            },
            {
              label: "Ich will die Tour noch einmal sehen",
              items: [
                "Einstellungen → Hilfe & Docs → \"Tour starten\", oder der Button oben auf dieser Seite.",
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
