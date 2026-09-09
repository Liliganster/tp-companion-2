BEGIN;

ALTER TABLE public.callsheet_jobs ADD COLUMN IF NOT EXISTS ai_request_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS public.ai_quota_reservations (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  identity_hash text,
  period_start date NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('reserved','released','consumed')),
  attempt_id uuid,
  lease_until timestamptz
);
CREATE INDEX IF NOT EXISTS ai_quota_reservations_user_period ON public.ai_quota_reservations(user_id,period_start);
CREATE INDEX IF NOT EXISTS ai_quota_reservations_identity_period ON public.ai_quota_reservations(identity_hash,period_start);
ALTER TABLE public.ai_quota_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_quota_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_quota_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.protect_ai_request_id() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND current_user NOT IN ('postgres','supabase_admin')
     AND NEW.ai_request_id IS DISTINCT FROM OLD.ai_request_id THEN
    RAISE EXCEPTION 'ai_request_id is server managed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_ai_request_id ON public.callsheet_jobs;
CREATE TRIGGER protect_ai_request_id BEFORE UPDATE ON public.callsheet_jobs
FOR EACH ROW EXECUTE FUNCTION public.protect_ai_request_id();

CREATE OR REPLACE FUNCTION public.ai_quota_snapshot(p_user_id uuid,p_limit integer,p_identity_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_period date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
  v_used integer; v_free integer := 0; v_reserved integer;
BEGIN
  IF p_limit < 0 OR p_limit IS NULL THEN RAISE EXCEPTION 'invalid limit'; END IF;
  SELECT count(*) INTO v_used FROM public.ai_usage_events
  WHERE user_id=p_user_id AND kind='callsheet' AND status='done'
    AND run_at >= (v_period::timestamp AT TIME ZONE 'UTC');
  IF p_identity_hash IS NOT NULL THEN
    SELECT coalesce(max(used_count),0) INTO v_free FROM public.free_ai_usage_ledger
    WHERE identity_hash=p_identity_hash AND period_start=v_period AND kind='callsheet';
  END IF;
  v_used := greatest(v_used,v_free);
  SELECT count(*) INTO v_reserved FROM public.ai_quota_reservations
  WHERE period_start=v_period AND state='reserved' AND lease_until>now()
    AND (user_id=p_user_id OR (p_identity_hash IS NOT NULL AND identity_hash=p_identity_hash));
  RETURN jsonb_build_object('allowed',v_used+v_reserved<p_limit,'limit',p_limit,
    'used',v_used,'reserved',v_reserved,'remaining',greatest(0,p_limit-v_used-v_reserved));
END;
$$;

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
  IF p_new_request_id IS NOT NULL AND p_new_request_id<>v_job.ai_request_id THEN
    DELETE FROM public.callsheet_locations WHERE job_id=p_job_id;
    DELETE FROM public.callsheet_results WHERE job_id=p_job_id;
  END IF;
  UPDATE public.callsheet_jobs SET ai_request_id=v_request,status='processing',
    processing_started_at=now(),processed_at=now(),needs_review_reason=NULL
    WHERE id=p_job_id;
  RETURN jsonb_build_object('allowed',true,'requestId',v_request,'storagePath',v_job.storage_path);
END;
$$;

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
  UPDATE public.callsheet_jobs SET status='done',processed_at=now() WHERE id=p_job_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_ai_request_id() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_quota_snapshot(uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_quota(uuid,uuid,integer,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_ai_quota(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_quota_snapshot(uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(uuid,uuid,integer,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ai_quota(uuid,uuid,uuid,uuid,boolean) TO service_role;
COMMIT;
