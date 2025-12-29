# Configuración de Variables de Entorno en Vercel

Para que la extracción de IA funcione correctamente, necesitas configurar estas variables de entorno en tu proyecto de Vercel:

## Variables Requeridas

### 1. **GEMINI_API_KEY**
- **Descripción**: API Key de Google AI Studio para Gemini
- **Cómo obtenerla**: 
  1. Ve a [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
  2. Crea un nuevo API Key
  3. Copia el valor
- **Valor**: Tu API key de Gemini (ej: `AIzaSy...`)

### 2. **GOOGLE_MAPS_SERVER_KEY**
- **Descripción**: API Key de Google Maps para geocodificación
- **Cómo obtenerla**:
  1. Ve a [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
  2. Crea un nuevo API Key (o usa uno existente)
  3. Habilita la API de Geocoding
  4. Copia el valor
- **Valor**: Tu API key de Google Maps (ej: `AIzaSy...`)

### 3. **CRON_SECRET**
- **Descripción**: Secret para autenticar las llamadas al worker desde el cron
- **Cómo generarlo**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Valor**: Un string aleatorio seguro (ej: `d4e5f6a7b8c9...`)

### 4. **SUPABASE_SERVICE_ROLE_KEY**
- **Descripción**: Service Role Key de Supabase para operaciones del servidor
- **Cómo obtenerla**:
  1. Ve a tu proyecto en [https://app.supabase.com](https://app.supabase.com)
  2. Settings → API
  3. Copia el "service_role" key (¡NO uses el anon key!)
- **Valor**: Tu service role key de Supabase

### 5. **VITE_SUPABASE_URL** y **VITE_SUPABASE_ANON_KEY**
- Ya deberían estar configuradas desde el setup inicial de Supabase
- Si no, las encuentras en Settings → API en tu proyecto de Supabase

## Validación de variables (fail-fast)
La app valida variables críticas al iniciar:
- **Frontend (React)**: si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en producción, la app falla rápido para evitar un deploy a medias.
- **Workers (IA)**: si falta `GEMINI_API_KEY`, el worker falla rápido (no intenta hacer llamadas a IA sin clave).
- **Supabase server**: si faltan `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, los endpoints de servidor fallan con error claro.

## Cómo Configurar en Vercel

1. Ve a tu proyecto en [https://vercel.com](https://vercel.com)
2. Click en **Settings** (arriba)
3. Click en **Environment Variables** (menú lateral)
4. Para cada variable:
   - Haz click en **Add**
   - Ingresa el **Key** (nombre de la variable)
   - Ingresa el **Value** (valor secreto)
   - Selecciona los ambientes: **Production**, **Preview**, **Development**
   - Click en **Save**

## Verificar Configuración

Después de configurar las variables:

1. **Redeploy** tu aplicación:
   - Ve a **Deployments**
   - Click en los 3 puntos del último deployment
   - Click en **Redeploy**

2. **Verifica los logs**:
   - Ve a tu proyecto en Vercel
   - Click en **Functions** o **Logs**
   - Busca logs del endpoint `/api/worker`
   - Deberías ver mensajes como "Processing Job xyz..."

3. **Trigger manual**:
   - Sube un callsheet desde el modal de Proyecto
   - Haz click en el botón **"Procesar ahora"**
   - Deberías ver un toast con "Worker ejecutado: X trabajos procesados"

## Troubleshooting

### El spinner nunca se detiene
- **Causa**: El worker no se está ejecutando o está fallando
- **Solución**: Verifica los logs en Vercel → Functions → `/api/worker`

### Error "Unauthorized" al hacer trigger manual
- **Causa**: Falta o es incorrecta la variable CRON_SECRET
- **Solución**: Verifica que CRON_SECRET esté configurada en Vercel

### No se extraen datos del PDF
- **Causa**: Falta GEMINI_API_KEY o hay error en la API de Gemini
- **Solución**: 
  - Verifica que GEMINI_API_KEY esté configurada
  - Revisa los logs para ver el error específico
  - Verifica que tengas cuota disponible en tu cuenta de Google AI Studio

### No se geocodifican las ubicaciones
- **Causa**: Falta GOOGLE_MAPS_SERVER_KEY
- **Solución**: Configura la variable y verifica que la API de Geocoding esté habilitada

## Desarrollo Local

Si quieres probar en desarrollo local, crea un archivo `.env` en la raíz del proyecto:

```bash
# .env
GEMINI_API_KEY=tu_gemini_api_key
GOOGLE_MAPS_SERVER_KEY=tu_google_maps_api_key
CRON_SECRET=cualquier_string_para_testing
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
```

**IMPORTANTE**: No subas el archivo `.env` a git. Ya está incluido en `.gitignore`.

## Cron Schedule

El worker está configurado para ejecutarse **cada minuto** via Vercel Cron:

```json
{
  "crons": [{
    "path": "/api/worker",
    "schedule": "* * * * *"
  }]
}
```

Si los jobs están en estado `queued`, el cron los procesará automáticamente en el siguiente minuto.

El botón **"Procesar ahora"** en el modal del proyecto permite forzar la ejecución inmediata sin esperar al cron.
