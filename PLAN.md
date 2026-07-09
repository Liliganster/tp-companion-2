# PLAN — Fahrtenbuch Pro

> Plan maestro de la nueva versión. Ejecutar por fases, en orden. Cada fase termina con algo usable.
> Origen: revisión completa de la app (julio 2026). Marca: **Fahrtenbuch Pro** · dominio **fahrtenbuchpro.com**.

## Visión

**Producto**: *"Callsheet hochladen. Kilometergeld-Abrechnung fertig."*
Para crew de cine **austríaco** (rodajes pueden cruzar a DE/CZ/HU: reglas austríacas, mapa europeo).
Un solo flujo: **callsheet → viajes → informe mensual → dinero**. Una sola IA: el extractor de callsheets.
El informe PDF que se entrega a producción es el producto visible y el vector de marketing.

**Regla de decisión**: si una tarea no mejora el extractor, el informe o el dashboard, o no recorta coste, no entra.

**Idiomas**: DE + EN son producto (calidad de cara al cliente). **ES se mantiene** — es el idioma de la propietaria (no habla DE/EN); no necesita pulido de marketing, solo existir. Claves i18n tipadas para detectar traducciones faltantes automáticamente.

**Métricas que importan** (instrumentar en Fase 6):
1. % de registrados que procesan su primer callsheet en 48 h (activación).
2. % que genera un segundo informe mensual (retención real).

---

## Fase 0 — Limpieza y cimientos ✦ estado: casi hecha

- [x] Borrar del repo (están versionados): `script.cjs`…`script11.cjs`, `temp.cjs`, `temp2.cjs`, `fix.js`, `fix.patch`, `lint_output.txt`, `build_*.log`, `patch_google_script.cjs`, `get_icon.cjs`, `CLEANUP_DEMO_DATA.js`, `audit-orphans.js`, `*.md.resolved`.
- [x] Mover a `docs/archive/` los documentos de auditoría puntuales de la raíz (`AUDITORIA_*.md`, `CODIGO_REVISION_ERRORES.md`, `UX_FEATURES_AUDIT.md`, etc.).
- [x] README real de Fahrtenbuch Pro (quitar plantilla Lovable con `REPLACE_WITH_PROJECT_ID`).
- [x] `package.json`: name `fahrtenbuch-pro`, versión 0.1.0.
- [x] Quitar el efecto de debug `forceConsoleError` de `src/App.tsx` (líneas ~70-77).
- [x] Marca decidida: Fahrtenbuch Pro / fahrtenbuchpro.com (considerar redirigir también el .at).
- [x] Callsheets de prueba: la propietaria ya las tiene.
- [ ] Anotar a mano el resultado esperado de cada callsheet (fecha, proyecto, localizaciones en orden, meeting points) → semilla del eval set de Fase 2. Primera muestra: "FUNDBOX_Dispo DT 4.pdf". *Plantilla e instrucciones listas en `docs/eval/`.*

**Hecho cuando**: repo limpio, build en verde, ≥10 callsheets anotadas.

## Fase 1 — Recorte: la app se hace pequeña ✦ estado: hecha (2026-07-08)

Todo es *ocultar y desconectar* (hibernar), no borrar. Reversible.

- [x] Quitar de menú/rutas (código queda hibernado): `Advanced`, `AdvancedRoutes`, `AdvancedCosts`, `AdvancedEmissions`, extracción IA de facturas (`invoice-worker`, `ProjectInvoiceUploader`) y de gastos (`ExpenseScanButton`), odómetro (página pública `/odometer-capture`, `OdometerSettingsSection`), integración Google Drive.
- [x] Recibos: se mantiene adjuntar foto + **importe manual en EUR** (convención documentada en el campo: recibos extranjeros en CZK/HUF se introducen ya convertidos).
- [x] Sustituir Climatiq + Electricity Maps por **tabla estática de factores de emisión** con fuente citada:
  - Combustible (física exacta): gasolina 2,31 kg CO₂/L, diésel 2,68 kg CO₂/L. Decidir y etiquetar metodología tanque-a-rueda vs pozo-a-rueda.
  - Red eléctrica (EV): media anual por país AT/DE/CZ/HU, fuente Umweltbundesamt/APG. Actualización manual anual.
  - La mayor precisión viene del consumo real del vehículo del usuario (ya está en el perfil), no de APIs.
- [x] **Árboles equivalentes: SE MANTIENE** (decisión de la propietaria). Cifra con fuente (~21-22 kg CO₂/árbol/año) y tooltip explicando el supuesto.
- [x] Simplificar planes a **Free / Pro** (free: viajes manuales ilimitados + 3 callsheets IA/mes). Simplificar `PlanContext`, `plans.ts`, `aiQuota`.
- [x] i18n: separar por idioma con carga perezosa; claves tipadas desde el idioma base; ES se queda.

**Hecho cuando**: navegación con 5-6 entradas, cero llamadas a Climatiq/ElectricityMaps, build y tests en verde.

## Fase 2 — Extractor ⭐ (el corazón del producto)

**Método**: primero el eval set, luego cada cambio se mide. Nada se fusiona sin pasar el eval.

- [ ] **Eval set + script de medición**: 20-30 callsheets reales anotadas (incluir 2-3 de rodajes DE/CZ/HU y alguna con productora solo como logo). Métrica: precisión/recall de localizaciones + acierto de fecha/proyecto. Objetivo: ≥95%. *Script HECHO; 5 anotadas.*
  **LÍNEA BASE (2026-07-09, 5 callsheets, sin geocoding): fecha 80% · proyecto 80% · loc recall 95% · loc precisión 95% · ~50s/callsheet.**
  **Tras quitar OCR + año por código: fecha 100% · proyecto 80% · loc 95/95 · ~11s/callsheet.** Pendientes medibles: la errata verbatim (Matiellistrasse) espera el campo de dirección corregida + resolución de enlaces Maps; el proyecto "Untitled Project" en FUNDBOX (nombre solo gráfico) es inestable entre corridas. Los fallos (todos en FUNDBOX DT 4) confirman empíricamente 3 hipótesis de esta fase: año inventado por la IA ("Tuesday, 19th Nov" → 2019), proyecto "Untitled Project" (nombre solo visual), y la errata verbatim "Matiellistrasse" sin campo de dirección corregida. ~50 s/callsheet, dominado por el OCR.
- [x] **Resolver enlaces Google Maps como fuente primaria** — hecho 2026-07-09 (`api/_utils/callsheetMapsLinks.ts` + integración en worker, 7 tests). El enlace de la línea del MOTIV se asocia por contexto, se resuelve por redirección (gratis, sin API) y gana al geocoding. Caso real REX: "1190, Wildgrubgasse" → pin exacto de "Mayer am Nussberg" vía Kahlenberger Str. Eval REX: 100% en todo.
- [x] **Quitar Tesseract/OCR** *(hecho 2026-07-09: texto nativo con pdf-parse del documento COMPLETO — el filtro valida contra lo mismo que ve la IA; 50s→11s por callsheet y desaparece el crash de Node/WASM)* (`api/_utils/ocr.ts`, llamada en `api/worker.ts` ~L419): Gemini lee el PDF nativamente. Resolver la contradicción del prompt: o recortar el PDF a N páginas antes de enviar, o validar contra texto completo. El filtro de alucinaciones hoy valida contra un texto (OCR 2 páginas) distinto del que ve la IA (PDF entero) → descarta extracciones correctas.
- [x] **Callsheets como imagen (JPG/PNG, foto de WhatsApp)** — hecho 2026-07-09: uploaders aceptan PDF/JPG/PNG/WebP/HEIC (`src/lib/callsheetMime.ts`, compartido cliente+servidor), ambos pipelines resuelven el mime real por la extensión de storage y las imágenes van directas a la IA sin pdf-parse (sin capa de texto → sin hints, y el filtro de alucinaciones no descarta nada, igual que con PDFs escaneados). Pendiente usuaria: añadir 2-3 callsheets en foto al eval set para medir este camino.
- [x] **Verbatim = evidencia; dirección geocodificable = campo aparte** — hecho 2026-07-09. Cada localización devuelve `addressCorrected` (solo erratas de nombre de calle + ciudad/CP si están impresos en el documento; nunca otro lugar). Guarda determinista en código: la corrección debe conservar todos los números del verbatim. `evidence_text` conserva el literal ("LABEL: dirección impresa"); `address_raw`/geocoding usan la corrección. Caso real resuelto: "Matiellistrasse 2" impreso → "Mattiellistraße 2, 1040 Wien". **Eval: localizaciones R100/P100** (fecha 100%, proyecto 67% — nombre solo-gráfico, mitigado por productora heredada).
- [x] **Arreglar/retirar la torre de regex**: bug confirmado — `LOGISTICS_KEYWORD_RE` contiene `\bessen\b` (Essen es una ciudad alemana), `\boffice\b`, `\bbüro\b`, `\bhotel\b`, `\bmeeting point\b`, `\btreffpunkt\b`… Hipótesis a probar con el eval: menos filtros + prompt claro (+ quizá modelo mejor que gemini-2.5-flash) > torre de heurísticas.
  **HECHO (2026-07-09, 2º intento — híbrido)**: el prompt mantiene el encuadre "solo rodaje" y devuelve {label, address}; `callsheetLabels.ts` descarta por etiqueta (BASIS/PARKEN/ÖFFIS/E-Tankstelle…), deduplica y filtra descriptores de escena sin dirección (sin dígitos/comas/palabras de calle); descartes auditados en callsheet_excluded_blocks. La torre `filterLogisticsLocations` queda jubilada. **Eval: R96/P96 — OBJETIVO ≥95% ALCANZADO** (fecha 100%; pendiente proyecto 67% por el nombre solo-gráfico de FUNDBOX).
  **Experimento medido y REVERTIDO (2026-07-09)**: contrato "devuelve TODO bloque {label, address} y el código filtra" → bajó de R100/P92 a R92/P78 con gemini-3.1-flash-lite. Causa: "todo bloque con dirección" invita a devolver indicaciones de transporte (ÖFFIS "Bim 38 bis Grinzing"), E-Tankstelle y pisos, muchas sin etiqueta; y cambia la forma de los textos rompiendo coincidencias. Próximo intento: HÍBRIDO — mantener el encuadre "solo rodaje" del prompt actual pero añadiendo `label` a cada localización devuelta (clasificar sin ampliar el universo), y clasificador estricto (solo etiquetas de rodaje conocidas).
- [x] **Solo el lugar principal de rodaje (Loc/Set/Motiv) es una localización** *(regla corregida por la propietaria 2026-07-09)*: meeting point/Parkplatz NO se extraen como localizaciones ni sustituyen la dirección — son a lo sumo información adjunta de su localización. Excluidos: base, parking, catering, lunch, production office, hospital, meeting points sueltos. **HECHO 2026-07-09**: prompt "solo rodaje" + clasificador por etiqueta (`callsheetLabels.ts`); medido R96/P96. La logística no se pierde: queda invisible en `callsheet_excluded_blocks` con su etiqueta (base para el futuro multi-crew: cast/catering/maske).
- [x] **Fecha sin año**: hecho 2026-07-09 (`api/_utils/callsheetDate.ts` + campos dateRaw/dateYearInDocument en el esquema; valida con el día de semana; 7 tests). Eval: fecha 80%→100%.
- [x] **Productora**: campo por proyecto, se fija una vez y se hereda en callsheets siguientes — hecho 2026-07-09. El campo `projects.producer` ya existía (editable en ProjectEditModal); ahora la primera extracción que la trae la FIJA en el proyecto (BulkUploadModal + ProjectDetailModal, best-effort) y las hojas sin productora la HEREDAN del proyecto para el propósito del viaje. Prompt ampliado: "puede aparecer solo como logotipo; léela de la imagen". Opcional, nunca bloquea. Eval sin regresión.
- [x] **Unificar los dos pipelines de extracción** *(deuda registrada al descubrir el duplicado)* — hecho 2026-07-09: `api/_utils/callsheetExtraction.ts` es la única implementación del núcleo; `api/worker.ts` y `/api/callsheets/process` solo traducen resultados a estados/HTTP. De la unificación salieron 3 arreglos (reintento tras interrupción ya no borra el job en /process, bug de precedencia en total_duration_ms, límite de 15MB también en /process).
- [x] **Localizaciones en orden de rodaje → un viaje multi-parada del día** — verificado 2026-07-09: ya es el comportamiento del flujo. Un viaje por callsheet con ruta base → localizaciones en el orden del documento → base; el prompt exige el orden de aparición y `optimizeCallsheetLocationsAndDistance` normaliza direcciones SIN reordenar.
- [x] **Geocoding**: hecho 2026-07-09 (`api/_utils/geocode.ts` + `googleCache.ts`, tests). Sesgo `region=at` + `language=de` en el geocoding del extractor (sesgo, NUNCA restricción — rodajes cruzan fronteras), "Ecke" → "&", el centinela "No location found" ya no se geocodifica (antes gastaba una llamada y podía devolver un lugar aleatorio). El "contexto del callsheet como segundo sesgo" quedó aparcado: los enlaces de Maps + region cubren los casos medidos.
- [x] **Caché de geocodificaciones y rutas en Supabase** — hecho 2026-07-09: tabla `google_api_cache` (migración `20260710000000`, añadida a rebuild.sql; **PENDIENTE pegarla en el SQL Editor**). Cachea el geocoding del worker y los endpoints `/api/google/geocode` y `/api/google/directions` (TTL 180 días geocodes / 30 días rutas; solo respuestas OK). Best-effort: sin la tabla todo sigue funcionando, solo que sin ahorro. Claves normalizadas (diacríticos, Ecke/&) para que la misma localización escrita distinto comparta entrada.

**Hecho cuando**: ≥95% en el eval set y coste de Maps por usuario en céntimos.

## Fase 3 — El informe del que se presume

- [x] Rediseño del PDF — hecho 2026-07-09 (`src/lib/reportPdf.ts`, ÚNICA implementación; antes vivía duplicada 2× dentro de ReportView). Cabecera freelancer (conductor, dirección, matrícula) + producción (proyecto, productora, Mitfahrer-Zuschlag); tabla fecha · ruta · propósito · (pasajeros) · km · €/km · importe con la tarifa POR VIAJE (el override del viaje manda — antes el informe ignoraba los overrides: bug de dinero); tabla de Auslagen (peaje/parking/combustible/otros) con nota "Belege im Anhang (ZIP-Export)"; total destacado (caja negra); línea de CO2 con fuente citada (Umweltbundesamt/JEC tank-to-wheel; Ember/OWID para red) + árboles equivalentes; línea de firma; números formateados por locale (1.234,56 €). **Idioma del PDF independiente de la UI: alemán por defecto**, selector DE/EN/ES en la vista. La vista en pantalla ganó el bloque resumen (total destacado + CO2). Odómetro fuera del informe (feature hibernada, gate FEATURES.odometer).
- [ ] Verificar que cubre lo que la Aufnahmeleitung necesita para pagar Kilometergeld (0,50 €/km oficial 2026). Validar formato con 2-3 pilotos. *Pendiente de decisión: semántica del Mitfahrer-Zuschlag (hoy se suma un importe fijo por pasajero y viaje; el oficial austríaco es por km) — validar con los pilotos.*
- [x] Pie discreto *"Erstellt mit Fahrtenbuch Pro · fahrtenbuchpro.com"* en todas las páginas + numeración "Seite n von N" → bucle viral.

**Hecho cuando**: un piloto entrega el informe a una producción real y no le piden cambios.

## Fase 4 — Dashboard

Rediseño de `src/pages/Index.tsx`. Regla: arriba todo es accionable, abajo todo es paisaje.

- [ ] **Cabecera**: saludo + botones "Subir callsheet" y "Añadir viaje". Fuera los chips crípticos de cuota.
- [ ] **Fila de 4 cifras planas**: **€ a facturar del mes** (primera, más grande, tendencia vs mes anterior), km, nº viajes, CO₂. Sin anillos, sin nota A-D.
- [ ] **Panel "Necesita tu atención"**: warnings de viajes (`trip-warnings.ts`), callsheets `failed`/`needs_review`, viajes sin proyecto. Cada línea clicable a su solución. Vacío = "Todo en orden". Sustituye al NotificationDropdown.
- [ ] **Tarjeta contextual de informe** (primeros días del mes): "Informe de [mes] listo · Generar PDF".
- [ ] **Contador de IA transparente** (decisión de la propietaria: SE MANTIENE visible): "Callsheets IA: 5/15 · se renueva el 1 de [mes]", barra de progreso, 3 estados (neutro / aviso ≥80% / agotado con opciones), clicable a Plan. **También en el modal de subida, antes de gastar.**
- [ ] Abajo: barras km/€ de 6 meses + últimos 5 viajes (`RecentTrips`).
- [ ] **Tarjeta "margen neto de tu coche"** (sustituto del odómetro): Kilometergeld facturado − coste real por km (tabla ÖAMTC estática por clase de vehículo + consumo y precio de combustible del perfil) = *"tu coche te dejó ~X € netos este mes"*. Sin fotos, sin IA.
- [ ] **% uso profesional (caso fiscal), versión manual**: un campo anual "km totales del coche" (de factura de taller/ITV) ÷ km profesionales registrados. El flujo QR+foto+IA del odómetro queda hibernado.

**Hecho cuando**: un usuario nuevo entiende el dashboard sin explicación y cada elemento superior lleva a una acción.

## Fase 5 — Solidez (en paralelo con Fase 6)

- [ ] Tests donde hay dinero/datos: cálculo de emisiones (`src/lib/emissions.ts`), totales del informe, `cascadeDelete.ts`, e2e "login → crear viaje → generar informe".
- [ ] Matar los `any` del núcleo: `TripsContext.tsx` (13), `geminiClient.ts` (9). Validar filas de Supabase con Zod (`schemas.ts`); considerar `supabase gen types`.
- [ ] Sustituir `xlsx` 0.18.5 (CVEs sin parche en npm) por export CSV o `exceljs`.
- [ ] `console.log` de `ProjectDetailModal.tsx` (~40) → `logger`.
- [ ] Trocear componentes gigantes SOLO de forma oportunista al tocarlos: `BulkUploadModal` (2.374 líneas), `ProjectDetailModal` (1.698), `AddTripModal` (1.407), `ReportView` (1.190), `CalendarPage` (1.094).
- [ ] Rutas: envolver con un layout route (`<RequireAuth><Outlet/></RequireAuth>`) en vez de 12 repeticiones.

**Hecho cuando**: tests cubren los flujos de dinero, typecheck sin `any` en el núcleo de datos.

## Fase 6 — Lanzamiento

- [ ] 10 pilotos usando la versión final un ciclo mensual completo; testimonios.
- [ ] Landing en alemán en fahrtenbuchpro.com: frase + vídeo 40s del flujo real + imagen del informe + precio (~8 €/mes o ~70 €/año; oferta fundacional primeros 50: precio congelado de por vida). Prueba gratis sin tarjeta.
- [ ] Pagos con **Paddle o Lemon Squeezy** (merchant of record → sin gestión de IVA europeo).
- [ ] Canales en orden: pilotos en el set con referido "un mes gratis para ambos" → grupos WhatsApp/Facebook de crew vienés → perfil en Crew United → conversaciones directas con Aufnahmeleiter (multiplicadores: reciben las hojas de km de todo el equipo).
- [ ] Estacionalidad: temporada de rodaje (primavera-otoño) = flujo mensual; enero-marzo = campaña fiscal "recupera el kilometraje del año pasado".
- [ ] Instrumentar las 2 métricas de activación/retención.

**Hecho cuando**: 50 registrados, ≥40% activación, primeros pagos.

---

## Aparcamiento v2 (no ejecutar sin demanda medida)

- Dietas por país (Tagesgeld/Nächtigungsgeld para días de rodaje en DE/CZ/HU — tarifas oficiales austríacas por país; diferenciador único).
- Odómetro QR+IA reactivado como feature de temporada fiscal (enero-abril).
- Extracción IA de facturas/gastos reactivada si los usuarios la piden.
- Informe B2B de transporte para green consultants (ecolabel UZ76 / requisitos ÖFI) — el comprador pasa a ser la productora.
- Licencia por producción (la productora paga, todo el crew la usa, la Aufnahmeleitung recibe informes homogéneos).
- Selector de divisa con conversión para recibos CZK/HUF.

## Decisiones registradas

| Decisión | Motivo |
|---|---|
| Marca: Fahrtenbuch Pro / fahrtenbuchpro.com | Elegida por la propietaria; término de búsqueda natural |
| ES se mantiene como idioma | La propietaria no habla DE/EN; es su consola de administración |
| Árboles equivalentes se mantienen | Atractivo confirmado; con fuente citada para ser defendible |
| Contador de IA visible | Transparencia = confianza; también en el punto de gasto |
| Odómetro hibernado, no borrado | Sustituido por margen ÖAMTC + lectura anual manual |
| Facturas IA hibernadas | Importe manual (5 seg) cubre el 90% del valor; una sola IA en v1 |
| Solo Austria = reglas y ventas, no geografía | Rodajes cruzan a DE/CZ/HU; geocoding sesgado, nunca restringido |
| Solo Loc/Set/Motiv son localizaciones | Corregido 2026-07-09: meeting point/Parkplatz no son destino ni regla, solo info adjunta |
| Con enlace de Maps, el enlace es la dirección de distancia | El nombre del motiv se conserva; sin enlace, se usa la dirección impresa del lugar de rodaje |
| Gemini Flash de base; modelo mejor solo si el eval lo justifica | Coste por callsheet es céntimos; precisión se mide, no se supone |
