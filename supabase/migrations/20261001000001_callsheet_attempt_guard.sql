BEGIN;
-- Existing function signature and permissions are preserved. No documents or billing data are changed.
CREATE OR REPLACE FUNCTION public.reserve_ai_quota_v2(
  p_user_id uuid,p_job_id uuid,p_limit integer,p_identity_hash text,p_attempt_id uuid,p_new_request_id uuid DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,p_period_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.callsheet_jobs%ROWTYPE;
  v_res public.ai_quota_reservations%ROWTYPE;
  v_request uuid; v_quota jsonb;
  v_period date := (coalesce(p_period_start,date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO v_job FROM public.callsheet_jobs WHERE id=p_job_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;
  -- Every path locks the job, then the account and (for Free) stable identity.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai:user:'||p_user_id::text,0));
  IF p_identity_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ai:identity:'||p_identity_hash,0));
  END IF;
  v_request := coalesce(p_new_request_id,v_job.ai_request_id);
  SELECT * INTO v_res FROM public.ai_quota_reservations WHERE request_id=v_request FOR UPDATE;
  IF FOUND AND (v_res.user_id<>p_user_id OR v_res.job_id<>p_job_id) THEN RAISE EXCEPTION 'request_conflict'; END IF;
  IF v_res.state='consumed' THEN
    RETURN jsonb_build_object('allowed',false,'completed',true,'requestId',v_request);
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_quota_reservations
    WHERE job_id=p_job_id AND state='reserved' AND lease_until>now() AND attempt_id IS DISTINCT FROM p_attempt_id) THEN
    RETURN jsonb_build_object('allowed',false,'busy',true);
  END IF;
  IF p_new_request_id IS NULL AND v_job.status::text='done' THEN
    RETURN jsonb_build_object('allowed',false,'completed',true,'requestId',v_request);
  END IF;
  -- Interrupted legacy jobs may already have a charged result.
  IF p_new_request_id IS NULL AND v_res.request_id IS NULL
     AND EXISTS (SELECT 1 FROM public.callsheet_results WHERE job_id=p_job_id)
     AND EXISTS (SELECT 1 FROM public.ai_usage_events WHERE job_id=p_job_id AND kind='callsheet') THEN
    UPDATE public.callsheet_jobs SET status='done' WHERE id=p_job_id;
    RETURN jsonb_build_object('allowed',false,'completed',true,'requestId',v_request);
  END IF;
  IF v_res.state='reserved' AND v_res.attempt_id=p_attempt_id AND v_res.lease_until>now() THEN
    RETURN jsonb_build_object('allowed',true,'requestId',v_request,'storagePath',v_job.storage_path);
  END IF;
  -- A repeated HTTP request must not spend provider tokens again, even after lease expiry.
  IF v_res.request_id IS NOT NULL OR (p_new_request_id IS NULL AND v_job.status::text NOT IN ('queued','created')) THEN
    RETURN jsonb_build_object('allowed',false,'reason','manual_retry_required');
  END IF;
  -- Bound concurrent provider work across tabs, workers and direct requests.
  IF (SELECT count(*) FROM public.ai_quota_reservations WHERE user_id=p_user_id AND state='reserved' AND lease_until>now()) >= 2 THEN
    RETURN jsonb_build_object('allowed',false,'busy',true,'reason','concurrency_limit');
  END IF;
  v_quota := public.ai_quota_snapshot_v2(p_user_id,p_limit,p_identity_hash,p_period_start,p_period_end);
  IF NOT (v_quota->>'allowed')::boolean THEN
    RETURN v_quota || jsonb_build_object('reason','quota_exceeded');
  END IF;
  INSERT INTO public.ai_quota_reservations(request_id,user_id,job_id,identity_hash,period_start,state,attempt_id,lease_until,reserved_at)
  VALUES(v_request,p_user_id,p_job_id,p_identity_hash,v_period,'reserved',p_attempt_id,now()+interval '3 minutes',now())
  ON CONFLICT(request_id) DO UPDATE SET state='reserved',attempt_id=p_attempt_id,
    lease_until=now()+interval '3 minutes',period_start=v_period,identity_hash=p_identity_hash,reserved_at=now();
  -- Preserve the last complete result until the new extraction commits.
  UPDATE public.callsheet_jobs SET ai_request_id=v_request,status='processing',
    processing_started_at=now(),processed_at=now(),needs_review_reason=NULL
    WHERE id=p_job_id;
  RETURN jsonb_build_object('allowed',true,'requestId',v_request,'storagePath',v_job.storage_path);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_quota_v2(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota_v2(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) TO service_role;
COMMIT;
