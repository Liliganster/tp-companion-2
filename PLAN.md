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

## Fase 1 — Recorte: la app se hace pequeña

Todo es *ocultar y desconectar* (hibernar), no borrar. Reversible.

- [ ] Quitar de menú/rutas (código queda hibernado): `Advanced`, `AdvancedRoutes`, `AdvancedCosts`, `AdvancedEmissions`, extracción IA de facturas (`invoice-worker`, `ProjectInvoiceUploader`) y de gastos (`ExpenseScanButton`), odómetro (página pública `/odometer-capture`, `OdometerSettingsSection`), integración Google Drive.
- [ ] Recibos: se mantiene adjuntar foto + **importe manual en EUR** (convención documentada en el campo: recibos extranjeros en CZK/HUF se introducen ya convertidos).
- [ ] Sustituir Climatiq + Electricity Maps por **tabla estática de factores de emisión** con fuente citada:
  - Combustible (física exacta): gasolina 2,31 kg CO₂/L, diésel 2,68 kg CO₂/L. Decidir y etiquetar metodología tanque-a-rueda vs pozo-a-rueda.
  - Red eléctrica (EV): media anual por país AT/DE/CZ/HU, fuente Umweltbundesamt/APG. Actualización manual anual.
  - La mayor precisión viene del consumo real del vehículo del usuario (ya está en el perfil), no de APIs.
- [ ] **Árboles equivalentes: SE MANTIENE** (decisión de la propietaria). Cifra con fuente (~21-22 kg CO₂/árbol/año) y tooltip explicando el supuesto.
- [ ] Simplificar planes a **Free / Pro** (free: viajes manuales ilimitados + 3 callsheets IA/mes). Simplificar `PlanContext`, `plans.ts`, `aiQuota`.
- [ ] i18n: separar por idioma con carga perezosa; claves tipadas desde el idioma base; ES se queda.

**Hecho cuando**: navegación con 5-6 entradas, cero llamadas a Climatiq/ElectricityMaps, build y tests en verde.

## Fase 2 — Extractor ⭐ (el corazón del producto)

**Método**: primero el eval set, luego cada cambio se mide. Nada se fusiona sin pasar el eval.

- [ ] **Eval set + script de medición**: 20-30 callsheets reales anotadas (incluir 2-3 de rodajes DE/CZ/HU y alguna con productora solo como logo). Métrica: precisión/recall de localizaciones + acierto de fecha/proyecto. Objetivo: ≥95%.
- [ ] **Resolver enlaces Google Maps como fuente primaria** (mayor impacto). Hoy `MAPS_URL_RE` en `api/_utils/callsheetLocationHints.ts` los BORRA. Nuevo: si una localización tiene enlace `maps.app.goo.gl`/`google.com/maps`, resolverlo (seguir redirección → place/coords) y usarlo como verdad; el texto es la etiqueta. Ahorra geocoding y elimina errores.
- [ ] **Quitar Tesseract/OCR** (`api/_utils/ocr.ts`, llamada en `api/worker.ts` ~L419): Gemini lee el PDF nativamente. Resolver la contradicción del prompt: o recortar el PDF a N páginas antes de enviar, o validar contra texto completo. El filtro de alucinaciones hoy valida contra un texto (OCR 2 páginas) distinto del que ve la IA (PDF entero) → descarta extracciones correctas.
- [ ] **Verbatim = evidencia; dirección geocodificable = campo aparte.** Hoy el filtro castiga al modelo por corregir erratas (ej. real: callsheet dice "Matiellistrasse 2", la calle es Mattiellistraße 2, 1040 Wien → el filtro la descarta por no aparecer literal). Dos campos: `evidence_text` (literal) y dirección corregida/normalizada.
- [ ] **Arreglar/retirar la torre de regex**: bug confirmado — `LOGISTICS_KEYWORD_RE` contiene `\bessen\b` (Essen es una ciudad alemana), `\boffice\b`, `\bbüro\b`, `\bhotel\b`, `\bmeeting point\b`, `\btreffpunkt\b`… Hipótesis a probar con el eval: menos filtros + prompt claro (+ quizá modelo mejor que gemini-2.5-flash) > torre de heurísticas.
- [ ] **Meeting point / Parkplatz asociado a una localización = destino conducible del viaje** (el conductor no va al monumento en medio del parque; va al Parkplatz del meeting point). Extraer ambos. Siguen excluidos: lunch, production office, hospital.
- [ ] **Fecha sin año** ("Tuesday, 19th Nov"): el año lo infiere el CÓDIGO (el que acerque la fecha a la fecha de subida), no la IA. Validar con el día de semana si aparece.
- [ ] **Productora**: campo por proyecto, se fija una vez y se hereda en callsheets siguientes. Prompt: "puede aparecer solo como logotipo; léelo de la imagen". Opcional, nunca bloquea.
- [ ] **Localizaciones en orden de rodaje → un viaje multi-parada del día** (el modelo `route: string[]` de `TripsContext` ya lo soporta). Los horarios del callsheet dan el orden.
- [ ] **Geocoding**: sesgo `region=at` (sesgo, NUNCA restricción por país — rodajes cruzan fronteras), contexto del propio callsheet como segundo sesgo, normalizar "Ecke" → "&", no geocodificar el centinela "No location found".
- [ ] **Caché de geocodificaciones y rutas en Supabase** (clave: dirección normalizada / origen+destino). Los rodajes repiten localizaciones semanas → recorta 70-90% del mayor coste variable (Google Maps).

**Hecho cuando**: ≥95% en el eval set y coste de Maps por usuario en céntimos.

## Fase 3 — El informe del que se presume

- [ ] Rediseño del PDF (`src/pages/ReportView.tsx` + jspdf): cabecera con datos del freelancer y de la producción, tabla de viajes (fecha, ruta, propósito, km, tarifa, importe), gastos con anexo de recibos, total destacado, línea de CO₂ **con fuente citada (Umweltbundesamt)** + árboles equivalentes. En alemán. Tipografía/márgenes impecables.
- [ ] Verificar que cubre lo que la Aufnahmeleitung necesita para pagar Kilometergeld (0,50 €/km oficial 2026). Validar formato con 2-3 pilotos.
- [ ] Pie discreto *"Erstellt mit Fahrtenbuch Pro"* → bucle viral.

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
| Gemini Flash de base; modelo mejor solo si el eval lo justifica | Coste por callsheet es céntimos; precisión se mide, no se supone |
