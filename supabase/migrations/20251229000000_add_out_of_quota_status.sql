-- Add explicit out_of_quota status for AI jobs

-- 1) Callsheets use enum job_status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'job_status'
      AND n.nspname = 'public'
  ) THEN
    BEGIN
      ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'out_of_quota';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2) Invoices use TEXT + CHECK constraint
DO $$
DECLARE
  c RECORD;
  existing_def TEXT;
BEGIN
  IF to_regclass('public.invoice_jobs') IS NULL THEN
    RETURN;
  END IF;

  -- If our target constraint already exists and already allows out_of_quota, do nothing.
  SELECT pg_get_constraintdef(oid)
    INTO existing_def
  FROM pg_constraint
  WHERE conrelid = 'public.invoice_jobs'::regclass
    AND conname = 'invoice_jobs_status_check'
  LIMIT 1;

  IF existing_def IS NOT NULL AND existing_def ILIKE '%out_of_quota%' THEN
    RETURN;
  END IF;

  -- If the target constraint exists but doesn't include out_of_quota, drop it so we can recreate.
  EXECUTE 'ALTER TABLE public.invoice_jobs DROP CONSTRAINT IF EXISTS invoice_jobs_status_check';

  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.invoice_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%in (%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoice_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.invoice_jobs
    ADD CONSTRAINT invoice_jobs_status_check
    CHECK (status IN ('created', 'queued', 'processing', 'done', 'failed', 'needs_review', 'out_of_quota'));
END $$;
