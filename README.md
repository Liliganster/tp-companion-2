# Fahrtenbuch Pro

**Callsheet hochladen. Kilometergeld-Abrechnung fertig.**

Kilometergeld para crew de cine en Austria: sube la callsheet, la IA extrae los viajes del día y al final del mes generas el informe PDF que se entrega a producción. Dominio: [fahrtenbuchpro.com](https://fahrtenbuchpro.com).

- **Flujo**: callsheet (PDF) → extracción IA de localizaciones → viajes con ruta y km → informe mensual PDF.
- **Reglas austríacas** (Kilometergeld oficial), mapa europeo: los rodajes pueden cruzar a DE/CZ/HU.
- **Idiomas**: alemán, inglés y español.

El plan de producto por fases está en [PLAN.md](PLAN.md).

## Stack

- Vite + React 18 + TypeScript, shadcn/ui, Tailwind CSS
- Supabase (auth + base de datos)
- Funciones serverless en Vercel (carpeta `api/`): extracción de callsheets (Gemini), proxies de Google Maps
- jsPDF para el informe

## Desarrollo local

Requisitos: Node.js 20+ y npm.

```sh
npm install
npm run dev        # Vite en http://localhost:8080
```

Otros comandos:

```sh
npm run build      # valida el env y hace build de producción
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run test:run   # tests unitarios (vitest)
npm run test:e2e   # e2e (playwright)
```

### Variables de entorno

Crea un `.env.local` (ignorado por git). Referencia completa en [.env.example](.env.example) y [.env.local.example](.env.local.example). Las principales:

```sh
# Supabase (cliente)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# Google Maps
# Clave de navegador: restringir por HTTP referrer y limitar a "Maps JavaScript API"
VITE_GOOGLE_MAPS_BROWSER_KEY=...
# Clave de servidor (secreta): Directions/Geocoding/Places vía proxies /api/google/*
GOOGLE_MAPS_SERVER_KEY=...

# Extractor de callsheets (Gemini)
GEMINI_API_KEY=...

# Supabase servidor (funciones api/)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

> Nota: la integración con Google OAuth (Calendar/Drive) y las APIs de Climatiq / Electricity Maps existen en el código pero están en proceso de hibernación/sustitución (ver PLAN.md, Fase 1). Sus variables siguen documentadas en `.env.example`.

### Funciones API en local

En producción, `api/` se sirve como funciones de Vercel. `npm run dev` solo arranca Vite, así que para probar los endpoints `/api/*` en local:

1. En una terminal aparte: `npx vercel dev --listen 3000`
2. Añade a `.env.local`: `VERCEL_DEV_API_ORIGIN=http://localhost:3000`
3. Arranca Vite: `npm run dev`

Vite hace proxy de `/api/*` al servidor de Vercel dev.

## Despliegue

Vercel (config en [vercel.json](vercel.json)). Guía de configuración: [VERCEL_SETUP.md](VERCEL_SETUP.md).

## Documentación

- [PLAN.md](PLAN.md) — plan maestro por fases
- [TESTING_GUIDE.md](TESTING_GUIDE.md) — guía de tests
- [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) — copias y recuperación
- [docs/archive/](docs/archive/) — auditorías y documentos históricos
