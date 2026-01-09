# 💳 Stripe Payment Link - Setup Simple

## ¿Qué es un Payment Link?

Un **Payment Link** es una URL que creas en Stripe Dashboard y compartes directamente. No necesitas backend ni API.

---

## 🚀 SETUP EN 3 PASOS (5 minutos)

### Paso 1: Crear Payment Link en Stripe

1. Ve a https://dashboard.stripe.com/payment-links
2. Click **"+ Create payment link"**
3. Configurar:
   - **Producto**: Trip Companion Pro
   - **Precio**: €19/mes (Recurring monthly)
   - **After payment**: Redirect to URL → `https://tu-app.vercel.app/plans?payment=success`
4. Click **"Create link"**
5. **Copia el link** (ej: `https://buy.stripe.com/test_abc123xyz`)

### Paso 2: Configurar en tu app

Opción A - Variable de entorno:
```env
# En .env.local
VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/test_abc123xyz
```

Opción B - Directo en código (ya está configurado):
```typescript
// src/pages/Plans.tsx línea 13
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_abc123xyz";
```

### Paso 3: Configurar Webhook (para actualizar BD)

1. Ve a https://dashboard.stripe.com/webhooks
2. Click **"+ Add endpoint"**
3. URL: `https://tu-app.vercel.app/api/stripe/webhook`
4. Eventos: `checkout.session.completed`
5. Copia el **Signing secret** → `.env.local`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   STRIPE_SECRET_KEY=sk_test_xxxxx
   ```

---

## ✅ FLUJO

```
Usuario click "Pagar con Stripe"
         ↓
Redirige a: https://buy.stripe.com/xxx?client_reference_id=user_id
         ↓
Usuario paga en Stripe Checkout
         ↓
Stripe redirige a: /plans?payment=success
         ↓
Webhook actualiza user_subscriptions
         ↓
Usuario tiene plan Pro ✨
```

---

## 📁 ARCHIVOS NECESARIOS

Solo necesitas:
- `src/pages/Plans.tsx` - Ya configurado ✅
- `api/stripe/webhook.ts` - Ya existe ✅
- `.env.local` - Con tu Payment Link

---

## 🔧 Variables de Entorno

```env
# Obligatorio
VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/test_xxxxx

# Para webhook (actualizar BD)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

---

## 🧪 Testing

1. Crea Payment Link en modo **Test**
2. Copia URL a `.env.local` o `Plans.tsx`
3. `npm run dev`
4. Ve a `/plans` → Click "Pagar con Stripe"
5. Usa tarjeta: `4242 4242 4242 4242`
6. Después del pago, redirige a `/plans?payment=success`

---

## ❓ FAQ

**¿Necesito backend para checkout?**
No. El Payment Link es una URL directa de Stripe.

**¿Necesito webhook?**
Sí, para actualizar la BD cuando el usuario paga.

**¿Puedo personalizar el checkout?**
Sí, en Stripe Dashboard → Payment Links → Edit.

**¿Cómo sé qué usuario pagó?**
El `client_reference_id` en la URL identifica al usuario.

---

## 📞 Links

- Payment Links: https://dashboard.stripe.com/payment-links
- Webhooks: https://dashboard.stripe.com/webhooks
- Test Mode: https://dashboard.stripe.com/test/payment-links
