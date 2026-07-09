/**
 * Feature flags de Fahrtenbuch Pro.
 *
 * Fase 1 del PLAN.md: la app se hace pequeña. Todo lo que está en `false`
 * queda HIBERNADO — el código sigue en el repo y se reactiva cambiando el
 * flag, sin restaurar nada de git.
 *
 * No convertir en configuración por usuario: son decisiones de producto.
 */
export const FEATURES = {
  /** Páginas Advanced (/advanced, /advanced/routes, /advanced/costs, /advanced/emissions). */
  advancedPages: false,
  /** Extracción IA de facturas (invoice-worker, ProjectInvoiceUploader). */
  invoiceAi: false,
  /** Extracción IA de recibos de gastos (ExpenseScanButton). Adjuntar foto + importe manual SIEMPRE disponible. */
  expenseAi: false,
  /** Odómetro: página pública /odometer-capture y sección de ajustes (flujo QR + foto + IA). */
  odometer: false,
  /** Integración Google Drive (picker de importación, descarga de adjuntos). */
  googleDrive: false,
} as const;
