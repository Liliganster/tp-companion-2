# Paquetes de créditos de IA

Compra puntual de 100 extracciones de callsheets por 10 EUR, disponible para Basic y Pro. Sin caducidad. No cambia la suscripción ni el tamaño de lote del plan. Primero se utiliza la cuota incluida (3 al mes en Basic, 60 al mes en Pro mensual o 400 por año de suscripción en Pro anual). Después se reserva saldo adicional. Solo una extracción guardada correctamente, incluso si necesita revisión, consume una unidad. Los fallos liberan la reserva. Una reextracción manual correcta consume otra unidad.

## Activación, en este orden

1. Aplicar `supabase/migrations/20261001000003_ai_credit_packs.sql` en el Supabase del despliegue. Requiere las migraciones de cuotas anteriores. Crea las tablas protegidas de saldo y compras y actualiza tres funciones de cuotas. No modifica planes, viajes, precios de suscripciones ni cuotas incluidas; tampoco concede créditos a usuarios existentes.
2. En el webhook de Stripe que apunta a `/api/stripe-webhook`, conservar los eventos existentes y habilitar `checkout.session.completed`, `checkout.session.async_payment_succeeded` y `charge.refunded`. Usar la misma cuenta/modo que `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`.
3. Publicar la app en Vercel. Se reutilizan las variables actuales de Stripe y `APP_URL`; no hace falta crear un producto, Price ID ni variable para este paquete. El servidor crea el precio de 1000 céntimos EUR al abrir Checkout. No se admiten cupones ni cantidad o importe enviados por el cliente. `tax_behavior=inclusive` no activa por sí mismo Stripe Tax.
4. Validar una compra en un entorno separado con claves de prueba y comprobar el saldo después de volver y después de cerrar Checkout sin volver a la app. Reenviar el mismo evento no debe duplicarlo. No mezclar claves de prueba y el webhook de producción.

Antes de que exista la nueva base de datos, el servidor bloquea la creación de Checkout para evitar cobrar sin poder guardar el saldo. Si se revierte la app, conservar la migración y las tablas: el saldo adquirido no debe eliminarse.

## Confirmación y saldo

La compra se confirma recuperando la sesión y el pago directamente de Stripe. Se comprueban propietario, cliente, importe, moneda y pago completado. El webhook y la página de retorno llaman a la misma operación idempotente. Visitar la URL de éxito no concede créditos. Si el pago tarda, la página ofrece «Comprobar pago» y el webhook también puede completarlo sin tener abierta la app. No hay compras automáticas, suscripción adicional ni bucles de comprobación.

Las reservas y los cobros de cuotas comparten el bloqueo de usuario en PostgreSQL. Se mantienen como máximo dos extracciones activas y la protección frente a reintentos automáticos. El saldo reservado no se ofrece a otra extracción. El consumo de créditos se registra aparte del consumo incluido y persiste al renovar o cancelar el plan y al borrar documentos.

Los reembolsos confirmados por Stripe retiran proporcionalmente los créditos de esa compra (redondeo hacia arriba por unidad). Si ya se gastaron, la deuda se descuenta de siguientes compras; nunca se restaura saldo por un evento antiguo. Los contracargos/disputas no se automatizan en este cambio y requieren gestión administrativa. Al borrar la cuenta se elimina el saldo y se anonimizan los identificadores de compra, conservando la protección frente a repetir un pago.

## Pruebas locales

- `npm run typecheck` incluye ahora los endpoints de Stripe.
- `npm run test:run`: pruebas de servidor, webhook, UI y regresiones existentes.
- `node scripts/test-ai-credits.mjs`: 16 escenarios ejecutados en PostgreSQL mediante PGlite. Se puede pasar la URL de un módulo PGlite instalado como primer argumento.
- `npm run build`.

No se han efectuado cargos reales ni extracciones pagadas para estas pruebas. Las pruebas locales no acreditan que la migración o los eventos estén activados en producción.

Referencia del flujo de confirmación: https://docs.stripe.com/checkout/fulfillment
