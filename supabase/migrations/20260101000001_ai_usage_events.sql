-- Track AI usage independently from trips/jobs so deleting user data doesn't reset the counter.
-- This table stores one row per successful AI extraction run.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  job_id UUID NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'done',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind IN ('callsheet', 'invoice')),
  CHECK (status IN ('done'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_usage_events_kind_job_run
  ON public.ai_usage_events(kind, job_id, run_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_run_at
  ON public.ai_usage_events(user_id, run_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own AI usage events" ON public.ai_usage_events;
CREATE POLICY "Users can view own AI usage events"
  ON public.ai_usage_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Backfill existing successful jobs (best-effort).
-- We intentionally do NOT add FKs to job tables because jobs can be deleted by the user.
INSERT INTO public.ai_usage_events (user_id, kind, job_id, run_at, status)
SELECT
  cj.user_id,
  'callsheet'::text,
  cj.id,
  COALESCE(cj.processed_at, cj.created_at, now()),
  'done'::text
FROM public.callsheet_jobs cj
WHERE cj.status = 'done'
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_usage_events (user_id, kind, job_id, run_at, status)
SELECT
  ij.user_id,
  'invoice'::text,
  ij.id,
  COALESCE(ij.processed_at, ij.created_at, now()),
  'done'::text
FROM public.invoice_jobs ij
WHERE ij.status = 'done'
ON CONFLICT DO NOTHING;

