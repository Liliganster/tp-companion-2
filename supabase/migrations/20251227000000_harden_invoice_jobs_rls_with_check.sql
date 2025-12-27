-- Harden RLS: ensure invoice_jobs UPDATE enforces ownership on the *new* row too.
-- Prevents users from re-assigning invoice_jobs.user_id to another user on UPDATE.

ALTER TABLE public.invoice_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own invoice jobs" ON public.invoice_jobs;
CREATE POLICY "Users can update their own invoice jobs"
ON public.invoice_jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

