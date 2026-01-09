# ❓ FAQ: Integración Stripe y Sistema de Planes

## PREGUNTAS FRECUENTES

### 🔑 VARIABLES DE ENTORNO

#### P: ¿Dónde obtengo STRIPE_SECRET_KEY?
R: Ve a https://dashboard.stripe.com/test/apikeys (asegúrate de estar en TEST mode)
   - En la sección \"Secret key\", haz click \"Show test key\"
   - Copia el valor (comienza con `sk_test_`)
   - Pega en `.env.local`

#### P: ¿Qué es STRIPE_PRICE_ID_PRO?
R: Es el identificador único del producto \"Trip Companion Pro\" que creaste en Stripe
   - Viene de: Dashboard → Products → Selecciona el producto
   - Haz click en el precio → Copia el \"Price ID\"
   - Comienza con `price_`

#### P: ¿Y STRIPE_WEBHOOK_SECRET?
R: Es la clave para validar que los webhooks vienen realmente de Stripe
   - Ve a: Dashboard → Webhooks → Click en tu webhook
   - En los detalles, busca \"Signing secret\"
   - Comienza con `whsec_`

#### P: ¿Puedo usar las mismas variables en producción?
R: No. Necesitas cambiar de `sk_test_xxx` a `sk_live_xxx`
   - Primero en https://dashboard.stripe.com/live/apikeys
   - Luego configura en Vercel Settings → Environment Variables

---

### 💳 TESTING CON TARJETAS

#### P: ¿Qué tarjeta de prueba debo usar?
R: Para éxito: `4242 4242 4242 4242`
   - Fecha: Cualquiera en el futuro (ej: 12/26)
   - CVC: Cualquier 3 dígitos (ej: 123)
   - Email: Cualquier email

#### P: ¿Cómo pruebo que falle un pago?
R: Usa tarjeta: `4000 0000 0000 0002`
   - Misma fecha y CVC
   - Stripe rechazará automáticamente

#### P: ¿Hay más tarjetas de prueba?
R: Sí, ver: https://stripe.com/docs/testing#test-cards
   - Diferentes escenarios (3D Secure, SCA, etc.)

---

### 🔗 WEBHOOKS

#### P: ¿Qué es un webhook?
R: Un callback que Stripe llama cuando ocurre un evento (pago, cancelación, etc.)
   - Se ejecuta automáticamente
   - No requiere input del usuario
   - Ocurre en background

#### P: ¿Cuál es la URL de webhook?
R: En desarrollo: `http://localhost:3000/api/stripe/webhook`
   En producción: `https://tu-dominio.vercel.app/api/stripe/webhook`

#### P: ¿Qué eventos estoy escuchando?
R: Tres eventos:
   1. `checkout.session.completed` → Usuario pagó
   2. `customer.subscription.updated` → Cambio de suscripción
   3. `customer.subscription.deleted` → Usuario canceló

#### P: ¿Cómo pruebo webhooks en local?
R: Usa Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe  # macOS
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   - Copia el webhook signing secret que aparece
   - Pégalo en .env.local como STRIPE_WEBHOOK_SECRET

#### P: ¿Qué pasa si el webhook falla?
R: Stripe lo reintenta automáticamente
   - Puedes ver historial en: Dashboard → Webhooks → Click webhook → Events
   - Si falla permanentemente, usuario no se actualiza a Pro

---

### 💾 BASE DE DATOS

#### P: ¿Dónde se guardan las suscripciones?
R: En la tabla `user_subscriptions` en Supabase
   - Campos: plan_tier, status, external_subscription_id, etc.
   - RLS: Usuario solo ve su propia suscripción

#### P: ¿Cómo consulto mi suscripción?
R: En Supabase Console:
   ```sql
   SELECT * FROM user_subscriptions 
   WHERE user_id = 'tu-uuid'
   ```

#### P: ¿Qué significa cada status?
R: 
   - `active`: Suscripción válida y pagada
   - `cancelled`: Usuario canceló
   - `past_due`: Pago rechazado (reintentar después)
   - `trialing`: En período de prueba (futuro)

#### P: ¿Se borra la suscripción al cancelar?
R: No, se guarda con status='cancelled'
   - Historial completo persiste
   - Usuario puede reactivar (futuro)

---

### 🛒 CHECKOUT

#### P: ¿Qué es checkout.session?
R: Un pago pendiente que Stripe crea cuando usuario hace click \"Pagar\"
   - Contiene: plan, precio, cliente, URLs de éxito/cancelación
   - Es único por sesión
   - Expira después de 24h si no se completa

#### P: ¿Por qué me redirige a Stripe?
R: Razones de seguridad:
   - Stripe maneja información sensible (tarjeta)
   - Tu servidor nunca toca la tarjeta
   - PCI compliance automático

#### P: ¿Puedo customizar el checkout?
R: En versión basic, se usa Stripe hosted checkout
   - Para custom UI, necesitas Stripe Payment Element (futuro)

#### P: ¿Qué pasa si usuario cierra sin pagar?
R: Se cancela la sesión
   - Verá página \"payment cancelled\"
   - Puede intentar nuevamente en /plans

---

### 🔐 SEGURIDAD

#### P: ¿Son seguras mis variables de Stripe?
R: Sí, mientras:
   - `.env.local` no se commita a git (ya está en .gitignore)
   - No las compartas por Slack/email
   - Solo el servidor las accede

#### P: ¿Qué impide que alguien cambie su plan sin pagar?
R: Múltiples capas:
   - Frontend: usePlanLimits valida
   - Backend: POST /api/user/subscription requiere token Bearer
   - BD: RLS impide write sin ser el owner
   - Webhook: Solo Stripe (validado por firma) puede actualizar a Pro

#### P: ¿El webhook es vulnerable?
R: No, está protegido por:
   - Firma HMAC validada con STRIPE_WEBHOOK_SECRET
   - Solo Stripe sabe esta secret
   - Si alguien intenta falsificar, `constructEvent()` lanza error

#### P: ¿Puedo confiar en frontend para límites?
R: No. Frontend es solo UX.
   - Backend siempre valida antes de crear recurso
   - Si alguien modifica frontend, backend rechaza

---

### 🐛 DEBUGGING

#### P: ¿Dónde veo los logs?
R: En dos lugares:
   1. Terminal (npm run dev):
      ```
      [Stripe] Creating checkout...
      [Stripe Webhook] Received event...
      ```
   2. Navegador (F12 → Console):
      ```
      [Plans] Starting Stripe checkout...
      ```

#### P: ¿Cómo veo que el webhook se disparó?
R: En Stripe Dashboard:
   - Ve a: Developers → Webhooks
   - Click en tu webhook
   - Pestaña: Events
   - Verás lista de eventos, hace click en uno para detalles

#### P: ¿Qué significa \"Invalid signature\"?
R: El STRIPE_WEBHOOK_SECRET es incorrecto
   - Verifica en .env.local es idéntico al Stripe Dashboard
   - Asegúrate de copiar completo (sin espacios)
   - Si cambias webhook URL, necesitas nuevo secret

#### P: La BD no se actualiza, ¿qué hago?
R: Pasos de debug:
   1. Verifica logs `[Stripe Webhook]` en terminal
   2. Si no aparece, webhook no llegó
   3. Ve a Stripe Dashboard → Webhooks → Events, verifica evento
   4. Si evento está ahí, revisa error en los detalles
   5. Si error es \"Invalid signature\", punto anterior

#### P: ¿Cómo reinicio el webhook?
R: En Stripe Dashboard:
   - Vete a: Developers → Webhooks
   - Busca tu webhook
   - Click en los 3 puntos → Remove
   - Crea uno nuevo con misma URL

---

### 💰 PAGOS

#### P: ¿Cuándo me llega el dinero?
R: Stripe lo transfiere a tu cuenta bancaria
   - Tiempo: 1-2 días hábiles
   - Ve a: Dashboard → Payouts
   - Configura cuenta bancaria en: Settings → Banking

#### P: ¿Cómo cambio el precio de €19?
R: Crear nuevo Product + Price en Stripe
   - No edites el existente (puede romper suscripciones activas)
   - Crea uno nuevo
   - Cambia STRIPE_PRICE_ID_PRO en .env.local

#### P: ¿Puedo tener descuentos?
R: Stripe soporta cupones (futuro)
   - Se pueden aplicar en checkout
   - O en subscription después de crear

#### P: ¿Qué pasa si pago se rechaza?
R: Stripe reintenta automáticamente
   - 3 intentos en 3 días
   - Si todos fallan, subscription → past_due
   - Usuario sigue usando (grace period)
   - Después de X días, cancela automático

---

### 📊 ANÁLISIS

#### P: ¿Cómo veo cuántos usuarios Pro tengo?
R: En Supabase Console:
   ```sql
   SELECT COUNT(*) as pro_users
   FROM user_subscriptions
   WHERE plan_tier = 'pro' AND status = 'active'
   ```

#### P: ¿Cuál es mi ingreso mensual?
R: En Supabase:
   ```sql
   SELECT SUM(price_cents) / 100 as total_eur
   FROM user_subscriptions
   WHERE plan_tier = 'pro' AND status = 'active'
   ```

#### P: ¿Cómo veo la tasa de churn (cancelaciones)?
R: En Stripe Dashboard:
   - Ve a: Analytics
   - Busca gráfico de suscripciones
   - Muestra: Activas, Nuevas, Canceladas

---

### 🚀 DEPLOYMENT

#### P: ¿Cómo deployment en producción?
R: Pasos:
   1. Deploy a Vercel (git push)
   2. En Vercel Dashboard → Settings → Environment Variables
   3. Agregar: STRIPE_SECRET_KEY, STRIPE_PRICE_ID_PRO, STRIPE_WEBHOOK_SECRET
   4. Usar `sk_live_xxx` (keys en vivo)
   5. Actualizar webhook URL en Stripe
   6. Cambiar STRIPE_WEBHOOK_SECRET

#### P: ¿Mi app baja en producción?
R: Vercel maneja deploys con cero downtime
   - Usuarios existentes no se afectan
   - Nuevos usuarios ven versión actualizada

#### P: ¿Necesito SSL/TLS?
R: Sí, Vercel lo incluye automáticamente
   - Tu dominio → HTTPS automático
   - Stripe requiere HTTPS para webhook

---

### 🆘 ERRORES COMUNES

#### Error: \"Cannot find module 'stripe'\"
```
Solución: npm install stripe
```

#### Error: \"STRIPE_SECRET_KEY is not defined\"
```
Solución: 
1. Crear .env.local en RAÍZ
2. Agregar STRIPE_SECRET_KEY=sk_test_xxx
3. Restart: npm run dev
```

#### Error: \"Invalid tier. Only 'pro' is supported\"
```
Solución: En Plans.tsx, asegúrate tier: 'pro' (no otros valores)
```

#### Error: \"User already has active subscription\"
```
Esperado: Usuario ya tiene Pro
Solución: Espera a que Stripe webhook cancele la anterior, o cancela manualmente
```

#### Error: \"Webhook error: Signature verification failed\"
```
Solución: STRIPE_WEBHOOK_SECRET incorrecto en .env.local
Verifica en Stripe Dashboard que sea exacto
```

---

### 📱 MOBILE/RESPONSIVO

#### P: ¿Funciona en mobile?
R: Sí, Stripe checkout es responsive
   - Plans.tsx es responsive (Tailwind)
   - Checkout se abre en Stripe (full screen)

#### P: ¿Qué tamaño de pantalla soportas?
R: Desktop, tablet, mobile (320px+)
   - Tailwind breakpoints: sm, md, lg, xl, 2xl

---

### 🎨 CUSTOMIZACIÓN FUTURA

#### P: ¿Puedo cambiar el diseño del checkout?
R: En versión básica, no (Stripe hosted)
   - Para custom UI: usar Stripe Payment Element (futuro)
   - Necesitaría refactor de checkout.ts

#### P: ¿Puedo agregar más tiers (Enterprise)?
R: Sí, fácil:
   1. Agregar tier en `api/user/plans.ts`
   2. Crear Price en Stripe
   3. Agregar condition en `checkout.ts` (if tier === 'enterprise')
   4. UI en `Plans.tsx`

#### P: ¿Puedo integrar con otra plataforma de pagos?
R: Sí, pero necesitarías:
   1. Cambiar Stripe SDK por otra (Paddle, Lemonsqueezy, etc.)
   2. Modificar checkout.ts
   3. Adaptar webhook
   4. Cambiar payment_provider en BD

---

## 📞 SOPORTE RÁPIDO

| Problema | Solución |
|----------|----------|
| \"Missing signature\" | Verifica STRIPE_WEBHOOK_SECRET |
| \"Stripe not configured\" | Crea .env.local con variables |
| Webhook no dispara | Usa stripe listen CLI local |
| BD no actualiza | Revisa logs [Stripe Webhook] |
| Checkout redirige a error | Verifica STRIPE_SECRET_KEY y PRICE_ID |
| Usuario no ve Pro | Espera webhook, refresh página |

---

## 🎓 APRENDE MÁS

- Stripe Docs: https://stripe.com/docs/api
- Webhooks: https://stripe.com/docs/webhooks
- Test Cards: https://stripe.com/docs/testing
- Stripe CLI: https://stripe.com/docs/stripe-cli

---

**¿No encuentras la respuesta? Revisar STRIPE_SETUP_GUIDE.md → Troubleshooting**
