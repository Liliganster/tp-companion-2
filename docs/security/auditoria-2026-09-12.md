# Auditoría de seguridad y costes — 12 de septiembre de 2026

**Dictamen: no recomiendo abrir todavía la aplicación a producción comercial sin restricciones.** Hay controles importantes, pero el código no establece un techo completo de gasto, hay credenciales de clientes persistidas en el navegador y faltan garantías en pagos y aislamiento relacional.

Checkout: `C:\Users\lilia\Escritorio\trip-companion-main 2\trip-companion-main`.
Commit examinado: `4ad60f3d3153ef52a35c449a19e14e34c76d01ec`. Árbol inicialmente limpio.

No se han cambiado código de producto, configuraciones remotas, planes ni datos de clientes. Se realizaron lecturas de metadatos y consultas anónimas sin recuperar filas personales. No se ejecutaron ataques de carga, llamadas de IA, pagos ni borrados reales.

## Qué está comprobado

- `npm run test:run -- --reporter=dot`: **420 pruebas, 69 archivos, todo aprobado**.
- `npm run typecheck`: aprobado. Este comando incluye frontend y extractor; no equivale a comprobar todas las rutas API ni SQL.
- `npm audit --omit=dev --json`: **24 entradas de paquetes afectados: 2 críticas, 11 altas, 9 moderadas y 2 bajas**. Incluye dependencias transitivas y severidades heredadas; no son 24 ataques demostrados.
- HTTPS del dashboard: 200, HSTS presente.
- Sin sesión, `/api/user/subscription`, `/api/google/oauth/access-token` y `/api/worker`: 401.
- En el Supabase configurado en `.env.local`, buckets `callsheets` y `project_documents`: privados. Callsheets limita cada archivo a 52.428.800 bytes; project_documents no tiene límite específico de bucket. Ambos carecen de lista de MIME permitidos. Puede existir además un límite global de plataforma, no inspeccionado.
- Consultas anónimas con conteo y `limit=0` sobre perfiles, proyectos, viajes, jobs y conexiones Google: cero filas visibles. Billing y reservas: 401.
- Existen las tablas de reservas atómicas, entitlements y borrado reanudable. Su existencia NO prueba que todas las funciones, triggers y políticas coincidan con la última migración local.
- Registro por email requiere confirmación según la configuración pública consultada. No se verificaron en el panel CAPTCHA, contraseñas filtradas, reautenticación ni MFA.

La lectura de Supabase usa la conexión local; no se ha demostrado que cada variable y versión desplegada en Vercel coincida con este checkout.

## Bloqueadores prioritarios

### 1. Alto — La cuota de IA no limita todo el consumo facturable

Evidencia: `api/_utils/aiQuota.ts`, `api/callsheets.ts:81-120`, `supabase/migrations/20260910000001_callsheet_atomic_result.sql:13-42`, `src/lib/ai/callsheetProfile.ts`.

Se reserva cuota antes del proveedor y se consume al guardar correctamente el resultado. Las extracciones válidas marcadas `needs_review` también se cobran en la migración actual. Los fallos, respuestas truncadas, JSON inválido o timeouts liberan la reserva. Estos intentos pueden haber generado gasto del proveedor. Un usuario puede volver a solicitar el procesamiento sin agotar sus 3/60 resultados mensuales si continúa fallando. El endpoint limita a 10 solicitudes por minuto, pero no hay presupuesto acumulado de intentos fallidos.

Hay defensas útiles: una llamada de proveedor por acción, sin reintento automático de esquema; 100 segundos de timeout; salida de 8.192 tokens y presupuesto de razonamiento de 1.024. Los PDFs se envían completos y el límite de bytes no equivale a un límite de tokens/páginas. No hay un techo económico global previo a todas las llamadas.

**Corrección:** separar cuota comercial de resultados del presupuesto interno de consumo. Reservar atómicamente coste máximo antes de cada llamada, por cuenta y globalmente; contabilizar fallos e intentos cuyo coste sea incierto; limitar reintentos, páginas/tokens y concurrencia. Si falla el contador, bloquear consumo. Conservar margen para solicitudes en vuelo y retrasos de medición.

**Aceptación:** con una sola unidad disponible y solicitudes concurrentes, únicamente se autoriza el consumo previsto; diez documentos que fallen después de llamar al proveedor no generan diez intentos gratis para el presupuesto interno; un reinicio o fallo de persistencia no reinicia el saldo.

### 2. Alto — Maps y servicios externos carecen de tope acumulado

Evidencia: `api/google.ts:117,175,244,306`, `api/external.ts:76,232`, `api/_utils/plans.ts`.

Los límites por usuario son 120 geocodificaciones/minuto, 60 rutas/minuto, 300 autocompletados/minuto y 120 detalles/minuto. Los planes declaran cálculos de distancia ilimitados. Se usa caché en geocoding/rutas, pero entradas distintas pueden evitarla. Climatiq y Electricity Maps también tienen límites por minuto, no presupuestos acumulados.

Ejemplo aritmético: 60 rutas/minuto permiten 86.400 solicitudes diarias por cuenta si se mantiene ese ritmo. No es una predicción de tráfico, de precio ni de capacidad real: muestra que el límite actual controla velocidad, no gasto mensual.

**Corrección:** cuotas diarias/mensuales y globales antes de consultar cada proveedor, caché, restricción de APIs y dominios de las claves públicas, límites del proveedor y un interruptor que suspenda funciones de coste conservando la consulta de datos cuando sea posible. Verificar también cargas del mapa en navegador, fuera del proxy del servidor.

### 3. Alto — Rate limiting dependiente de configuración y subidas sin cuota de almacenamiento

Evidencia: `api/_utils/rateLimit.ts:46-60,113-130`, `api/callsheets.ts:125-164`, `supabase/migrations/20241223000001_storage_bucket.sql:8-13`.

Si no hay Upstash, el código recurre a memoria por instancia. En serverless no es un contador compartido y se pierde con reinicios. Las variables Upstash están ausentes en el archivo local; **no se ha comprobado si están en Vercel**. Si Redis está configurado pero falla, no hay un fallback explícito que permita continuar: no confundir ese caso con Redis ausente.

Crear una URL de subida no exige saldo de IA ni reserva de bytes. Además, las políticas locales permiten subir directamente a Storage dentro de la carpeta propia: un límite en la API de Vercel no basta. No se encontró límite total de archivos/bytes por usuario ni limpieza programada de cargas abandonadas.

**Corrección:** exigir contador distribuido en producción; aplicar reserva de capacidad y autorización de subida que también cubra el acceso directo a Storage; fijar tamaño/MIME por bucket y límites acumulados; eliminar huérfanos mediante un proceso con política de retención. Añadir controles contra creación masiva de cuentas: la identidad estable evita algunos reinicios de cuota, no múltiples identidades.

### 4. Alto — Clave OpenRouter del cliente expuesta a scripts del navegador

Evidencia: `src/contexts/UserProfileContext.tsx:119-183,210`, `src/lib/offlineCache.ts:11-15`, `api/user.ts:138`, `supabase/migrations/20260301000000_add_openrouter_support.sql`.

La clave se guarda como texto en el perfil, vuelve al cliente con `select('*')` y se persiste en localStorage junto con el perfil. Una extensión con permisos o una vulnerabilidad XSS podría obtenerla y consumir crédito del cliente fuera de la app. No se ha demostrado un robo ni una vulnerabilidad XSS explotable; el problema confirmado es la ubicación y persistencia del secreto.

**Corrección:** almacenamiento exclusivamente servidor, cifrado con clave separada, escritura sin lectura de vuelta del secreto; mostrar solo estado de configuración y últimos caracteres. Retirar la clave de la caché y migrar/borrar copias antiguas. Considerar límites propios de la clave del proveedor. Revisar asimismo cifrado de refresh tokens Google: actualmente se escriben como texto en una tabla de acceso restringido.

### 5. Alto — Falta validar propiedad de relaciones entre usuarios

Evidencia: políticas de `callsheet_jobs` en `20241223000000_universal_extractor.sql` y `20251224000001_fix_missing_rls_policies.sql`; `20241223000005_add_project_context_to_jobs.sql`; trigger en `20260910000002_fix_callsheet_project_trigger.sql:12-21`.

Las políticas verifican que el job sea propio, pero la FK `project_id` solo comprueba que exista el proyecto. No se encontró comprobación de que pertenezca al mismo usuario. El trigger de extracción lee el nombre del proyecto enlazado y lo incorpora a un motivo de revisión; ejecutado desde el guardado privilegiado, puede revelar el nombre de un proyecto ajeno si se conoce su UUID y se consigue enlazarlo a un job propio.

**Estado:** cadena de riesgo fundamentada en código y SQL; no reproducida con dos usuarios ni comprobada contra las definiciones SQL activas. No significa que se puedan descargar arbitrariamente todos los documentos. El patrón de FK sin propiedad aparece también en otras relaciones y requiere inventario.

**Corrección:** verificar propiedad al insertar/actualizar cada relación, preferiblemente mediante restricciones compuestas o triggers/policies coherentes; filtrar también el join del trigger. No confiar en que el UUID sea difícil de adivinar.

**Aceptación:** dos cuentas aisladas; B no puede asignar su job, documento, gasto o viaje a un proyecto de A ni obtener nombres por respuestas, errores o resultados. Probar directamente PostgREST y Storage, además de Vercel.

### 6. Alto — Sesiones de checkout múltiples y borrado dependiente del navegador

Evidencia: `api/stripe.ts:37-59`, `api/_utils/accountDeletion.ts`, `src/lib/deleteAccount.ts`, `supabase/migrations/20260909000003_resumable_account_deletion.sql`.

Checkout comprueba suscripciones existentes, pero no reutiliza ni bloquea sesiones abiertas y la creación de sesión no lleva clave de idempotencia. Dos pestañas pueden obtener sesiones antes del primer pago. Si ambas se completan, hay riesgo de dos suscripciones para el mismo cliente. **No se efectuaron pagos para reproducirlo.**

El borrado cancela billing antes de eliminar archivos/datos y es reanudable, lo cual es positivo. Sin embargo, depende de peticiones sucesivas del navegador; no se encontró un worker que complete las solicitudes de borrado abandonadas. Cerrar la página antes de llegar a la fase de cancelación puede dejar la solicitud pendiente y la suscripción activa.

**Corrección:** una sesión abierta de checkout por cuenta, idempotencia y reconciliación de duplicados; worker duradero que complete borrados/cancelaciones aunque el usuario cierre el navegador. Exigir reautenticación reciente para iniciar borrado: el endpoint actual acepta una sesión válida sin esa comprobación adicional.

**Aceptación:** doble clic/dos pestañas producen una sola suscripción; cierre de navegador tras iniciar borrado no impide cancelar; verificar webhooks repetidos, fuera de orden y fallidos en Stripe test.

## Otros puntos que deben cerrarse

- **Cabeceras del navegador:** producción no devuelve CSP, X-Frame-Options, X-Content-Type-Options ni Referrer-Policy en la página comprobada. Añadir CSP compatible con Google/Stripe, `frame-ancestors`, `nosniff` y política de referer. Usar `Cache-Control: private, no-store` en respuestas sensibles. La falta de cabeceras es defensa ausente, no demostración de XSS o fuga de caché.
- **Dependencias:** 24 entradas afectadas en auditoría npm. Priorizar paquetes realmente alcanzables en navegador/servidor, actualizar y repetir regresiones. jsPDF y autotable aparecen críticos, pero el aviso de lectura de archivos de jsPDF afecta su build Node; los usos encontrados son de frontend. No atribuir una lectura arbitraria del servidor sin demostrar ese recorrido. [Aviso del mantenedor](https://github.com/parallax/jsPDF/security/advisories/GHSA-f8cm-6447-x5h2).
- **Facturación desactualizada:** `getServerPlanTier` confía en el tier persistido; no valida por sí solo vencimiento ni frescura del webhook. `past_due` conserva Pro sin plazo de gracia interno. Definir plazo y reconciliación periódica con Stripe. La sincronización compara fechas antes de escribir, no mediante una actualización condicional atómica.
- **Privacidad:** `src/pages/LegalPrivacy.tsx` conserva placeholders de empresa/contacto y recomendaciones editoriales sobre proveedores/retención. El extractor transmite documentos completos. Cerrar el inventario de datos, proveedores, contratos, retención y transferencias antes de aceptar documentación confidencial. No se verificó el plan real de Gemini: sus términos exigen Paid Services al ofrecer clientes API a usuarios del EEE, Suiza o Reino Unido; comprobar cuenta y tratamiento aplicable. [Términos Gemini](https://ai.google.dev/gemini-api/terms).
- **OAuth Google:** el estado está firmado y caduca, pero no hay prueba de consumo único/ligadura al navegador mediante cookie o PKCE en el flujo inspeccionado. Revisar vinculación de cuenta y retornos con origen permitido; probar intercambio de estados entre dos navegadores.
- **Sesiones e infraestructura:** cache de validación de usuario de hasta 15 minutos en API. Probar revocación/bloqueo real, recuperación, cambio de contraseña y dispositivos compartidos. Verificar MFA de propietaria en Google, GitHub, Supabase, Vercel y Stripe, mínimos privilegios y rotación de secretos. No se inspeccionaron esos paneles.
- **Continuidad:** falta evidencia de restauración de DB y archivos, alertas que lleguen a la propietaria y procedimiento de incidentes. Las pruebas unitarias no validan backups, restauración, políticas RLS desplegadas ni cortes reales de gasto.

## Configuración externa necesaria para un corte económico real

No se han verificado importes, planes, facturas ni topes actualmente configurados. No es posible prometer una factura máxima en euros con esta evidencia.

- Google Cloud/Maps/Gemini: distinguir presupuesto de solo alertas de un mecanismo que detenga consumo. Verificar las cuotas y cobertura del spend cap disponibles para los servicios usados; un presupuesto de alertas no bloquea por sí solo. [Presupuestos](https://docs.cloud.google.com/billing/docs/how-to/budgets), [spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).
- Vercel: comprobar Spend Management y activar explícitamente pausa de producción al umbral adecuado, con margen para consumo en curso. [Documentación](https://vercel.com/docs/spend-management).
- Supabase: el Spend Cap Pro cubre determinados conceptos, no toda la factura; en Free no hay cobro por uso según la documentación, pero superar límites afecta al servicio. Verificar plan efectivo y cobertura. [Control de costes](https://supabase.com/docs/guides/platform/cost-control).
- Upstash, Sentry y cualquier API externa: verificar plan, cuota y comportamiento al agotarse. Los logs y contadores también consumen recursos.

## Condiciones para autorizar el lanzamiento

1. Presupuestos internos atómicos de IA/Maps/almacenamiento, con tope global y por cuenta, más límites de proveedor verificados.
2. Claves de clientes fuera del navegador y cabeceras de protección desplegadas.
3. Pruebas de aislamiento entre dos cuentas y revisión de funciones/policies realmente desplegadas.
4. Checkout único y cancelación/borrado duradero, probados con fallos y concurrencia en entorno de pruebas.
5. Dependencias alcanzables corregidas, privacidad completada y recuperación demostrada.

Hasta entonces, una beta limitada requiere controlar invitaciones, consumo y datos aceptados; no debe presentarse como un lanzamiento con gasto acotado y seguridad ya certificada.
