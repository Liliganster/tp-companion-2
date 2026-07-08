# Reconstruir Supabase desde cero

Guía para crear un proyecto nuevo de Supabase y dejarlo exactamente como lo espera la app. Todo el esquema (tablas, políticas RLS, buckets de storage, realtime) está en **un solo script**: [supabase/rebuild.sql](supabase/rebuild.sql).

## 1. Crear el proyecto

1. Entra en [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Nombre: `fahrtenbuch-pro`. Región: **Central EU (Frankfurt)**.
3. Genera una contraseña de base de datos y **guárdala** (no la vuelve a enseñar).
4. Espera 1-2 minutos a que el proyecto termine de aprovisionarse.

## 2. Ejecutar el script

1. En el menú lateral: **SQL Editor** → **New query**.
2. Abre `supabase/rebuild.sql`, copia TODO el contenido y pégalo.
3. Pulsa **Run**. Debe terminar con "Success. No rows returned".

Esto crea: todas las tablas (`trips`, `projects`, `reports`, `user_profiles`, `callsheet_*`, `invoice_*`, etc.), las políticas RLS, los buckets de storage `callsheets` y `project_documents` con sus políticas, y activa realtime en las tablas que la app escucha.

## 3. Configurar autenticación

En **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:8080`
- **Redirect URLs**: añadir
  - `http://localhost:8080/auth/callback`
  - `http://localhost:8080/auth/reset`
  - (cuando haya dominio: `https://fahrtenbuchpro.com/auth/callback` y `/auth/reset`)

El proveedor de Email ya viene activado. Para probar rápido sin verificar correos, puedes desactivar **Confirm email** en Authentication → Sign In / Providers → Email (reactivar antes de lanzar).

El botón "Continuar con Google" requiere configurar el proveedor Google (Authentication → Providers) con un OAuth Client de Google Cloud; **se puede dejar para más adelante** — el login con email funciona sin eso.

## 4. Copiar las credenciales a la app

En **Settings → API** (o "Project Settings → API Keys"):

| Del dashboard | Variable en `.env.local` |
|---|---|
| Project URL | `VITE_SUPABASE_URL` **y** `SUPABASE_URL` |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` |
| `service_role` key (secreta) | `SUPABASE_SERVICE_ROLE_KEY` |

Después: reiniciar el dev server (`npm run dev`) y registrarse con un email — el perfil de usuario se crea solo en el primer login.

## 5. Producción (cuando toque)

Las mismas 4 variables hay que actualizarlas en Vercel (ver [VERCEL_SETUP.md](VERCEL_SETUP.md)), y añadir el dominio de producción a las Redirect URLs del paso 3.

## Notas

- `supabase/rebuild.sql` se genera concatenando `supabase/migrations/` en orden; si se añaden migraciones nuevas, regenerarlo o aplicarlas por separado.
- El archivo `supabase_migration_remove_plans.sql` de la raíz es **obsoleto** (la app vuelve a usar `plan_tier`): no ejecutarlo.
- Tablas de features hibernadas (odómetro, facturas IA, Google Drive) se crean igualmente: vacías no molestan y evitan errores del código aún no recortado (Fase 1).
