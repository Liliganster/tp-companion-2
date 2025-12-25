-- Fix an overly-permissive RLS policy on callsheet_jobs.
--
-- The original policy "Service role can all" used `USING (true)` which effectively bypasses
-- row filtering for *any* role with table privileges (policies are OR-ed).
-- This migration constrains that policy to the service_role JWT only.

ALTER TABLE public.callsheet_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can all" ON public.callsheet_jobs;

CREATE POLICY "Service role can all"
ON public.callsheet_jobs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
