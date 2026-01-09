# Guía de Configuración de Stripe

## 1. Requisitos Previos
- Cuenta Stripe activa (https://stripe.com)
- Acceso al Dashboard de Stripe
- Variables de entorno configuradas

## 2. Pasos en el Dashboard de Stripe

### 2.1. Crear Producto "Trip Companion Pro"
1. Ir a **Products** → **Add product**
2. Nombre: `Trip Companion Pro`
3. Descripción: `Monthly subscription for Trip Companion Pro tier`
4. Pricing model: **Standard pricing** → **Recurring**
   - Interval: **Monthly**
   - Amount: **1900** (19€ en centavos)
   - Currency: **EUR**
5. Guardar el **Price ID** (ej: `price_xxxxx`)

### 2.2. Obtener API Keys
1. Ir a **Developers** → **API Keys**
2. Copiar:
   - **Publishable key** (usa en frontend - no necesario ahora)
   - **Secret key** (guarda en STRIPE_SECRET_KEY)

### 2.3. Configurar Webhook
1. Ir a **Developers** → **Webhooks**
2. Click **Add endpoint**
3. URL del endpoint: `https://tu-domain.vercel.app/api/stripe/webhook`
4. Events a escuchar:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copiar **Signing secret** (guarda en STRIPE_WEBHOOK_SECRET)

## 3. Variables de Entorno Necesarias

### En `.env.local` (desarrollo)
```env
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PRICE_ID_PRO=price_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

### En Vercel (producción)
1. Proyecto en Vercel → **Settings** → **Environment Variables**
2. Agregar:
   - Name: `STRIPE_SECRET_KEY` / Value: `sk_live_xxxxx` (con keys en vivo)
   - Name: `STRIPE_PRICE_ID_PRO` / Value: `price_xxxxx`
   - Name: `STRIPE_WEBHOOK_SECRET` / Value: `whsec_xxxxx`

## 4. Testing en Modo Desarrollo

### Tarjetas de Prueba
- **Éxito**: `4242 4242 4242 4242`
- **Fallo**: `4000 0000 0000 0002`
- Fecha: Cualquier futura (ej: `12/26`)
- CVC: Cualquier número de 3 dígitos

### Flujo de Prueba
1. Registrate en la aplicación
2. Navega a `/plans`
3. Click en **"Pagar con Stripe"** (Pro)
4. Completa el formulario de Stripe
5. Usa tarjeta `4242...` para éxito
6. Verifica que:
   - Se redirija a página de éxito
   - `user_subscriptions` se actualice a `plan_tier='pro'`
   - Badge en dashboard muestre "Pro"
   - Límites cambien a: 2000 trips, 60 AI jobs, etc.

### Logs de Debugging
En el navegador (Console) y servidor:
- `[Stripe]` logs en `/api/stripe/checkout`
- `[Stripe Webhook]` logs en `/api/stripe/webhook`

## 5. Migrando a Producción

### Pasos
1. Cambiar keys a `sk_live_xxxxx` en Vercel
2. Cambiar Product Price ID si es diferente
3. Cambiar webhook URL a dominio de producción
4. Re-generar webhook signing secret con nueva URL
5. Actualizar STRIPE_WEBHOOK_SECRET en Vercel
6. Probar con pago real (o seguir usando test keys si es posible)

## 6. Estructura de Código

### Endpoints Creados
- **POST `/api/stripe/checkout`**
  - Crea Stripe checkout session para usuario
  - Requiere: Bearer token, body con `{ tier: 'pro' }`
  - Retorna: `{ sessionId, url }`
  
- **POST `/api/stripe/webhook`**
  - Escucha eventos de Stripe
  - Valida con STRIPE_WEBHOOK_SECRET
  - Actualiza user_subscriptions en Supabase

### Actualización en Frontend
- **src/pages/Plans.tsx**
  - Función `handleStripeCheckout()`
  - Click en Pro → POST /api/stripe/checkout
  - Redirige a `session.url` (Stripe checkout alojado)

### Base de Datos
- **user_subscriptions table**
  - Campos nuevos: `external_subscription_id`, `status`
  - Se actualiza automáticamente con webhook
  - RLS previene acceso no autorizado

## 7. Troubleshooting

### Webhook no se ejecuta
- Verificar STRIPE_WEBHOOK_SECRET es correcto
- Verificar firma de webhook en logs `[Stripe Webhook]`
- Cambiar URL en Stripe dashboard si cambió dominio
- Usar `stripe listen` en local para testing

### Checkout redirige a error
- Verificar STRIPE_SECRET_KEY es válido
- Verificar STRIPE_PRICE_ID_PRO existe en Stripe
- Revisar logs `[Stripe]` en servidor
- Usar tarjeta de prueba correcta

### Usuario no se actualiza a Pro
- Verificar webhook recibió evento
- Ver logs `[Stripe Webhook]` para identificar fallo
- Verificar RLS en user_subscriptions table
- Ejecutar query manual: `UPDATE user_subscriptions SET plan_tier='pro' WHERE user_id=...`

## 8. Seguridad
- ✅ Stripe keys guardadas en variables de entorno
- ✅ Webhook validado con firma
- ✅ RLS en database impide acceso cruzado
- ✅ Bearer token requerido en checkout endpoint
- ✅ Supabase admin client usado solo en backend

## 9. URLs de Referencia
- Docs Stripe: https://stripe.com/docs/api
- Test Mode: https://dashboard.stripe.com/test/dashboard
- Webhooks: https://dashboard.stripe.com/webhooks
