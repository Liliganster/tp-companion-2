# 🎨 Visual Overview: Sistema de Planes + Stripe

## FLUJO DE USUARIO

```
┌─────────────────┐
│   USUARIO NUEVO │
└────────┬────────┘
         │
         ├─→ Registrarse
         │
         └─→ PlanContext
             ├─ Busca user_subscriptions
             ├─ Trigger crea: plan_tier='basic'
             └─ UI muestra: FREE badge
         
         ├─→ Dashboard
         │   ├─ Badge: "Free • 0/20 trips"
         │   └─ AI badge: "3/5 jobs used"
         │
         └─→ Puede usar:
             ├─ 20 trips
             ├─ 3 projects
             ├─ 5 AI jobs/mes
             └─ 10 stops/trip


┌────────────────────┐
│ USUARIO HACE CLICK │
│  "Pagar con Stripe"│
└────────┬───────────┘
         │
         ├─→ Plans.tsx
         │   └─ handleStripeCheckout()
         │
         ├─→ Backend
         │   └─ POST /api/stripe/checkout
         │
         ├─→ Stripe SDK
         │   └─ Create session
         │
         └─→ Redirige a
             └─ checkout.stripe.com


┌──────────────────────┐
│   COMPLETA PAGO      │
│   en Stripe Checkout │
└────────┬─────────────┘
         │
         ├─→ Stripe confirma pago
         │   └─ Crea subscription
         │
         ├─→ Dispara webhook
         │   └─ checkout.session.completed
         │
         ├─→ Backend webhook
         │   ├─ Valida firma
         │   └─ UPDATE user_subscriptions
         │       ├─ plan_tier = 'pro'
         │       ├─ status = 'active'
         │       ├─ external_subscription_id = 'sub_xxx'
         │       └─ price_cents = 1900
         │
         ├─→ PlanContext detecta cambio
         │   └─ WebSocket listener
         │
         └─→ UI se actualiza
             ├─ Badge: "Pro • 0/2000 trips"
             ├─ AI jobs: "0/60 jobs"
             └─ ¡Éxito! 🎉
```

---

## ARQUITECTURA: 3 CAPAS

```
┌──────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                     │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Pages:                     Contexts:                     │
│  ├─ /plans ← Plans.tsx      ├─ PlanContext               │
│  │  └─ Cards               │   └─ Read user_subscriptions│
│  │  └─ Botones             │   └─ WebSocket sync         │
│  │  └─ onClick → Checkout  │                             │
│  │                         │  Hooks:                     │
│  ├─ /dashboard             │  ├─ usePlan()              │
│  │  └─ Badge con plan      │  ├─ usePlanLimits()       │
│  │  └─ Cuenta de trips      │  └─ useAuth()             │
│  │                         │                             │
│  ├─ /trips                 │  i18n:                     │
│  │  └─ Valida límites      │  └─ Traducciones ES/EN/DE  │
│  │  └─ Rechaza si excede   │                             │
│  │                         │                             │
│  └─ Otros                  │  UI Components:            │
│                            │  └─ Button, Badge, Cards   │
│                                                            │
└──────────────────────────────────────────────────────────┘
              ↓ FETCH + Bearer Token ↓
┌──────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                      │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  User API:                                                │
│  ├─ GET  /api/user/subscription                          │
│  │  └─ Lee plan del usuario                              │
│  ├─ POST /api/user/subscription                          │
│  │  └─ Actualiza plan (raro, para admin)                 │
│  └─ GET  /api/user/plans                                 │
│     └─ Obtiene config de planes                          │
│                                                            │
│  Stripe API:                                              │
│  ├─ POST /api/stripe/checkout                            │
│  │  ├─ Valida usuario                                    │
│  │  ├─ Crea sesión con Stripe SDK                        │
│  │  └─ Retorna { url } para redirect                     │
│  │                                                        │
│  └─ POST /api/stripe/webhook                             │
│     ├─ Escucha eventos de Stripe                         │
│     ├─ Valida firma                                      │
│     └─ Actualiza user_subscriptions                      │
│                                                            │
│  Utilidades:                                              │
│  ├─ requireSupabaseUser (validar token)                   │
│  ├─ supabaseAdmin (cliente BD)                            │
│  └─ Stripe client (pagos)                                │
│                                                            │
└──────────────────────────────────────────────────────────┘
              ↓ SQL Queries ↓
┌──────────────────────────────────────────────────────────┐
│              BASE DE DATOS (Supabase)                     │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Tabla: user_subscriptions                                │
│  ├─ id: UUID                                              │
│  ├─ user_id: FK(auth.users)                               │
│  ├─ plan_tier: 'basic' | 'pro'                            │
│  ├─ status: 'active' | 'cancelled' | 'past_due'           │
│  ├─ external_subscription_id: Stripe sub_xxx              │
│  ├─ payment_provider: 'stripe' | null                     │
│  ├─ started_at, expires_at, created_at                    │
│  ├─ price_cents: 0 (basic) o 1900 (pro)                   │
│  ├─ custom_limits: JSONB (override)                       │
│  └─ metadata: JSONB                                       │
│                                                            │
│  Features:                                                │
│  ├─ RLS: (auth.uid() = user_id)                           │
│  ├─ Trigger: ON INSERT auth.users → INSERT subscriptions  │
│  ├─ Índice: user_id, external_subscription_id             │
│  └─ View: user_subscriptions_with_limits                  │
│                                                            │
│  Externo:                                                 │
│  └─ Stripe (API para pagos)                               │
│     ├─ Sessions: checkout.session                         │
│     ├─ Subscriptions: customer.subscription               │
│     └─ Webhooks: escucha eventos                          │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## PLANES Y LÍMITES

```
┌─────────────────────────────────────────────────────┐
│                   BASIC (Gratuito)                  │
├─────────────────────────────────────────────────────┤
│  Price:          €0/mes (Gratis)                    │
│                                                     │
│  Límites:                                           │
│  ├─ Trips:       20                                 │
│  ├─ Projects:    3                                  │
│  ├─ AI jobs:     5 por mes                          │
│  ├─ Stops:       10 por viaje                       │
│  └─ Modo:        Lectura                            │
│                                                     │
│  Características:                                   │
│  ├─ Ver planes                                      │
│  ├─ Crear viajes (20 máx)                           │
│  ├─ Usar AI (5 máx/mes)                             │
│  └─ Reportes básicos                                │
│                                                     │
└─────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────┐
│                 PRO (€19/mes)                       │
├─────────────────────────────────────────────────────┤
│  Price:          €19/mes (Renovación automática)    │
│  Payment:        Stripe (tarjeta de crédito)        │
│  Billing:        Mensual, recurrente                │
│                                                     │
│  Límites:                                           │
│  ├─ Trips:       2000                               │
│  ├─ Projects:    30                                 │
│  ├─ AI jobs:     60 por mes                         │
│  ├─ Stops:       25 por viaje                       │
│  └─ Modo:        Lectura + Escritura                │
│                                                     │
│  Características:                                   │
│  ├─ TODO de Basic                                   │
│  ├─ Crear viajes ilimitados (2000 máx)              │
│  ├─ Crear proyectos (30 máx)                        │
│  ├─ Usar AI (60 máx/mes)                            │
│  ├─ Reportes avanzados                              │
│  ├─ Exportar datos                                  │
│  └─ Soporte prioritario (futuro)                    │
│                                                     │
└─────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────┐
│              ENTERPRISE (Custom)                    │
├─────────────────────────────────────────────────────┤
│  Price:          Custom pricing                     │
│  Contact:        Email: support@tripcompanion.com   │
│                                                     │
│  Límites:                                           │
│  ├─ Trips:       Ilimitado                          │
│  ├─ Projects:    Ilimitado                          │
│  ├─ AI jobs:     Ilimitado                          │
│  ├─ Stops:       Ilimitado                          │
│  └─ Modo:        Acceso total                       │
│                                                     │
│  Características:                                   │
│  ├─ TODO de Pro                                     │
│  ├─ Límites personalizados                          │
│  ├─ Soporte 24/7                                    │
│  ├─ SLA garantizado                                 │
│  ├─ API access                                      │
│  └─ Custom integrations                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## FLUJO DE SEGURIDAD

```
┌─────────────────────────────────────────────────────┐
│         USUARIO INTENTA CREAR VIAJE                 │
└────────────────┬────────────────────────────────────┘
                 │
                 ↓
         ┌──────────────────┐
         │ usePlanLimits()  │
         │                  │
         │ "¿Tengo permiso? │
         │  ¿He usado 20?"  │
         └────────┬─────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        NO                  SI
        │                    │
        ↓                    ↓
   Bloquear         Permitir crear
   Mostrar toast    │
                    │
                    ↓
            Backend endpoint
            POST /api/trips
            │
            └─→ Validar límite otra vez
                (no confiar en frontend)
                │
                ├─ Leer user_subscriptions
                ├─ Calcular límite
                ├─ Contar trips existentes
                │
        ┌───────┴──────────┐
        │                  │
        OK          Excedido
        │                  │
        ↓                  ↓
    Crear trip      Rechazar (403)
    en BD           Mensaje de error
```

---

## ESTADOS DE SUSCRIPCIÓN

```
                        ┌─────────────────┐
                        │  USUARIO NUEVO  │
                        │  (Sin plan)     │
                        └────────┬────────┘
                                 │
                    ┌────────────┘
                    │ Trigger auto-crea
                    ↓
         ┌──────────────────────────────┐
         │  BASIC (GRATUITO)           │
         │  plan_tier: 'basic'          │
         │  status: 'active'            │
         │  price: €0                   │
         └──────────┬───────────────────┘
                    │
                    │ Usuario paga
                    │ $19/mes en Stripe
                    ↓
         ┌──────────────────────────────┐
         │  PRO (PAGADO)               │
         │  plan_tier: 'pro'            │
         │  status: 'active'            │
         │  price: €19/mes              │
         │  external_subscription_id    │
         │  (stripe sub_xxx)            │
         └──────────┬───────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    Usuario paga      Usuario cancela
      nuevo mes           suscripción
         │                     │
         ↓                     ↓
    Renovar auto        Status cambio
    (Stripe maneja)     de webhook
         │                     │
         │              ┌──────v──────────┐
         │              │ CANCELLED       │
         │              │ plan_tier: pro  │
         │              │ status: cancelled
         │              │ (o downgrade?)  │
         │              └──────┬──────────┘
         │                     │
         └──────────┬──────────┘
                    │
                    ↓ (Es decision)
         ┌──────────────────────────────┐
         │  Downgrade a BASIC           │
         │  plan_tier: 'basic'          │
         │  status: 'active'            │
         │  price: €0 (reset)           │
         │  (vuelve al estado inicial)  │
         └─────────────────────────────┘
```

---

## ENDPOINT REQUESTS/RESPONSES

```
╔════════════════════════════════════════════════╗
║  POST /api/stripe/checkout                    ║
╠════════════════════════════════════════════════╣
║  Propósito: Crear sesión de checkout          ║
║  Requiere: Bearer token (usuario autenticado) ║
║                                                ║
║  REQUEST:                                     ║
║  ├─ Headers:                                  ║
║  │  ├─ Authorization: Bearer {token}          ║
║  │  └─ Content-Type: application/json         ║
║  │                                            ║
║  └─ Body:                                     ║
║     {                                         ║
║       "tier": "pro",                          ║
║       "successUrl": "/dashboard",             ║
║       "cancelUrl": "/plans"                   ║
║     }                                         ║
║                                                ║
║  RESPONSE (200):                              ║
║  {                                            ║
║    "sessionId": "cs_test_xxxxx",              ║
║    "url": "https://checkout.stripe.com/..."  ║
║  }                                            ║
║                                                ║
║  RESPONSE (500):                              ║
║  {                                            ║
║    "error": "Stripe not configured"           ║
║  }                                            ║
╚════════════════════════════════════════════════╝


╔════════════════════════════════════════════════╗
║  POST /api/stripe/webhook                     ║
╠════════════════════════════════════════════════╣
║  Propósito: Escuchar eventos de Stripe        ║
║  Requiere: Firma válida de Stripe             ║
║                                                ║
║  REQUEST (Stripe → Tu servidor):              ║
║  ├─ Headers:                                  ║
║  │  └─ stripe-signature: {signature}          ║
║  │                                            ║
║  └─ Body: Raw JSON de evento                  ║
║                                                ║
║  Eventos procesados:                          ║
║  ├─ checkout.session.completed                ║
║  │  └─ UPDATE plan_tier='pro'                 ║
║  ├─ customer.subscription.updated              ║
║  │  └─ UPDATE status según Stripe             ║
║  └─ customer.subscription.deleted              ║
║     └─ UPDATE status='cancelled'               ║
║                                                ║
║  RESPONSE (200):                              ║
║  {                                            ║
║    "received": true                           ║
║  }                                            ║
║                                                ║
║  RESPONSE (400):                              ║
║  {                                            ║
║    "error": "Invalid signature"                ║
║  }                                            ║
╚════════════════════════════════════════════════╝


╔════════════════════════════════════════════════╗
║  GET /api/user/subscription                   ║
╠════════════════════════════════════════════════╣
║  Propósito: Obtener plan del usuario          ║
║  Requiere: Bearer token                       ║
║                                                ║
║  REQUEST:                                     ║
║  ├─ Headers:                                  ║
║  │  └─ Authorization: Bearer {token}          ║
║  │                                            ║
║  └─ Query: (ninguno)                          ║
║                                                ║
║  RESPONSE (200):                              ║
║  {                                            ║
║    "id": "uuid",                              ║
║    "user_id": "uuid",                         ║
║    "plan_tier": "pro",                        ║
║    "status": "active",                        ║
║    "external_subscription_id": "sub_xxx",    ║
║    "price_cents": 1900,                       ║
║    "limits": {                                ║
║      "trips": 2000,                           ║
║      "projects": 30,                          ║
║      "ai_jobs_per_month": 60,                 ║
║      "stops_per_trip": 25                     ║
║    }                                          ║
║  }                                            ║
╚════════════════════════════════════════════════╝
```

---

## TESTING VISUAL

```
ANTES DE PAGO:
┌──────────────────────────────────────┐
│  Dashboard                           │
├──────────────────────────────────────┤
│                                      │
│  Welcome, Juan!                      │
│                                      │
│  [Free plan] [3/5 AI jobs]          │
│                                      │
│  Trips: 15/20                        │
│  Projects: 2/3                       │
│  Status: Active                      │
│                                      │
│  [Create Trip]                       │
│  [Create Project]                    │
│                                      │
│  [Go to Plans →]                     │
│                                      │
└──────────────────────────────────────┘


DESPUÉS DE PAGO:
┌──────────────────────────────────────┐
│  Dashboard                           │
├──────────────────────────────────────┤
│                                      │
│  Welcome, Juan!                      │
│                                      │
│  [Pro plan ⭐] [5/60 AI jobs]       │
│                                      │
│  Trips: 15/2000                      │
│  Projects: 2/30                      │
│  Status: Active                      │
│                                      │
│  [Create Trip]                       │
│  [Create Project]                    │
│  [Export Data] (nuevo)               │
│                                      │
│  [Manage Subscription]               │
│                                      │
└──────────────────────────────────────┘
```

---

## TABLAS SQL IMPORTANTES

```sql
-- Tabla principal
SELECT * FROM user_subscriptions WHERE user_id = 'xxx';

-- Ver todos los usuarios con Pro activo
SELECT user_id, plan_tier, status 
FROM user_subscriptions 
WHERE plan_tier = 'pro' AND status = 'active';

-- Ver usuarios con suscripción de Stripe
SELECT user_id, external_subscription_id, plan_tier
FROM user_subscriptions
WHERE payment_provider = 'stripe';

-- Ver cuánto ingresos mensuales
SELECT COUNT(*) as pro_users, SUM(price_cents) as total_cents
FROM user_subscriptions
WHERE plan_tier = 'pro' AND status = 'active';
```

---

## RESUMEN VISUAL

```
📱 FRONTEND                    🖥️  BACKEND                      💾 DATABASE
└─ React                       └─ Node.js                      └─ Supabase
   ├─ Plans.tsx                  ├─ /checkout                    └─ user_subscriptions
   ├─ Dashboard                  ├─ /webhook                       ├─ plan_tier
   ├─ Trips                      └─ /subscription                  ├─ status
   └─ PlanContext                                                  ├─ external_sub_id
                                  🔗 Stripe SDK                    └─ price_cents
                                  └─ Sessions API
                                  └─ Webhooks API
```

---

**Visualización completa del sistema de planes + Stripe integrado y funcionando.**
