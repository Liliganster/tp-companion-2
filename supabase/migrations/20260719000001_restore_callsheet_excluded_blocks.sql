-- Restaura callsheet_excluded_blocks (base del multi-crew de la v2 —
-- decisión de la propietaria 2026-07-19). Idempotente: inofensiva si la
-- tabla ya existe (p.ej. si nunca pegaste la versión de
-- 20260719000000_security_hardening.sql que la borraba).
--
-- Modelo de acceso (igual que siempre, y seguro):
--   · Solo el service role escribe (el extractor, best-effort).
--   · El usuario solo puede LEER los bloques de sus propios jobs (RLS por
--     join a callsheet_jobs.user_id). Nada de INSERT/UPDATE/DELETE de cliente.
--   · ON DELETE CASCADE: al borrar el job (o la cuenta) se van sus bloques.

CREATE TABLE IF NOT EXISTS public.callsheet_excluded_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.callsheet_jobs(id) ON DELETE CASCADE,
    label TEXT, -- PARKING, BASE, CATERING, etc.
    page INT,
    evidence_text TEXT,
    reason TEXT
);

ALTER TABLE public.callsheet_excluded_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view audit for own jobs" ON public.callsheet_excluded_blocks;
CREATE POLICY "Users can view audit for own jobs" ON public.callsheet_excluded_blocks FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.callsheet_jobs WHERE id = callsheet_excluded_blocks.job_id AND user_id = auth.uid())
);
