BEGIN;
ALTER TABLE public.billing_entitlements
  ADD COLUMN IF NOT EXISTS stripe_current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_billing_interval text CHECK (stripe_billing_interval IN ('monthly','annual'));

-- v2 leaves the existing RPCs available while the application is deployed.
-- Only the server can supply the quota/period, derived from Stripe entitlements.
CREATE OR REPLACE FUNCTION public.ai_quota_snapshot_v2(
  p_user_id uuid,p_limit integer,p_identity_hash text DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,p_period_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_start timestamptz := coalesce(p_period_start,date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  v_end timestamptz := coalesce(p_period_end,(date_trunc('month',now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC');
  v_used integer; v_free integer := 0; v_reserved integer; v_active boolean;
BEGIN
  IF p_limit < 0 OR p_limit IS NULL THEN RAISE EXCEPTION 'invalid limit'; END IF;
  IF (p_period_start IS NULL) <> (p_period_end IS NULL) OR v_start >= v_end THEN RAISE EXCEPTION 'invalid quota period'; END IF;
  v_active := now() >= v_start AND now() < v_end;
  SELECT count(*) INTO v_used FROM public.ai_usage_events
  WHERE user_id=p_user_id AND kind='callsheet' AND status='done' AND run_at>=v_start AND run_at<v_end;
  IF p_identity_hash IS NOT NULL THEN
    SELECT coalesce(max(used_count),0) INTO v_free FROM public.free_ai_usage_ledger
    WHERE identity_hash=p_identity_hash AND period_start=(v_start AT TIME ZONE 'UTC')::date AND kind='callsheet';
  END IF;
  v_used := greatest(v_used,v_free);
  SELECT count(*) INTO v_reserved FROM public.ai_quota_reservations
  WHERE reserved_at>=v_start AND reserved_at<v_end AND state='reserved' AND lease_until>now()
    AND (user_id=p_user_id OR (p_identity_hash IS NOT NULL AND identity_hash=p_identity_hash));
  RETURN jsonb_build_object('allowed',v_active AND v_used+v_reserved<p_limit,'limit',p_limit,
    'used',v_used,'reserved',v_reserved,'remaining',CASE WHEN v_active THEN greatest(0,p_limit-v_used-v_reserved) ELSE 0 END);
END;
$$;

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
REVOKE ALL ON FUNCTION public.ai_quota_snapshot_v2(uuid,integer,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_quota_v2(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_quota_snapshot_v2(uuid,integer,text,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota_v2(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) TO service_role;
COMMIT;
