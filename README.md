# Fahrtenbuch Pro

**Callsheet hochladen. Kilometergeld-Abrechnung fertig.**

Kilometergeld (kilometraje reembolsable) para crew de cine en Austria. Subes la callsheet del día, la IA extrae las localizaciones de rodaje y las convierte en un viaje con ruta y kilómetros; a fin de mes generas el **informe PDF** que se entrega a producción para cobrar. Un solo flujo, una sola IA.

- **Marca / dominio**: Fahrtenbuch Pro · [fahrtenbuchpro.com](https://fahrtenbuchpro.com)
- **Reglas austríacas** (Kilometergeld oficial), **mapa europeo**: los rodajes pueden cruzar a DE / CZ / HU.
- **Idiomas de interfaz**: alemán, inglés y español.
- El plan de producto por fases está en [PLAN.md](PLAN.md).

---

## Índice

- [El flujo en una línea](#el-flujo-en-una-línea)
- [Funcionalidades](#funcionalidades)
  - [1. Extractor de callsheets (IA)](#1-extractor-de-callsheets-ia)
  - [2. Viajes (Fahrten)](#2-viajes-fahrten)
  - [3. Proyectos](#3-proyectos)
  - [4. Informe mensual PDF](#4-informe-mensual-pdf)
  - [5. Dashboard](#5-dashboard)
  - [6. Calendario](#6-calendario)
  - [7. Cálculo de dinero (Kilometergeld)](#7-cálculo-de-dinero-kilometergeld)
  - [8. Emisiones de CO₂](#8-emisiones-de-co)
  - [9. Costes y margen del coche](#9-costes-y-margen-del-coche)
  - [10. Ajustes / perfil](#10-ajustes--perfil)
  - [11. Planes y facturación](#11-planes-y-facturación)
  - [12. Cuenta, seguridad y datos](#12-cuenta-seguridad-y-datos)
  - [13. PWA, offline e idiomas](#13-pwa-offline-e-idiomas)
- [Arquitectura y stack](#arquitectura-y-stack)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Endpoints de la API](#endpoints-de-la-api)
- [Modelo de datos (Supabase)](#modelo-de-datos-supabase)
- [Desarrollo local](#desarrollo-local)
- [Despliegue](#despliegue)
- [Funciones hibernadas](#funciones-hibernadas)
- [Documentación](#documentación)

---

## El flujo en una línea

```
Callsheet (PDF/foto)
   └─► Extracción IA (Gemini): fecha · proyecto · productora · localizaciones EN ORDEN de rodaje
          └─► Geocoding + enlaces de Maps + Google Directions
                 └─► 1 viaje multi-parada del día (base → localizaciones → base) con km
                        └─► Informe mensual PDF → se entrega a producción → dinero
```

Regla de producto: si algo no mejora **el extractor, el informe o el dashboard**, o no recorta coste, no entra.

---

## Funcionalidades

### 1. Extractor de callsheets (IA)

El corazón del producto. Convierte una hoja de rodaje en un viaje sin teclear nada.

- **Formatos aceptados**: PDF, JPG, PNG, WebP y HEIC (incluye foto de móvil / WhatsApp). El mime real se resuelve por la extensión en storage; las imágenes van directas a la IA.
- **Motor**: Google **Gemini** lee el PDF de forma nativa (sin OCR). El plan Pro puede además configurar su **propia clave de OpenRouter** y modelo.
- **Localizaciones en orden de rodaje**: solo el lugar principal de rodaje (Loc / Set / Motiv) es una localización. Base, parking, catering, oficina de producción, hospital y meeting points **no** se extraen como destino — quedan guardados aparte como información adjunta (`callsheet_excluded_blocks`) clasificados por etiqueta.
- **Enlaces de Google Maps como fuente primaria**: si la línea del motivo trae un enlace de Maps, se resuelve por redirección (gratis, sin API) y gana al geocoding.
- **Verbatim + dirección corregida**: cada localización conserva la evidencia literal del documento y, aparte, una dirección geocodificable con las erratas de calle corregidas (conservando todos los números del original).
- **Fecha sin año**: reconstruye el año validando contra el día de la semana impreso.
- **Productora por proyecto**: la primera extracción que la detecta la fija en el proyecto (puede aparecer solo como logotipo); las hojas siguientes la heredan.
- **Un viaje por callsheet**: ruta base → localizaciones en el orden del documento → base, como viaje multi-parada.
- **Subida individual o por lotes**: `BulkUploadModal` acepta varias callsheets a la vez (según el plan) con estado por archivo: `queued → processing → done / needs_review / failed`.
- **Cuota de IA transparente**: contador visible en la cabecera y en el modal de subida **antes** de gastar; se pone rojo al agotarse y enlaza a Planes.
- **Caché de geocoding y rutas** en Supabase (`google_api_cache`) para que los rodajes que repiten localización durante semanas no vuelvan a pagar Maps.

Pipeline unificado en `api/_utils/callsheetExtraction.ts` (compartido por el worker cron y el endpoint síncrono). Piezas: `callsheetMapsLinks.ts`, `callsheetLabels.ts`, `callsheetDate.ts`, `geocode.ts`, `googleCache.ts`.

### 2. Viajes (Fahrten)

Página `/trips`. Lista de viajes con:

- **Filtros** por proyecto y por año, orden por fecha asc/desc, selección múltiple y acciones en lote.
- **Alta manual** (`AddTripModal`) con origen, paradas intermedias (hasta 25), destino y autocompletado de direcciones de Google Places.
- **Cálculo automático de distancia** vía Google Directions (Routes API) a través del proxy de servidor.
- **Detalle / edición** de cada viaje (`TripDetailModal`), incluido mapa de la ruta (`TripGoogleMap`).
- **Tarifa por viaje**: cada viaje puede sobrescribir la tarifa €/km por defecto (el override manda en el informe).
- **Pasajeros (Mitfahrer)** por viaje para el suplemento por acompañante.
- **Gastos del viaje** (peaje, parking, combustible, otros) en EUR, con foto de recibo adjunta.
- **Consumo real** del viaje (campos de combustible/energía) para el cálculo de coste.
- **Importación**: CSV (hasta 200 filas) y desde Google Calendar.
- **Avisos de viaje**: viajes sin proyecto, incompletos, etc., que alimentan el panel de atención del dashboard.

### 3. Proyectos

Página `/projects`. Agrupan viajes de un mismo rodaje.

- Datos del proyecto (nombre, **productora** editable, contexto).
- **Documentos del proyecto** adjuntos.
- **Gastos del proyecto** (`ProjectExpenseSection`) independientes de los del viaje.
- Herencia de productora a las callsheets del proyecto.
- Vista de detalle (`ProjectDetailModal`) y edición (`ProjectEditModal`).
- Exportación por proyecto (`use-project-export.ts`).

### 4. Informe mensual PDF

Página `/reports` (lista de informes) + `/reports/view` (`ReportView`). Es el producto visible que se entrega a producción. Generación en `src/lib/reportPdf.ts` (implementación única, jsPDF + autotable).

- **Cabecera de freelancer** (conductor, dirección, matrícula) + **producción** (proyecto, productora).
- **Tabla** por viaje: fecha · ruta · propósito · (pasajeros) · km · €/km · importe, con la **tarifa por viaje** aplicada.
- **Auslagen** (peaje / parking / combustible / otros) con nota "Belege im Anhang (ZIP-Export)".
- **Mitfahrer-Zuschlag** como línea propia del resumen con recuento de pasajeros (separado del kilometraje).
- **Total destacado** en caja.
- **Línea de CO₂** con fuente citada + **árboles equivalentes**.
- **Línea de firma**, números formateados por locale (`1.234,56 €`) y **pie viral** *"Erstellt mit Fahrtenbuch Pro · fahrtenbuchpro.com"* + "Seite n von N" en todas las páginas.
- **Idioma del PDF independiente de la interfaz** (alemán por defecto; selector DE / EN / ES).
- Exportación adicional a **Excel** (exceljs) y **ZIP** de recibos (jszip).

### 5. Dashboard

Página `/` (`Index.tsx`). Arriba todo accionable, abajo paisaje.

- **Cabecera**: saludo + contador de IA como chip pequeño (rojo al agotarse, clicable a Planes).
- **Fila de 4 cifras** (`DashboardCards`): **€ a facturar del mes** (la mayor, con tendencia vs. mes anterior), km, nº de viajes y CO₂ (con árboles equivalentes). Cada tarjeta es un enlace.
- **Panel "Necesita tu atención"** (`AttentionBell` / `AttentionPanel`): avisos de viajes y callsheets `failed` / `needs_review`, cada línea clicable a su solución. Vacío = "Todo en orden".
- **Tarjeta contextual de informe** (días 1–7 del mes): "Informe de [mes anterior] listo → Generar PDF".
- **Tarjeta "margen neto de tu coche"**: Kilometergeld facturado − coste real por km.
- **% de uso profesional** (caso fiscal): km profesionales del año ÷ km totales del coche.
- Abajo: **barras de 6 meses** km/€ (`MonthlyBars`, doble eje) y **últimos viajes** (`RecentTrips`).

### 6. Calendario

Página `/calendar` (`CalendarPage`). Vista de calendario de los viajes e **importación de eventos desde Google Calendar** (previa conexión OAuth en Ajustes) para convertirlos en viajes.

### 7. Cálculo de dinero (Kilometergeld)

Fuente única en `src/lib/tripMoney.ts` (la misma que usa el informe).

- **Kilometergeld**: km × tarifa €/km (oficial 0,50 €/km en 2026, configurable; override por viaje).
- **Mitfahrer-Zuschlag**: suplemento por pasajero, contabilizado como línea propia.
- **Gastos** (Auslagen) en EUR sumados aparte.
- **€ a facturar del mes** = kilometraje + suplemento de pasajeros + gastos, coherente entre dashboard e informe.
- Recibos extranjeros (CZK / HUF) se introducen **ya convertidos a EUR** (convención documentada en el campo).

### 8. Emisiones de CO₂

`src/lib/emissions.ts`. Sin APIs externas: **tabla estática de factores con fuente citada**.

- **Combustible** (física exacta): gasolina 2,31 kg CO₂/L, diésel 2,68 kg CO₂/L.
- **Red eléctrica (EV)**: intensidad media anual por país (AT / DE / CZ / HU), actualización manual.
- **Prioridad**: el consumo real del vehículo del perfil manda sobre las medias.
- **Árboles equivalentes** (~21–22 kg CO₂/árbol/año) con tooltip explicando el supuesto.

### 9. Costes y margen del coche

Con los costes **reales** del perfil (sin cifras inventadas):

- Precio de combustible €/L, precio de electricidad €/kWh, mantenimiento €/km, otros €/km.
- **Margen neto** = Kilometergeld facturado − coste real por km (tarjeta del dashboard).
- **Km totales del coche este año** → cálculo del **% de uso profesional** para el caso fiscal.

### 10. Ajustes / perfil

Modal de Ajustes (`SettingsModal`), pestañas:

- **Perfil**: nombre, NIF/USt-IdNr., matrícula, tarifa €/km, suplemento por pasajero, dirección base, ciudad, país.
- **Vehículo**: tipo (gasolina / diésel / EV / desconocido), consumo L/100 km, consumo EV kWh/100 km, factor de red g CO₂/kWh.
- **Costes del coche**: precio combustible, precio electricidad, mantenimiento €/km, otros €/km, km totales anuales.
- **APIs**: estado de Gemini (gestionado), **OpenRouter propio (solo Pro)** con clave y modelo, conexión de **Google Calendar** (OAuth).
- **Idioma**: DE / EN / ES.
- **Novedades**: versión de la app, comprobar actualizaciones, changelog.
- **Ayuda**: documentación, relanzar el tour guiado, soporte.
- **Zona de peligro**: eliminar cuenta.

### 11. Planes y facturación

Dos planes (`api/_utils/plans.ts` ↔ `src/lib/plans.ts`), facturación con **Stripe**.

| Función | Free (`basic`) | Pro |
|---|---|---|
| Viajes manuales | Ilimitados | Ilimitados |
| Callsheets IA / mes | **3** | **60** |
| Callsheets por lote | 3 | 20 |
| Callsheets por corrida del worker | 1 | 5 |
| Proyectos / plantillas de ruta | Ilimitados | Ilimitados |
| Paradas por viaje | 25 | 25 |
| OpenRouter propio | — | ✅ |

- Checkout y portal de cliente de Stripe (`/api/stripe/checkout`, `/api/stripe/portal`), webhook (`/api/stripe-webhook`).
- **Fuente de verdad de facturación en el servidor**: tabla `billing_entitlements` (accesible solo con `service_role`); el navegador nunca puede escribir plan ni datos de Stripe.
- Contador de cuota IA seudonimizado (`free_ai_usage_ledger`), independiente de borrar/recrear cuenta.

### 12. Cuenta, seguridad y datos

- **Autenticación** con Supabase: email/contraseña, **acceso con Google** (separado de registro), restablecer contraseña.
- Al registrarse, un trigger crea **perfil Free** automáticamente.
- **RLS** en todas las tablas; `user_profiles` es de solo lectura desde el navegador (solo la API con `service_role` modifica `plan_tier` y columnas Stripe).
- **Rate limiting** por usuario/IP en cada endpoint (Upstash Redis).
- **Eliminar cuenta** y **limpiar viajes duplicados** desde la API de usuario.
- **Cookies y analítica** con banner de consentimiento (`CookieConsentBanner`), y **Sentry** para errores.
- Páginas legales: `/legal/terms`, `/legal/privacy`, `/legal/cookies`.

### 13. PWA, offline e idiomas

- **PWA instalable** (vite-plugin-pwa / Workbox) con **aviso de actualización** (`UpdatePrompt`).
- **Banner de estado de red** offline (`NetworkStatusBanner`) y barra de carga global.
- **Tour de onboarding** guiado (`OnboardingTour`, `TripModalTour`).
- **i18n** DE / EN / ES con claves tipadas y carga perezosa por idioma (detecta traducciones faltantes en compilación).

---

## Arquitectura y stack

**Frontend**
- Vite + React 18 + TypeScript
- shadcn/ui sobre Radix UI, Tailwind CSS, `lucide-react`
- TanStack Query (datos), React Router 6 (rutas con layout protegido único)
- `@react-google-maps/api`, dnd-kit (orden por arrastre), Recharts (gráficos)
- jsPDF + jspdf-autotable (informe), exceljs (Excel), jszip (recibos), date-fns, zod, sonner

**Backend (serverless en Vercel, carpeta `api/`)**
- Extractor de callsheets (Gemini / OpenRouter)
- Proxies de Google Maps (Geocoding, Routes/Directions, Places)
- Google OAuth (Calendar + Drive)
- Stripe (checkout, portal, webhook)
- Upstash Redis (rate limiting), Sentry (observabilidad), Pino (logs)

**Datos e infra**
- Supabase: Auth + Postgres (RLS) + Storage (bucket `callsheets`)
- Vercel: hosting + funciones + cron (worker de callsheets)

**Contextos de React** (`src/contexts/`): `AuthContext`, `PlanContext`, `UserProfileContext`, `ProjectsContext`, `TripsContext`, `ReportsContext`, `AppearanceContext`.

---

## Estructura del proyecto

```
src/
  pages/            Dashboard, Trips, Projects, Reports, ReportView,
                    CalendarPage, Plans, Docs, Auth, Legal*, NotFound…
  components/       layout/ dashboard/ trips/ projects/ callsheets/
                    settings/ expenses/ google/ auth/ tour/ pwa/ ui/…
  contexts/         Auth, Plan, UserProfile, Projects, Trips, Reports
  lib/              reportPdf, tripMoney, emissions, plans, features,
                    analytics, validation, cascadeDelete, number…
  hooks/            use-i18n, use-ai-quota, use-plan-limits…
api/
  callsheets.ts     create-upload · queue · process · status · trigger-worker
  worker.ts         worker cron de extracción
  google.ts         geocode · directions · places · oauth · calendar · drive
  user.ts           profile · ai-quota · subscription · delete-account…
  stripe.ts         checkout · portal
  stripe-webhook.ts webhook de Stripe
  external.ts       climatiq / electricity-maps (hibernado)
  _utils/           callsheetExtraction, geocode, plans, entitlements,
                    aiQuota, rateLimit, googleOAuth, observability…
supabase/migrations/  esquema + RLS + triggers + funciones
scripts/          local-api, manual-worker, eval-extractor, validate-env
e2e/              Playwright (money-flow, a11y, legal)
```

---

## Endpoints de la API

| Ruta | Método | Función |
|---|---|---|
| `/api/callsheets/create-upload` | POST | Crea el job y devuelve URL firmada de subida |
| `/api/callsheets/queue` | POST | Encola un job para el worker |
| `/api/callsheets/process` | POST | Extracción síncrona (claim → Gemini → guarda) |
| `/api/callsheets/status` | GET | Estado del job + resultados + localizaciones |
| `/api/callsheets/trigger-worker` | POST | Dispara el worker (manual o cron interno) |
| `/api/worker` | POST | Worker de extracción (procesa la cola) |
| `/api/google/geocode` | POST | Geocoding (con caché y sesgo por región) |
| `/api/google/directions` | POST | Ruta y km (Routes API, con caché) |
| `/api/google/places-autocomplete` | POST | Autocompletado de direcciones |
| `/api/google/place-details` | POST | Dirección formateada por place ID |
| `/api/google/oauth/{start,callback,status,disconnect,access-token}` | — | Conexión Google OAuth |
| `/api/google/calendar/{create-event,list-calendars,list-events}` | — | Google Calendar |
| `/api/google/drive/{download,upload}` | — | Google Drive (hibernado) |
| `/api/user/profile` | — | Leer/guardar perfil |
| `/api/user/ai-quota` | GET | Cuota de IA del mes |
| `/api/user/subscription` | GET | Estado de suscripción |
| `/api/user/google-account-status` | GET | Estado de la cuenta Google |
| `/api/user/delete-account` | POST | Eliminar cuenta |
| `/api/user/cleanup-duplicate-trips` | POST | Limpiar viajes duplicados |
| `/api/stripe/checkout` · `/api/stripe/portal` | POST | Pago y portal de cliente |
| `/api/stripe-webhook` | POST | Webhook de Stripe |

Todos los endpoints autenticados aplican **rate limiting** y verifican el usuario de Supabase.

---

## Modelo de datos (Supabase)

Tablas principales (ver `supabase/migrations/`):

- `user_profiles` — perfil, tarifa, vehículo, costes, `plan_tier` (solo lectura desde el navegador).
- `billing_entitlements` — plan y datos de Stripe (solo `service_role`).
- `free_ai_usage_ledger` — contador de cuota IA seudonimizado.
- `callsheet_jobs` / `callsheet_results` / `callsheet_locations` / `callsheet_excluded_blocks` — pipeline del extractor.
- `trips` (+ gastos, documentos, `callsheet_job_ref`) — viajes.
- `projects` (+ `producer`, documentos, gastos) — proyectos.
- `reports` — informes guardados.
- `route_templates` — plantillas de ruta.
- `google_connections` — tokens OAuth.
- `google_api_cache` — caché de geocoding y rutas.
- `ai_usage_events` — telemetría de uso de IA.

---

## Desarrollo local

Requisitos: **Node.js 20+** y npm.

```sh
npm install
npm run dev        # Vite en http://localhost:8080
```

La extracción de callsheets y el resto de `/api/*` son funciones de Vercel; en local hacen falta **dos terminales**:

```sh
npm run dev        # terminal 1: la app (Vite, puerto 8080)
npm run api:local  # terminal 2: funciones API reales (puerto 3000) + worker
```

`.env.local` debe tener `VERCEL_DEV_API_ORIGIN=http://localhost:3000` (Vite hace proxy de `/api/*`). `scripts/local-api.ts` sirve los mismos handlers que producción y procesa la cola cada 8 s (el papel del cron).

**Otros comandos**

```sh
npm run build          # valida el env y hace build de producción
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run test:run       # tests unitarios (vitest)
npm run test:coverage  # cobertura
npm run test:e2e       # e2e (Playwright)
npm run eval:extractor # eval set del extractor
```

### Variables de entorno

Crea `.env.local` (ignorado por git). Referencia completa en [.env.example](.env.example) y [.env.local.example](.env.local.example).

```sh
# Supabase (cliente)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# Supabase (servidor, funciones api/)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Google Maps
VITE_GOOGLE_MAPS_BROWSER_KEY=...   # navegador: restringir por referrer, solo Maps JS API
GOOGLE_MAPS_SERVER_KEY=...         # servidor: Directions/Geocoding/Places vía /api/google/*

# Extractor de callsheets
GEMINI_API_KEY=...

# Facturación
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# Rate limiting (Upstash) y cron
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
CRON_SECRET=...
```

---

## Despliegue

Vercel (config en [vercel.json](vercel.json)). Guía de configuración en [VERCEL_SETUP.md](VERCEL_SETUP.md). Requiere pegar las migraciones pendientes en el SQL Editor de Supabase (ver notas en `PLAN.md`).

---

## Funciones hibernadas

Código presente en el repo pero desconectado por decisión de producto (Fase 1 del PLAN). Se reactivan con un flag (`src/lib/features.ts`), sin restaurar nada de git:

- **Páginas Advanced** (`/advanced`, rutas, emisiones avanzadas) — `advancedPages: false`.
- **Integración Google Drive** (picker de importación) — `googleDrive: false`.
- **Extracción IA de facturas y gastos** (invoice/expense) — solo `callsheet` activo.
- **Odómetro** (captura QR + foto).
- **Climatiq / Electricity Maps** — sustituidos por la tabla estática de emisiones (`api/external.ts` queda como referencia).

---

## Documentación

- [PLAN.md](PLAN.md) — plan maestro por fases (decisiones y estado)
- [TESTING_GUIDE.md](TESTING_GUIDE.md) — guía de tests
- [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) — copias y recuperación
- [VERCEL_SETUP.md](VERCEL_SETUP.md) — configuración de despliegue
- [docs/archive/](docs/archive/) — auditorías y documentos históricos
