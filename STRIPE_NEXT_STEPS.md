# CHECKLIST: Integración de Stripe - Próximos Pasos

## ✅ COMPLETADO
- [x] Instalar paquete Stripe: `npm install stripe`
- [x] Crear endpoint `/api/stripe/checkout.ts` (POST)
- [x] Crear endpoint `/api/stripe/webhook.ts` (POST)
- [x] Actualizar `src/pages/Plans.tsx` con `handleStripeCheckout()`
- [x] Build compila sin errores: `npm run build` ✅ (19.33s)

---

## ⏳ PENDIENTE INMEDIATO (Hoy)

### 1️⃣ Crear archivo `.env.local` con variables de Stripe

Crea el archivo en la raíz del proyecto:

```env
# Stripe (Modo TEST - usa sk_test_xxx)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PRICE_ID_PRO=price_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

**Dónde obtener estos valores:**
- Ve a https://dashboard.stripe.com/test/dashboard
- En menú superior, cambia a "Test mode" si no está
- **STRIPE_SECRET_KEY**: Developers → API Keys → Secret key (copiar)
- **STRIPE_PRICE_ID_PRO**: Necesitas crear primero (siguiente paso)
- **STRIPE_WEBHOOK_SECRET**: Necesitas crear webhook primero (siguiente paso)

---

### 2️⃣ Crear Producto en Stripe Dashboard

**En https://dashboard.stripe.com/test/products:**

1. Click **"Add product"**
2. Nombre: `Trip Companion Pro`
3. Descripción: `Monthly subscription for Pro tier`
4. **Pricing type**: Recurring
   - Interval: **Monthly**
   - Amount: **1900** (centavos = 19€)
   - Currency: **EUR**
   - Billing period: **Monthly**
5. Click **Save product**
6. **COPIAR PRICE ID** (ej: `price_1Q8x9zGp...`) 
   - Pégalo en `STRIPE_PRICE_ID_PRO=` en `.env.local`

---

### 3️⃣ Configurar Webhook en Stripe

**En https://dashboard.stripe.com/test/webhooks:**

1. Click **"Add endpoint"**
2. **URL**: `http://localhost:3000/api/stripe/webhook` (local testing)
   - O tu dominio en producción: `https://tu-app.vercel.app/api/stripe/webhook`
3. **Select events to listen to**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. **COPIAR SIGNING SECRET** (ej: `whsec_xxx`)
   - Pégalo en `STRIPE_WEBHOOK_SECRET=` en `.env.local`

---

### 4️⃣ Restart del servidor local

Después de agregar `.env.local`:

```bash
npm run dev
```

El servidor reloadea y ahora tiene acceso a las variables de Stripe.

---

## 🧪 TESTING (Verificación)

### En local (http://localhost:5173):

1. **Registrate** y loguéate
2. Ve a **Dashboard** → **Plans** (en sidebar)
3. Haz click en **"Pagar con Stripe"** (botón Pro)
4. Deberías ver:
   - ✅ Toast: "Redirigiendo a Stripe..."
   - ✅ Redirige a Stripe checkout
   
5. **En Stripe Checkout**, usa tarjeta de prueba:
   - Número: `4242 4242 4242 4242`
   - Fecha: Cualquier futura (ej: `12/26`)
   - CVC: Cualquier número (ej: `123`)
   - Email: Tu email

6. Click **"Pay"**
   - Deberías ver página de éxito

7. **Verifica en BDD:**
   ```sql
   SELECT * FROM user_subscriptions WHERE user_id = 'tu-user-id';
   ```
   - Debe mostrar: `plan_tier = 'pro'`, `status = 'active'`, `external_subscription_id` = algo
   
8. **En dashboard**, el badge debe cambiar de "Free" a "Pro" ✅

### Logs para debugging:

En consola del servidor (terminal donde corre `npm run dev`):
```
[Stripe] Creating checkout for user xxx
[Stripe] Checkout session created: cs_test_xxx

[Stripe Webhook] Received event: checkout.session.completed
[Stripe Webhook] Successfully updated subscription for user xxx
```

---

## 🚀 Próximos pasos después de testing

### Si todo funciona:
- [ ] Cambiar a producción (Vercel)
- [ ] Crear variables en Vercel dashboard (settings/environment)
- [ ] Cambiar STRIPE_SECRET_KEY a `sk_live_xxx` (keys reales)
- [ ] Actualizar webhook URL en Stripe
- [ ] Regenerar webhook secret con URL en vivo
- [ ] Actualizar STRIPE_WEBHOOK_SECRET en Vercel

### Si hay problemas:
- Ver sección "Troubleshooting" en `STRIPE_SETUP_GUIDE.md`
- Revisar logs `[Stripe]` y `[Stripe Webhook]`
- Verificar variables de entorno están correctas
- Usar `stripe listen` CLI para testing local avanzado

---

## 📊 Código Implementado

### Archivos Nuevos:
- `api/stripe/checkout.ts` - Crea Stripe checkout session
- `api/stripe/webhook.ts` - Escucha eventos de Stripe

### Archivos Modificados:
- `src/pages/Plans.tsx` - Agregué `handleStripeCheckout()` en botón Pro
- `src/contexts/PlanContext.tsx` - Ya lee de `user_subscriptions` table (prev)
- `api/user/subscription.ts` - POST para actualizar suscripciones (prev)

### Schema DB:
- `user_subscriptions` table creada con migración (prev)
- Campos: `external_subscription_id`, `status`, etc.

---

## ⚠️ NOTAS IMPORTANTES

1. **Variables de entorno**: Sin `.env.local` los endpoints de Stripe fallarán
2. **Webhook es crítico**: Sin webhook, el usuario no se actualiza a "pro"
3. **Test mode**: Usa `sk_test_xxx` para desarrollo, `sk_live_xxx` en producción
4. **Tarjetas de prueba**: Solo `4242...` funciona en test mode
5. **RLS**: La tabla `user_subscriptions` tiene RLS, no hay riesgos de seguridad
6. **Logs**: Revisa logs `[Stripe]` en cualquier error

---

## 📋 Resumen del Flujo

```
Usuario en /plans
    ↓
Click "Pagar con Stripe" (Pro)
    ↓
handleStripeCheckout() ejecuta
    ↓
POST /api/stripe/checkout
    ↓
Crea session con Stripe SDK
    ↓
Retorna { url: "https://checkout.stripe.com/..." }
    ↓
Redirige a session.url
    ↓
Usuario paga en Stripe Checkout
    ↓
Stripe webhook llama POST /api/stripe/webhook
    ↓
Webhook valida firma y evento
    ↓
UPDATE user_subscriptions SET plan_tier='pro'
    ↓
PlanContext detecta cambio (WebSocket/polling)
    ↓
UI se actualiza automáticamente ✨
```

---

## 📞 Soporte
- Stripe Docs: https://stripe.com/docs/api
- Dashboard Test: https://dashboard.stripe.com/test/dashboard
- API Test Keys: https://dashboard.stripe.com/test/apikeys
