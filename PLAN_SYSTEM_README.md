# Sistema de Planes - Implementación Completada

## Resumen

Se ha implementado un sistema de planes (Basic y Pro) con almacenamiento en Supabase, límites ajustables por usuario y aplicación automática de restricciones en toda la aplicación.

## Arquitectura

### 1. Base de Datos (Supabase)

**Tabla: `user_subscriptions`**
```
- id (UUID)
- user_id (UUID) → auth.users
- plan_tier (TEXT): 'basic', 'pro', 'enterprise'
- status (TEXT): 'active', 'cancelled', 'past_due', 'trialing'
- started_at (TIMESTAMPTZ)
- expires_at (TIMESTAMPTZ)
- custom_limits (JSONB) - Para Enterprise
- price_cents (INTEGER): 1900 para Pro (19€)
- currency (TEXT): 'EUR'
- created_at, updated_at (TIMESTAMPTZ)
```

**Triggers automáticos:**
- ✓ Al crear usuario → crea suscripción "basic"
- ✓ Al actualizar subscription → actualiza `updated_at`
- ✓ Backfill de usuarios existentes a "basic"

**RLS Policies:**
- ✓ Usuarios ven su propia suscripción (SELECT)
- ✓ Solo service_role puede INSERT/UPDATE/DELETE
- ✓ `user_plan_info` view con límites calculados

### 2. Backend API

**Endpoint: `POST/GET /api/user/subscription`**

`GET` - Obtiene plan actual del usuario
```json
{
  "tier": "pro",
  "status": "active",
  "limits": {
    "maxTrips": 2000,
    "maxProjects": 30,
    "maxAiJobsPerMonth": 60,
    "maxStopsPerTrip": 25,
    "maxRouteTemplates": 50
  },
  "priceCents": 1900,
  "currency": "EUR"
}
```

`POST` - Upgrade a nuevo plan
```json
Request: { "tier": "pro" }
Response: { ...plan info actualizado... }
```

**Logs en servidor:**
```
[Subscription] User {id} upgrading to pro
[Subscription] Successfully updated {id} to pro
```

### 3. Frontend - React Context

**Archivo: `src/contexts/PlanContext.tsx`**

```typescript
interface PlanContextValue {
  planTier: "basic" | "pro" | "enterprise"
  limits: PlanLimits
  status: string
  isLoading: boolean
  isAITypeAllowed: (type) => boolean
  refreshSubscription: () => Promise<void>
  upgradeToPlan: (tier) => Promise<boolean>
}
```

**Características:**
- Lee de `user_subscriptions` en Supabase
- Suscripción en tiempo real con WebSocket
- Cache automático
- Soporte para custom_limits (Enterprise)
- Manejo de expiración de suscripciones

**Logs en cliente:**
```
[PlanContext] Fetching subscription for user {id}
[PlanContext] Loaded plan: pro for user {id}
[PlanContext] Starting upgrade to pro
[PlanContext] Upgrade successful, new tier: pro
```

### 4. Limitaciones por Plan

#### Basic (Gratis)
- 20 viajes activos
- 3 proyectos
- 5 extracciones IA/mes
- 10 paradas/viaje
- 5 plantillas de ruta
- CSV export, reportes básicos
- SIN: Google Calendar Sync, análisis de costes

#### Pro (19€/mes)
- 2000 viajes activos
- 30 proyectos
- 60 extracciones IA/mes
- 25 paradas/viaje
- 50 plantillas de ruta
- Todos los exports, reportes avanzados
- Google Calendar Sync
- Análisis de costes
- Soporte prioritario

#### Enterprise (Custom)
- Ilimitado
- custom_limits en JSONB
- SLA garantizado
- Soporte dedicado

### 5. Validación de Límites

**Hook: `src/hooks/use-plan-limits.ts`**

Valida:
- `canAddTrip` - Verifica antes de crear viaje
- `canAddProject` - Verifica antes de crear proyecto
- `canAddAIJob` - Verifica límite mensual IA
- `canAddStop` - Verifica paradas por viaje

**Logs:**
```
[PlanLimits] Plan: pro, Max trips: 2000, Max projects: 30, Max AI: 60
[PlanLimits] Trips: 5 AI, 10 non-AI, 15 total
[PlanLimits] Active projects: 2/30
```

### 6. UI/UX

**Página: `/plans`**
- 2 tarjetas (Basic | Pro)
- Botones "Upgrade to Pro" / "Current Plan"
- Loading states con spinner
- Toast de éxito/error
- Banner de Enterprise abajo

**Sidebar:**
- Crown icon (amarillo) + badge "Pro"
- Link a `/plans`
- Desaparece si usuario está en Basic

**Dashboard (Index.tsx):**
- Badge de trip count (viajes actuales)
- Badge de AI quota (con bypass indicator)
- Actualiza en tiempo real

## Flujo de Datos

```
1. Usuario se registra
   ↓
2. Auth trigger → crea user_subscriptions (plan_tier='basic')
   ↓
3. App inicia → PlanContext.fetchSubscription()
   ↓
4. Lee de Supabase user_subscriptions
   ↓
5. WebSocket listen para cambios en tiempo real
   ↓
6. usePlanLimits() valida acciones usando limits
   ↓
7. Usuario en /plans → click "Upgrade to Pro"
   ↓
8. POST /api/user/subscription { tier: 'pro' }
   ↓
9. API: INSERT/UPDATE user_subscriptions (plan_tier='pro')
   ↓
10. PlanContext.fetchSubscription() recarga
    ↓
11. Límites se aplican automáticamente (2000 trips en vez de 20)
```

## Testing

Ver [PLAN_SYSTEM_TESTING.md](./PLAN_SYSTEM_TESTING.md) para:
- Checklist de tests
- Comandos SQL para verificar
- Troubleshooting
- Logs esperados

## Migración Requerida

```bash
cd supabase
supabase db push
# Ejecuta: supabase/migrations/20260109000000_user_subscriptions.sql
```

## Archivos Modificados/Creados

### Creados:
- ✓ `supabase/migrations/20260109000000_user_subscriptions.sql` - Tabla + triggers + RLS
- ✓ `api/user/subscription.ts` - Endpoint GET/POST
- ✓ `api/user/plans.ts` - Config de límites por tier
- ✓ `src/pages/Plans.tsx` - Página de planes
- ✓ `PLAN_SYSTEM_TESTING.md` - Guía de testing

### Modificados:
- ✓ `src/contexts/PlanContext.tsx` - Lee de DB + upgrades
- ✓ `src/App.tsx` - Ruta /plans
- ✓ `src/components/layout/Sidebar.tsx` - Link a Plans
- ✓ `src/lib/i18n.ts` - Traducciones (ES/EN/DE)
- ✓ `src/hooks/use-plan-limits.ts` - Logging mejorado
- ✓ `api/user/ai-quota.ts` - Lee de user_subscriptions

## Próximos Pasos (Futuro)

- [ ] Integración con Stripe para pagos
- [ ] Webhooks de Stripe para actualizar estado
- [ ] Facturación y recibos
- [ ] Panel de admin para gestionar subscripciones
- [ ] Trials de 14 días
- [ ] Cambio de plan (downgrade/upgrade)
- [ ] Cancelación automática al expirar
- [ ] Notificaciones antes de expirar
