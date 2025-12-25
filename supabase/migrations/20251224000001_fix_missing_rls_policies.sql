-- Fix missing RLS policies needed by the current UI.
-- The frontend performs UPDATE/DELETE on some tables directly via the anon client.

-- 1) callsheet_jobs: allow users to UPDATE/DELETE their own jobs
-- (required by ProjectDetailModal best-effort persist and by cascade delete / rollback flows)

ALTER TABLE public.callsheet_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own jobs" ON public.callsheet_jobs;
CREATE POLICY "Users can update their own jobs"
ON public.callsheet_jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own jobs" ON public.callsheet_jobs;
CREATE POLICY "Users can delete their own jobs"
ON public.callsheet_jobs
FOR DELETE
USING (auth.uid() = user_id);

-- 2) reports: allow users to UPDATE their own reports
-- (required by cascadeDeleteTripById() which removes deleted trip ids from saved reports)

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update own reports" ON public.reports;
CREATE POLICY "Users can update own reports"
ON public.reports
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
