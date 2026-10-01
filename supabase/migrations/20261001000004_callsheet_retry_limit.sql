BEGIN;
-- Independent of subscription/bought credits. An accepted manual extraction
-- counts even when the provider fails. Quota/concurrency refusals do not count.
CREATE TABLE public.callsheet_manual_retries (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX callsheet_manual_retries_job ON public.callsheet_manual_retries(user_id,job_id);
ALTER TABLE public.callsheet_manual_retries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.callsheet_manual_retries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.callsheet_manual_retries TO service_role;
-- Preserve known retries made before this limit; the first reservation is the initial extraction.
INSERT INTO public.callsheet_manual_retries(request_id,user_id,job_id,created_at)
SELECT request_id,user_id,job_id,reserved_at FROM (
  SELECT *,row_number() OVER (PARTITION BY user_id,job_id ORDER BY reserved_at,request_id) AS attempt_number
  FROM public.ai_quota_reservations
) history WHERE attempt_number>1;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota_v3(
  p_user_id uuid,p_job_id uuid,p_limit integer,p_identity_hash text,p_attempt_id uuid,p_new_request_id uuid DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,p_period_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job public.callsheet_jobs%ROWTYPE; v_count integer; v_manual boolean; v_result jsonb;
BEGIN
  -- Same locking order as v2/finish: document, account, then stable free identity.
  SELECT * INTO v_job FROM public.callsheet_jobs WHERE id=p_job_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai:user:'||p_user_id::text,0));
  SELECT count(*) INTO v_count FROM public.callsheet_manual_retries WHERE user_id=p_user_id AND job_id=p_job_id;
  v_manual:=p_new_request_id IS NOT NULL AND p_new_request_id IS DISTINCT FROM v_job.ai_request_id;
  IF v_manual AND v_count>=3 AND NOT EXISTS (
    SELECT 1 FROM public.callsheet_manual_retries WHERE request_id=p_new_request_id AND user_id=p_user_id AND job_id=p_job_id
  ) THEN
    RETURN jsonb_build_object('allowed',false,'reason','retry_limit_exceeded','retryCount',v_count);
  END IF;
  v_result:=public.reserve_ai_quota_v2(p_user_id,p_job_id,p_limit,p_identity_hash,p_attempt_id,p_new_request_id,p_period_start,p_period_end);
  IF v_manual AND (v_result->>'allowed')::boolean THEN
    INSERT INTO public.callsheet_manual_retries(request_id,user_id,job_id)
      VALUES(p_new_request_id,p_user_id,p_job_id) ON CONFLICT(request_id) DO NOTHING;
    SELECT count(*) INTO v_count FROM public.callsheet_manual_retries WHERE user_id=p_user_id AND job_id=p_job_id;
  END IF;
  RETURN v_result || jsonb_build_object('retryCount',v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_quota_v3(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota_v3(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) TO service_role;
COMMIT;
