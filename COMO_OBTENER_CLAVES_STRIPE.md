# 🔑 Cómo Obtener las Claves de Stripe

## PASO 1: Ir al Dashboard de Stripe

1. Abre https://dashboard.stripe.com
2. Inicia sesión con tu cuenta Stripe
3. En la **esquina superior derecha**, verifica que estés en **"Test mode"** (azul)
   - Si ves "Live" en rojo, haz click para cambiar a Test

---

## PASO 2: Obtener STRIPE_SECRET_KEY

### Ubicación
1. En el menú izquierdo, selecciona **Developers**
2. Haz click en **API Keys**
3. Verás dos secciones:
   - **Publishable key** (comienza con `pk_test_`)
   - **Secret key** (comienza con `sk_test_`)

### Copiar Secret Key
1. Busca **"Secret key"**
2. Si no está visible, haz click en el botón **"Show test key"**
3. Haz click en el icono **copiar** (dos cuadros superpuestos)
4. La clave se copia al portapapeles

### Pegar en .env.local
```
STRIPE_SECRET_KEY=sk_test_XXXXXXXXXXXXXXXXXXX
```

---

## PASO 3: Crear Producto y Obtener STRIPE_PRICE_ID_PRO

### Crear el Producto
1. En el menú izquierdo, selecciona **Products** → **Products**
   (Busca "Products" en la barra de búsqueda si no lo ves)
2. Haz click en **"+ Add product"** (botón azul)

### Llenar Formulario
```
Nombre del Producto
├─ Ingresa: "Trip Companion Pro"

Descripción (opcional)
├─ Ingresa: "Monthly subscription for Pro tier"

Tipo de Precios
├─ Selecciona: "Standard pricing"
└─ Si aparece, selecciona: "Recurring" (no "One-time")

Modelo de Facturación
├─ Selecciona: "Monthly" (facturación mensual)

Precio
├─ Ingresa: "1900" (en centavos = 19€)
└─ Moneda: "EUR" (o tu moneda local)

Disponibilidad
├─ Deja como está (activo)
```

### Guardar y Copiar Price ID
1. Haz click en **"Create product"** (botón azul)
2. Verás página del producto creado
3. En la sección **"Pricing"**, verás:
   ```
   PRICE
   price_XXXXXXXXXXXX  (Monthly)
   €19.00 per month
   ```
4. Haz click en el Price ID (`price_XXXX...`)
5. Se abrirá un panel con los detalles
6. Copia el **Price ID**

### Pegar en .env.local
```
STRIPE_PRICE_ID_PRO=price_XXXXXXXXXXXXXXXXXXX
```

---

## PASO 4: Crear Webhook y Obtener STRIPE_WEBHOOK_SECRET

### Ir a Webhooks
1. En el menú izquierdo (en "Developers"), selecciona **Webhooks**
2. Haz click en **"+ Add endpoint"** (botón azul)

### Configurar Webhook
1. **URL del Endpoint:**
   ```
   http://localhost:3000/api/stripe/webhook
   ```
   (Para producción: `https://tu-dominio.vercel.app/api/stripe/webhook`)

2. **Select events to listen to:**
   - Busca y selecciona:
     - ✅ `checkout.session.completed`
     - ✅ `customer.subscription.updated`
     - ✅ `customer.subscription.deleted`
   
   (Si no encuentras, puedes escribir en la caja de búsqueda)

3. Haz click en **"Add events"** (si es necesario)

4. Haz click en **"Add endpoint"** (botón azul abajo)

### Copiar Signing Secret
1. Verás tu webhook creado en la lista
2. Haz click en el webhook
3. En la página de detalles, verás:
   ```
   Signing secret
   whsec_XXXXXXXXXXXX
   ```
4. Haz click en **"Reveal"** si está oculto
5. Copia el valor

### Pegar en .env.local
```
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXX
```

---

## RESULTADO FINAL

Tu `.env.local` debe verse así:

```env
STRIPE_SECRET_KEY=sk_test_51Q8x9zGpxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_ID_PRO=price_1Q8xA1Gpxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_1Q8xA2Gpxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## ✅ VERIFICACIÓN

### 1. Archivo creado
- Ubicación: `trip-companion-main/.env.local`
- Contenido: 3 variables de Stripe
- Permisos: Legible por Node.js (servidor local)

### 2. Servidor puede leerlas
```bash
npm run dev
```
En la terminal deberías ver que está usando las variables:
```
[Stripe] Creating checkout... (significa que encontró las variables)
```

### 3. Testing
- Ve a http://localhost:5173/plans
- Haz click en "Pagar con Stripe"
- Si se abre Stripe checkout → ✅ FUNCIONA

---

## 🔐 SEGURIDAD

### ⚠️ IMPORTANTE: .env.local NO debe subirse a Git
- Ya está en `.gitignore`
- Nunca compartas tus keys en público
- Si las comprometes, regenera en Stripe Dashboard

### Para Producción
- En Vercel Dashboard → Settings → Environment Variables
- Agregua las mismas 3 variables
- Cambia `sk_test_xxx` por `sk_live_xxx` (keys reales)
- Cambia webhook URL a tu dominio en vivo

---

## 🆘 SI ALGO FALLA

### "No encuentro API Keys"
- Verifica estar en https://dashboard.stripe.com/test/apikeys (TEST mode)
- No en https://dashboard.stripe.com/live/apikeys (LIVE mode)

### "Price ID no aparece"
- Verifica que el producto se creó exitosamente
- La página debe mostrar el precio "€19.00 per month"
- Si no, vuelve a crear el producto

### "Webhook no funciona"
- Verifica URL es exacto: `http://localhost:3000/api/stripe/webhook`
- Verifica eventos seleccionados (3 eventos)
- Verifica Signing secret es correcto en `.env.local`

### "Las variables no se cargan"
- Reinicia servidor: `npm run dev`
- Verifica `.env.local` existe en la raíz
- Verifica no hay espacios/comillas en las variables

---

## 📚 REFERENCIAS

- Dashboard: https://dashboard.stripe.com
- API Keys: https://dashboard.stripe.com/test/apikeys
- Productos: https://dashboard.stripe.com/test/products
- Webhooks: https://dashboard.stripe.com/test/webhooks
- Documentación: https://stripe.com/docs/api

---

## ⏱️ TIEMPO ESTIMADO

```
Paso 1: Login                    → 1 min
Paso 2: Copiar Secret Key        → 2 min
Paso 3: Crear Producto y Precio  → 3 min
Paso 4: Crear Webhook            → 3 min
─────────────────────────────────────────
TOTAL:                            ~ 9 minutos
```

¡Luego puedes testear inmediatamente! 🚀
