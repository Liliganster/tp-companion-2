# Guía de Testing - Verificación Post-Auditoría
**Trip Companion App**  
**Fecha:** 30 de diciembre de 2025

Esta guía te ayudará a verificar sistemáticamente todas las mejoras de seguridad y producción implementadas tras la auditoría.

---

## 📋 Índice

1. [Pre-requisitos](#pre-requisitos)
2. [Tests Automáticos](#tests-automáticos)
3. [Tests de Seguridad](#tests-de-seguridad)
4. [Tests de Rate Limiting](#tests-de-rate-limiting)
5. [Tests de Monitoreo](#tests-de-monitoreo)
6. [Tests de Documentación Legal](#tests-de-documentación-legal)
7. [Tests de Validación](#tests-de-validación)
8. [Tests End-to-End](#tests-end-to-end)
9. [Tests de Producción](#tests-de-producción)

---

## Pre-requisitos

### 1. Verificar Variables de Entorno

```bash
# Copiar ejemplo si no existe
cp .env.example .env.local

# Verificar que todas las variables estén configuradas
npm run validate:env
```

**Variables críticas a verificar:**
```bash
# Supabase
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google Maps
VITE_GOOGLE_MAPS_BROWSER_KEY=AIza...
GOOGLE_MAPS_SERVER_KEY=AIza...

# Sentry
VITE_SENTRY_DSN=https://...@sentry.io/...
SENTRY_DSN=https://...@sentry.io/...

# Upstash (Rate Limiting)
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=A...

# AI
GEMINI_API_KEY=AIza...
CRON_SECRET=tu-secret-aleatorio
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Verificar Estado de la Base de Datos

```bash
# Conectarse a Supabase y verificar migraciones aplicadas
# En Supabase Dashboard > SQL Editor:
SELECT version FROM supabase_migrations.schema_migrations 
ORDER BY version DESC LIMIT 10;
```

**Migraciones críticas de seguridad que deben estar:**
- `20251225000002_harden_rls_with_check.sql`
- `20251225000003_harden_callsheets_storage_policies.sql`
- `20251227000000_harden_invoice_jobs_rls_with_check.sql`

---

## Tests Automáticos

### 1. Tests Unitarios (Vitest)

```bash
# Ejecutar todos los tests
npm run test:run

# Con cobertura
npm run test:coverage

# Watch mode para desarrollo
npm run test
```

**Tests que deben pasar (7 archivos):**
- ✅ `api/_utils/rateLimit.test.ts` - Rate limiting
- ✅ `src/lib/trip-warnings.test.ts` - Validación de viajes
- ✅ `src/lib/analytics.test.ts` - Analytics consent
- ✅ `src/contexts/TripsContext.test.tsx` - Context trips
- ✅ `src/contexts/ReportsContext.test.tsx` - Context reports
- ✅ `src/contexts/ProjectsContext.test.tsx` - Context projects
- ✅ `src/contexts/AuthContext.test.tsx` - Context auth

**Resultado esperado:**
```
Test Files  7 passed (7)
Tests  XX passed (XX)
```

### 2. Tests E2E (Playwright)

```bash
# Ejecutar tests E2E
npm run test:e2e

# Con UI interactiva
npx playwright test --ui

# Solo un archivo específico
npx playwright test e2e/auth-legal-links.spec.ts
```

**Tests que deben pasar (2 archivos):**
- ✅ `e2e/a11y.spec.ts` - Accesibilidad
- ✅ `e2e/auth-legal-links.spec.ts` - Enlaces legales

### 3. Type Checking

```bash
# Verificar tipos TypeScript
npm run typecheck

# Debería completar sin errores
# Expected: "tsc -p tsconfig.json --noEmit" exits with code 0
```

### 4. Linting

```bash
# Ejecutar ESLint
npm run lint

# Arreglar errores automáticamente
npm run lint -- --fix
```

---

## Tests de Seguridad

### 1. Verificar RLS (Row Level Security)

#### Test Manual en Supabase SQL Editor:

```sql
-- 1. Verificar que RLS está habilitado en todas las tablas
SELECT 
    schemaname, 
    tablename, 
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('user_profiles', 'projects', 'trips', 'reports', 
                  'callsheet_jobs', 'invoice_jobs', 'producer_mappings');

-- Resultado esperado: rowsecurity = true para todas
```

```sql
-- 2. Verificar políticas con WITH CHECK (hardened)
SELECT 
    tablename,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('user_profiles', 'projects', 'trips')
AND cmd = 'UPDATE';

-- Resultado esperado: with_check debe estar presente (no NULL)
```

#### Test de Aislamiento de Usuarios:

**En Supabase Dashboard > Authentication > Users:**

1. Crear dos usuarios de prueba:
   - `test1@example.com`
   - `test2@example.com`

2. Iniciar sesión como `test1@example.com`
3. Crear un proyecto y un viaje
4. Cerrar sesión

5. Iniciar sesión como `test2@example.com`
6. **Intentar acceder a datos de test1** (debería fallar):

```javascript
// En consola del navegador:
const { data, error } = await window.supabase
  .from('projects')
  .select('*')
  .eq('user_id', 'UUID_DE_TEST1'); // Reemplazar con UUID real

// Resultado esperado: data = [] (sin datos) o error de permisos
```

### 2. Verificar Gestión de Secretos

#### Test: Secrets No Expuestos en Cliente

```bash
# En desarrollo, abrir DevTools > Console
console.log(import.meta.env);

# Verificar que NO aparecen:
# ❌ SUPABASE_SERVICE_ROLE_KEY
# ❌ GOOGLE_MAPS_SERVER_KEY
# ❌ GOOGLE_OAUTH_CLIENT_SECRET
# ❌ CRON_SECRET
# ❌ GEMINI_API_KEY
# ❌ UPSTASH_REDIS_REST_TOKEN

# Verificar que SÍ aparecen (solo estas):
# ✅ VITE_SUPABASE_URL
# ✅ VITE_SUPABASE_ANON_KEY
# ✅ VITE_GOOGLE_MAPS_BROWSER_KEY
# ✅ VITE_SENTRY_DSN
# ✅ VITE_GA_MEASUREMENT_ID
```

#### Test: .env.local Ignorado por Git

```bash
# Verificar que .env.local está en .gitignore
cat .gitignore | grep "*.local"

# Resultado esperado: *.local

# Verificar que NO está en el repositorio
git ls-files .env.local

# Resultado esperado: (vacío, no debe aparecer)
```

### 3. Verificar Validación con Zod

#### Test de Validación de Trip:

```javascript
// En consola del navegador o test unitario
import { TripInputSchema } from './src/lib/schemas';

// Test 1: Datos válidos
const valid = TripInputSchema.safeParse({
  id: 'trip-123',
  date: '2025-12-30',
  purpose: 'Reunión cliente',
  projectId: null
});
console.log(valid.success); // Esperado: true

// Test 2: Datos inválidos (ID vacío)
const invalid = TripInputSchema.safeParse({
  id: '',
  date: '2025-12-30'
});
console.log(invalid.success); // Esperado: false
console.log(invalid.error.issues); // Ver errores
```

#### Test de Validación de Variables de Entorno:

```bash
# Eliminar temporalmente una variable crítica
# En .env.local, comentar VITE_SUPABASE_URL

# Intentar iniciar la app
npm run dev

# Resultado esperado: Error claro indicando la variable faltante
# "Missing VITE_SUPABASE_URL" o similar
```

---

## Tests de Rate Limiting

### 1. Verificar Configuración de Upstash

```bash
# Test de conexión a Upstash Redis
# Crear archivo test temporal: test-upstash.js
```

```javascript
// test-upstash.js
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function testUpstash() {
  try {
    await redis.set('test-key', 'test-value');
    const result = await redis.get('test-key');
    console.log('✅ Upstash conectado:', result);
    await redis.del('test-key');
  } catch (error) {
    console.error('❌ Error Upstash:', error);
  }
}

testUpstash();
```

```bash
# Ejecutar test
node test-upstash.js
# Esperado: ✅ Upstash conectado: test-value
```

### 2. Test de Rate Limiting en API

#### Test con cURL (desde terminal):

```bash
# Test 1: Endpoint de callsheet upload (límite: 20/min)
# Ejecutar este comando 21 veces rápidamente

for i in {1..21}; do
  echo "Request $i:"
  curl -X POST http://localhost:8080/api/callsheets/create-upload \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer TU_TOKEN_AQUI" \
    -d '{"filename":"test.pdf"}' \
    -w "\nStatus: %{http_code}\n\n"
done

# Resultado esperado:
# - Requests 1-20: Status 200 o 201
# - Request 21: Status 429 (Too Many Requests)
# - Headers en 429:
#   X-RateLimit-Remaining: 0
#   Retry-After: XX (segundos)
```

#### Test con Navegador:

1. Abrir DevTools > Network
2. Iniciar sesión en la app
3. Ir a sección de Callsheets
4. Intentar subir archivos rápidamente (más de 20 en 1 minuto)
5. **Verificar:** Request #21+ debe recibir 429

### 3. Test de Fallback en Memoria

```bash
# Comentar temporalmente variables de Upstash en .env.local
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=

# Reiniciar dev server
npm run dev

# Ejecutar mismo test de rate limiting
# Debería funcionar con fallback en memoria
# (menos preciso pero funcional)
```

---

## Tests de Monitoreo

### 1. Verificar Sentry (Error Tracking)

#### Test de Error Capturado:

```javascript
// En consola del navegador (app en ejecución)

// Test 1: Error manual
throw new Error('Test de Sentry - Error Manual');

// Esperar 10 segundos y verificar en:
// https://sentry.io/organizations/TU_ORG/issues/
// Debería aparecer el error "Test de Sentry - Error Manual"
```

#### Test de Filtrado de Errores:

```javascript
// Este error DEBE ser filtrado (no aparece en Sentry)
const error = new Error('Invalid login credentials');
throw error;

// Verificar en Sentry que NO aparece (está en beforeSend filter)
```

#### Test de Environment:

```bash
# En Sentry Dashboard, verificar que los errores tienen:
# - Environment: "local" (en dev) o "production" (en prod)
# - Release: versión de la app
# - User context: user ID cuando está logueado
```

### 2. Verificar Google Analytics

#### Test de Inicialización:

```javascript
// En consola del navegador
console.log(window.gtag); 

// Si VITE_GA_MEASUREMENT_ID está configurado y hay consentimiento:
// Esperado: function gtag() {...}

// Si no hay consentimiento o no está configurado:
// Esperado: undefined
```

#### Test de Consentimiento:

1. Abrir la app (sin consentimiento previo)
2. Abrir DevTools > Network > Filter: "google-analytics"
3. **NO debería haber requests** a Google Analytics
4. Dar consentimiento (si la app tiene UI de cookies)
5. **Ahora SÍ debería haber requests** a GA

#### Test de Eventos:

```javascript
// Con consentimiento activo y GA configurado
if (window.gtag) {
  window.gtag('event', 'test_event', {
    event_category: 'testing',
    event_label: 'manual_test'
  });
  console.log('✅ Evento enviado a GA');
}

// Verificar en GA4 Dashboard > Realtime > Events
// Debería aparecer "test_event"
```

### 3. Verificar Logging Estructurado

#### Test de Logs en API:

```bash
# En terminal donde corre el dev server
# Los logs deben aparecer con formato estructurado (Pino)

# Ejemplo esperado:
# {"level":30,"time":1735574400000,"msg":"Request started","requestId":"abc123"}
# {"level":30,"time":1735574401000,"msg":"Request completed","requestId":"abc123","duration":1000}
```

#### Test de Request ID:

```bash
# Hacer request a cualquier API endpoint
curl http://localhost:8080/api/google/geocode \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"address":"Madrid"}'

# Verificar en logs que aparece un requestId único
# Verificar que el mismo requestId aparece en inicio y fin del request
```

---

## Tests de Documentación Legal

### 1. Verificar Páginas Legales

#### Test de Accesibilidad:

```bash
# Abrir navegador en:
http://localhost:8080/legal/privacy
http://localhost:8080/legal/terms
http://localhost:8080/legal/cookies

# Verificar para cada página:
# ✅ Página carga sin errores
# ✅ Contenido visible y formateado
# ✅ Selector de idioma funciona (ES/EN/DE)
# ✅ No hay errores en consola
```

#### Test de Enlaces desde Auth:

```bash
# 1. Ir a http://localhost:8080/auth
# 2. Scroll al footer
# 3. Verificar enlaces visibles:
#    - "Términos del Servicio" → /legal/terms
#    - "Política de Privacidad" → /legal/privacy
# 4. Click en cada enlace
# 5. Verificar que navega correctamente
```

#### Test E2E Automatizado:

```bash
# Ya existe: e2e/auth-legal-links.spec.ts
npm run test:e2e -- auth-legal-links

# Debe pasar:
# ✅ Auth page shows legal links
```

### 2. Verificar Contenido Legal

#### Checklist de Privacy Policy:

```
✅ Menciona Supabase (database/storage)
✅ Menciona Vercel (hosting)
✅ Menciona Sentry (error tracking)
✅ Menciona Upstash (rate limiting)
✅ Menciona proveedores de IA (Gemini)
✅ Explica datos recolectados
✅ Explica uso de datos
✅ Menciona derechos GDPR
✅ Incluye email de contacto (TODO: reemplazar placeholder)
```

#### Checklist de Terms of Service:

```
✅ Define aceptación de términos
✅ Responsabilidad del usuario
✅ Política de suspensión de cuentas
✅ Limitación de responsabilidad
✅ Ley aplicable (TODO: completar)
✅ Fecha efectiva (TODO: completar)
```

### 3. Test de Consentimiento de Cookies/Analytics

```javascript
// En consola del navegador

// Test 1: Leer estado de consentimiento
const consent = localStorage.getItem('analytics-consent');
console.log('Consentimiento actual:', consent);
// Valores posibles: null, "granted", "denied"

// Test 2: Cambiar consentimiento
import { setAnalyticsConsent } from './src/lib/analytics';
setAnalyticsConsent(true); // Aceptar
// Verificar que window.gtag se inicializa

setAnalyticsConsent(false); // Rechazar
// Verificar que no hay requests a GA
```

---

## Tests de Validación

### 1. Test de Validación de Inputs

#### Test en Trip Creation:

```javascript
// En la app, ir a crear un viaje
// Intentar crear con datos inválidos:

// Test 1: Fecha en formato incorrecto
{
  date: "30/12/2025", // Formato DD/MM/YYYY (incorrecto)
  origin: "Madrid",
  destination: "Barcelona"
}
// Esperado: Error de validación

// Test 2: Purpose muy largo (>500 caracteres)
{
  date: "2025-12-30",
  purpose: "A".repeat(501) // 501 caracteres
}
// Esperado: Error de validación

// Test 3: ProjectId no UUID
{
  date: "2025-12-30",
  projectId: "not-a-uuid"
}
// Esperado: Error de validación
```

#### Test en Invoice Extraction:

```javascript
// En API endpoint de invoice extraction
// El schema InvoiceExtractionResultSchema debe validar:

// Test 1: Moneda inválida
{
  currency: "BITCOIN", // No es ISO 4217
  totalAmount: 100
}
// Esperado: Error de validación

// Test 2: Fecha inválida
{
  invoiceDate: "2025-13-40", // Mes/día inválidos
  currency: "EUR"
}
// Esperado: Error de validación
```

### 2. Test de Validación de Environment Variables

```bash
# Test 1: Variable faltante
# Crear .env.test sin VITE_SUPABASE_ANON_KEY
echo "VITE_SUPABASE_URL=https://test.supabase.co" > .env.test

# Intentar cargar con esa config
npm run build

# Esperado: Error claro de validación de Zod
# "VITE_SUPABASE_ANON_KEY is required"
```

---

## Tests End-to-End

### 1. Flujo Completo de Usuario

#### Escenario 1: Registro y Primer Viaje

```
1. Navegar a /auth
2. Click en "Sign up"
3. Registrarse con email + password
4. Verificar email (en entorno de prueba)
5. Login exitoso
6. Dashboard carga correctamente
7. Click en "Nuevo Viaje"
8. Completar formulario:
   - Fecha: hoy
   - Origen: "Madrid, España"
   - Destino: "Barcelona, España"
   - Medio: "Tren"
9. Guardar viaje
10. Verificar que aparece en lista de viajes
11. Click en el viaje
12. Verificar mapa cargado con ruta
13. Cerrar sesión

✅ Todo el flujo debe completarse sin errores
```

#### Escenario 2: Subida de Invoice con AI

```
1. Login
2. Navegar a sección de Invoices
3. Click en "Upload Invoice"
4. Seleccionar PDF de factura de prueba
5. Upload del archivo
6. Esperar procesamiento AI (status: "processing")
7. Verificar que cambia a "completed"
8. Abrir resultado extraído
9. Verificar datos:
   - Moneda detectada
   - Monto total
   - Fecha de factura
   - Vendor (si disponible)
10. Asociar a un viaje
11. Guardar

✅ Extracción AI debe funcionar correctamente
```

#### Escenario 3: Gestión de Proyectos

```
1. Login
2. Navegar a Projects
3. Crear nuevo proyecto:
   - Nombre: "Proyecto Test 2025"
   - Descripción: opcional
4. Guardar proyecto
5. Crear viaje asociado a ese proyecto
6. Ir a Reports
7. Generar reporte filtrando por proyecto
8. Verificar que solo aparecen viajes del proyecto
9. Exportar a PDF
10. Verificar PDF descargado

✅ Asociación proyecto-viaje-reporte funciona
```

### 2. Tests de Accesibilidad

```bash
# Ya existe: e2e/a11y.spec.ts
npm run test:e2e -- a11y

# Verifica con axe-core:
# - No hay problemas críticos de a11y
# - Labels en formularios
# - Contraste de colores (deshabilitado para evitar falsos positivos)
# - Navegación con teclado
```

#### Test Manual de Navegación con Teclado:

```
1. Abrir /auth
2. Usar solo TAB y ENTER (sin mouse):
   - TAB hasta campo email → escribir
   - TAB hasta campo password → escribir
   - TAB hasta botón "Login" → ENTER
3. Navegar por dashboard solo con teclado:
   - TAB entre elementos interactivos
   - ENTER para activar botones
   - ESC para cerrar modales
4. Verificar focus visible en todos los elementos

✅ Toda la app debe ser navegable con teclado
```

---

## Tests de Producción

### 1. Pre-Deploy Checklist

```bash
# 1. Build de producción
npm run build

# Verificar:
# ✅ Build completa sin errores
# ✅ No hay warnings críticos
# ✅ Validación de env pasa

# 2. Preview local del build
npm run preview

# Verificar:
# ✅ App carga correctamente
# ✅ Assets se sirven correctamente
# ✅ Routing funciona (SPA)

# 3. Type checking
npm run typecheck
# ✅ Sin errores de TypeScript

# 4. Linting
npm run lint
# ✅ Sin errores de ESLint

# 5. Tests
npm run test:run
npm run test:e2e
# ✅ Todos los tests pasan
```

### 2. Verificar Security Headers (Post-Deploy)

```bash
# Una vez desplegado en Vercel/producción
# Test con curl:

curl -I https://tu-app.vercel.app

# Verificar headers presentes:
# ✅ X-Content-Type-Options: nosniff
# ✅ X-Frame-Options: DENY
# ✅ X-XSS-Protection: 1; mode=block
# ✅ Strict-Transport-Security: max-age=... (si HTTPS)
# ⚠️  Content-Security-Policy: (TODO: implementar)
```

### 3. Test de Performance

```bash
# Usar Lighthouse en Chrome DevTools
# 1. Abrir https://tu-app.vercel.app
# 2. DevTools > Lighthouse
# 3. Ejecutar audit (Mobile + Desktop)

# Métricas objetivo:
# - Performance: >80
# - Accessibility: >90
# - Best Practices: >90
# - SEO: >80

# Core Web Vitals:
# - LCP (Largest Contentful Paint): <2.5s
# - FID (First Input Delay): <100ms
# - CLS (Cumulative Layout Shift): <0.1
```

### 4. Test de Monitoreo en Producción

#### Sentry:

```
1. Deploy a producción
2. Navegar por la app
3. Forzar un error (ej: click en algo que causa 404)
4. Ir a Sentry Dashboard
5. Verificar:
   ✅ Error aparece en Issues
   ✅ Environment = "production"
   ✅ User context incluido (si estaba logueado)
   ✅ Breadcrumbs muestran navegación previa
   ✅ Source maps funcionan (stack trace legible)
```

#### Google Analytics:

```
1. Navegar por la app en producción
2. Ir a GA4 Dashboard > Realtime
3. Verificar:
   ✅ Aparece actividad en tiempo real
   ✅ Pageviews registrados
   ✅ Eventos de usuario registrados
   ✅ Datos demográficos (si están habilitados)
```

### 5. Test de Rate Limiting en Producción

```bash
# Script para test de carga (usar con moderación)
# test-ratelimit-prod.sh

#!/bin/bash
TOKEN="TU_TOKEN_DE_PRODUCCION"
URL="https://tu-app.vercel.app/api/callsheets/create-upload"

for i in {1..25}; do
  echo "Request $i"
  curl -X POST $URL \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"filename":"test.pdf"}' \
    -w "Status: %{http_code}\n" \
    -s -o /dev/null
  sleep 0.5
done

# Resultado esperado:
# - Primeros 20: Status 200/201
# - A partir de 21: Status 429
```

---

## 📊 Matriz de Cobertura de Tests

| Área | Test Automático | Test Manual | Estado |
|------|----------------|-------------|--------|
| **Seguridad** |
| RLS habilitado | ❌ | ✅ SQL queries | Requerido |
| Secrets no expuestos | ❌ | ✅ DevTools | Requerido |
| Validación Zod | ✅ Unit tests | ✅ Manual | Completo |
| **Rate Limiting** |
| Upstash conexión | ✅ Unit test | ✅ Script | Completo |
| Límites respetados | ✅ Unit test | ✅ cURL | Completo |
| Fallback memoria | ❌ | ✅ Manual | Requerido |
| **Monitoreo** |
| Sentry captura errores | ❌ | ✅ Manual | Requerido |
| GA tracking | ❌ | ✅ Manual | Opcional |
| Logs estructurados | ❌ | ✅ Terminal | Requerido |
| **Legal** |
| Enlaces visibles | ✅ E2E test | ✅ Manual | Completo |
| Contenido completo | ❌ | ✅ Checklist | Requerido |
| Consentimiento | ✅ Unit test | ✅ Manual | Completo |
| **Funcionalidad** |
| Flujo completo usuario | ✅ E2E (parcial) | ✅ Manual | Mejorable |
| AI extraction | ❌ | ✅ Manual | Requerido |
| Reports/PDF | ❌ | ✅ Manual | Requerido |
| **Accesibilidad** |
| A11y automático | ✅ E2E axe | - | Completo |
| Navegación teclado | ❌ | ✅ Manual | Requerido |

---

## 🚨 Tests Críticos (NO Omitir)

Antes de desplegar a producción, estos tests **DEBEN** ejecutarse y pasar:

### ✅ Checklist Crítico

- [ ] **Tests automáticos pasan:** `npm run test:run` (exit code 0)
- [ ] **E2E tests pasan:** `npm run test:e2e` (exit code 0)
- [ ] **Build de producción exitoso:** `npm run build` (sin errores)
- [ ] **RLS verificado:** Queries SQL confirman políticas activas
- [ ] **Secrets no expuestos:** DevTools console no muestra SERVICE_ROLE_KEY
- [ ] **Rate limiting funciona:** Test cURL demuestra límite a 429
- [ ] **Sentry captura errores:** Error manual aparece en dashboard
- [ ] **Enlaces legales funcionan:** Privacy/Terms accesibles desde /auth
- [ ] **Variables de entorno completas:** Placeholders legales reemplazados
- [ ] **Flujo básico funciona:** Registro → Login → Crear viaje → Logout

---

## 🐛 Troubleshooting

### Problema: Tests fallan con "Cannot find module"

```bash
# Solución: Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Problema: Upstash retorna 401 Unauthorized

```bash
# Verificar tokens en .env.local
echo $UPSTASH_REDIS_REST_URL
echo $UPSTASH_REDIS_REST_TOKEN

# Regenerar tokens en Upstash Dashboard si es necesario
```

### Problema: Sentry no captura errores

```bash
# Verificar DSN configurado
echo $VITE_SENTRY_DSN

# Verificar inicialización en Network tab
# Debe haber request a o4510610149605376.ingest.de.sentry.io

# Verificar environment correcto en Sentry Dashboard
```

### Problema: Rate limiting no funciona

```bash
# Verificar que Upstash está configurado
# Si falla, debería usar fallback en memoria

# Check logs:
# "Rate limiter initialized with Upstash" → OK
# "Rate limiter using memory fallback" → Upstash no disponible
```

### Problema: RLS permite acceso a datos de otros usuarios

```bash
# Verificar políticas:
SELECT * FROM pg_policies WHERE schemaname = 'public';

# Verificar que user_id matches auth.uid()
# Si falla, ejecutar migraciones de hardening:
# 20251225000002_harden_rls_with_check.sql
```

---

## 📚 Recursos Adicionales

- **Supabase RLS:** https://supabase.com/docs/guides/auth/row-level-security
- **Upstash Rate Limiting:** https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
- **Sentry React:** https://docs.sentry.io/platforms/javascript/guides/react/
- **Playwright Testing:** https://playwright.dev/docs/intro
- **Vitest:** https://vitest.dev/guide/

---

## ✅ Conclusión

Esta guía cubre todos los aspectos críticos de testing post-auditoría. Ejecuta los tests en orden y documenta los resultados. Si algún test crítico falla, **NO despliegues a producción** hasta resolverlo.

**Tiempo estimado para completar todos los tests:** 2-3 horas

**Prioridad de ejecución:**
1. 🔴 Tests Críticos (Checklist final)
2. 🟡 Tests Automáticos
3. 🟡 Tests de Seguridad
4. 🟢 Tests E2E completos
5. 🟢 Tests de Performance

---

**Última actualización:** 30 de diciembre de 2025  
**Próxima revisión:** Post-deploy a producción
