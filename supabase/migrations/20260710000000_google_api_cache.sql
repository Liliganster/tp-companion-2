-- Caché de Google Maps (geocoding y rutas) — Fase 2 del PLAN.md.
-- Los rodajes repiten localizaciones durante semanas: cachear recorta el
-- mayor coste variable (Google Maps). Tabla SOLO para el service role
-- (RLS activado sin políticas a propósito: los clientes nunca la tocan).
-- TTL por código: geocodes 180 días, rutas 30 días (columna updated_at).

CREATE TABLE IF NOT EXISTS public.google_api_cache (
  cache_key text PRIMARY KEY,
  kind text NOT NULL,          -- 'geocode' | 'geocode_api' | 'directions'
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_api_cache ENABLE ROW LEVEL SECURITY;
