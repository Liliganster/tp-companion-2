BEGIN;
ALTER TABLE public.callsheet_results
  ADD COLUMN IF NOT EXISTS extraction_state text CHECK (extraction_state IN ('done','needs_review')),
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS model_output jsonb,
  ADD COLUMN IF NOT EXISTS extraction_request_id uuid;
ALTER TABLE public.callsheet_locations
  ADD COLUMN IF NOT EXISTS position integer,
  ADD COLUMN IF NOT EXISTS selection_state text CHECK (selection_state IN ('confirmed','candidate')),
  ADD COLUMN IF NOT EXISTS review_reason text;
CREATE INDEX IF NOT EXISTS callsheet_locations_document_order ON public.callsheet_locations(job_id,position);
CREATE OR REPLACE FUNCTION public.finish_ai_quota(p_user_id uuid,p_job_id uuid,p_request_id uuid,p_attempt_id uuid,p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.callsheet_jobs%ROWTYPE; v_res public.ai_quota_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.callsheet_jobs WHERE id=p_job_id AND user_id=p_user_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai:user:'||p_user_id::text,0));
  SELECT * INTO v_res FROM public.ai_quota_reservations WHERE request_id=p_request_id AND user_id=p_user_id AND job_id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_missing'; END IF;
  IF v_res.identity_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ai:identity:'||v_res.identity_hash,0));
  END IF;
  IF v_res.state='consumed' THEN RETURN true; END IF;
  IF v_res.attempt_id IS DISTINCT FROM p_attempt_id THEN RAISE EXCEPTION 'reservation_lost'; END IF;
  IF p_success IS NOT TRUE OR v_job.id IS NULL OR v_job.ai_request_id<>p_request_id OR v_job.status::text<>'processing' THEN
    UPDATE public.ai_quota_reservations SET state='released',lease_until=NULL,attempt_id=NULL WHERE request_id=p_request_id;
    RETURN false;
  END IF;
  IF v_res.state<>'reserved' OR v_res.lease_until<=now() THEN RAISE EXCEPTION 'reservation_expired'; END IF;
  INSERT INTO public.ai_usage_events(id,user_id,kind,job_id,run_at,status)
  VALUES(p_request_id,p_user_id,'callsheet',p_job_id,v_res.reserved_at,'done');
  IF v_res.identity_hash IS NOT NULL THEN
    PERFORM public.increment_free_ai_usage(v_res.identity_hash,v_res.period_start,'callsheet');
  END IF;
  UPDATE public.ai_quota_reservations SET state='consumed',lease_until=NULL WHERE request_id=p_request_id;
  UPDATE public.callsheet_jobs SET
    status=coalesce((SELECT extraction_state::public.job_status FROM public.callsheet_results WHERE job_id=p_job_id),'done'::public.job_status),
    needs_review_reason=(SELECT review_reason FROM public.callsheet_results WHERE job_id=p_job_id),
    processed_at=now(),next_retry_at=NULL WHERE id=p_job_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_callsheet_extraction(
  p_user_id uuid,p_job_id uuid,p_request_id uuid,p_attempt_id uuid,
  p_result jsonb,p_locations jsonb,p_excluded jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_job public.callsheet_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.callsheet_jobs WHERE id=p_job_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_job.ai_request_id IS DISTINCT FROM p_request_id OR v_job.status::text<>'processing' THEN
    RAISE EXCEPTION 'job_not_claimed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_quota_reservations WHERE request_id=p_request_id
    AND user_id=p_user_id AND job_id=p_job_id AND attempt_id=p_attempt_id
    AND state='reserved' AND lease_until>now()) THEN RAISE EXCEPTION 'reservation_lost'; END IF;
  IF p_result->>'extraction_state' NOT IN ('done','needs_review') OR p_result->>'extraction_state' IS NULL THEN
    RAISE EXCEPTION 'invalid_extraction_state';
  END IF;
  IF jsonb_typeof(p_locations) IS DISTINCT FROM 'array' OR jsonb_typeof(p_excluded) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_locations';
  END IF;
  DELETE FROM public.callsheet_locations WHERE job_id=p_job_id;
  DELETE FROM public.callsheet_excluded_blocks WHERE job_id=p_job_id;
  INSERT INTO public.callsheet_results(job_id,date_value,date_evidence,project_value,producer_value,extraction_state,review_reason,model_output,extraction_request_id)
  VALUES(p_job_id,(p_result->>'date_value')::date,p_result->>'date_evidence',p_result->>'project_value',p_result->>'producer_value',p_result->>'extraction_state',p_result->>'review_reason',p_result->'model_output',p_request_id)
  ON CONFLICT(job_id) DO UPDATE SET date_value=excluded.date_value,date_evidence=excluded.date_evidence,
    project_value=excluded.project_value,producer_value=excluded.producer_value,
    extraction_state=excluded.extraction_state,review_reason=excluded.review_reason,model_output=excluded.model_output,extraction_request_id=excluded.extraction_request_id;
  INSERT INTO public.callsheet_locations(job_id,address_raw,name_raw,label_source,position,selection_state,review_reason,evidence_text)
  SELECT p_job_id,x.address_raw,x.name_raw,x.label_source,x.position,x.selection_state,x.review_reason,x.evidence_text
  FROM jsonb_to_recordset(p_locations) AS x(address_raw text,name_raw text,label_source text,position integer,selection_state text,review_reason text,evidence_text text);
  INSERT INTO public.callsheet_excluded_blocks(job_id,label,evidence_text,reason)
  SELECT p_job_id,x.label,x.address,x.reason FROM jsonb_to_recordset(p_excluded) AS x(label text,address text,reason text);
  IF NOT public.finish_ai_quota(p_user_id,p_job_id,p_request_id,p_attempt_id,true) THEN RAISE EXCEPTION 'completion_failed'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.save_callsheet_extraction(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_callsheet_extraction(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_ai_quota(
  p_user_id uuid,p_job_id uuid,p_limit integer,p_identity_hash text,p_attempt_id uuid,p_new_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.callsheet_jobs%ROWTYPE;
  v_res public.ai_quota_reservations%ROWTYPE;
  v_request uuid; v_quota jsonb;
  v_period date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
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
  v_quota := public.ai_quota_snapshot(p_user_id,p_limit,p_identity_hash);
  IF NOT (v_quota->>'allowed')::boolean THEN
    RETURN v_quota || jsonb_build_object('reason','monthly_quota_exceeded');
  END IF;
  INSERT INTO public.ai_quota_reservations(request_id,user_id,job_id,identity_hash,period_start,state,attempt_id,lease_until,reserved_at)
  VALUES(v_request,p_user_id,p_job_id,p_identity_hash,v_period,'reserved',p_attempt_id,now()+interval '2 minutes',now())
  ON CONFLICT(request_id) DO UPDATE SET state='reserved',attempt_id=p_attempt_id,
    lease_until=now()+interval '2 minutes',period_start=v_period,identity_hash=p_identity_hash,reserved_at=now();
  -- Preserve the last complete result until the new extraction commits.
  UPDATE public.callsheet_jobs SET ai_request_id=v_request,status='processing',
    processing_started_at=now(),processed_at=now(),needs_review_reason=NULL
    WHERE id=p_job_id;
  RETURN jsonb_build_object('allowed',true,'requestId',v_request,'storagePath',v_job.storage_path);
END;
$$;


UPDATE storage.buckets SET file_size_limit=52428800 WHERE id='callsheets';
COMMIT;
