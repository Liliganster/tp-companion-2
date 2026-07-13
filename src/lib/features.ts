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
  /** Páginas Advanced (/advanced, /advanced/routes, /advanced/emissions).
      El análisis de costes fue ELIMINADO (no hibernado) a pedido de la
      propietaria 2026-07-10. */
  advancedPages: false,
  /** Integración Google Drive (picker de importación, descarga de adjuntos). */
  googleDrive: false,
} as const;
