BEGIN;
-- Called from a SECURITY DEFINER RPC with an empty search_path.
-- Keep the job processing until finish_ai_quota commits result and usage.
CREATE OR REPLACE FUNCTION public.check_project_mismatch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  job_project_name text;
  a text;
  b text;
  mismatch_reason text;
BEGIN
  SELECT p.name INTO job_project_name
  FROM public.callsheet_jobs j JOIN public.projects p ON p.id=j.project_id
  WHERE j.id=NEW.job_id;
  IF NEW.project_value IS NOT NULL AND job_project_name IS NOT NULL THEN
    a := lower(trim(NEW.project_value));
    b := lower(trim(job_project_name));
    IF a != b AND position(b IN a)=0 AND position(a IN b)=0 THEN
      mismatch_reason := 'Project mismatch: AI extracted "' || NEW.project_value || '" but file is in project "' || job_project_name || '"';
      IF NEW.extraction_request_id IS NOT NULL THEN
        NEW.extraction_state := 'needs_review';
        NEW.review_reason := concat_ws(' ',nullif(NEW.review_reason,''),mismatch_reason);
      ELSE
        UPDATE public.callsheet_jobs SET status='needs_review',needs_review_reason=mismatch_reason WHERE id=NEW.job_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
