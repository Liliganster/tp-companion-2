BEGIN;
-- Paid balance is independent of subscription windows. Only service-role RPCs may change it.
CREATE TABLE public.ai_credit_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0
);
CREATE TABLE public.ai_credit_purchases (
  session_id text PRIMARY KEY,
  payment_intent_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  credits integer NOT NULL CHECK (credits BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_credit_accounts,public.ai_credit_purchases FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_credit_accounts,public.ai_credit_purchases TO service_role;
ALTER TABLE public.ai_quota_reservations ADD COLUMN quota_source text NOT NULL DEFAULT 'plan' CHECK (quota_source IN ('plan','credits'));
ALTER TABLE public.ai_usage_events ADD COLUMN quota_source text NOT NULL DEFAULT 'plan' CHECK (quota_source IN ('plan','credits'));

CREATE OR REPLACE FUNCTION public.ai_credit_balance(p_user_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT balance FROM public.ai_credit_accounts WHERE user_id=p_user_id),0);
$$;

-- p_refunded_cents comes exclusively from Stripe's current charge. Refunds are
-- cumulative and monotonic, so an older completion event cannot restore them.
CREATE OR REPLACE FUNCTION public.sync_ai_credit_purchase(p_user_id uuid,p_session_id text,p_payment_intent_id text,p_refunded_cents integer DEFAULT 0)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old public.ai_credit_purchases%ROWTYPE; v_credits integer; v_delta integer;
BEGIN
  IF p_user_id IS NULL OR p_session_id NOT LIKE 'cs_%' OR p_payment_intent_id NOT LIKE 'pi_%'
    OR p_refunded_cents IS NULL OR p_refunded_cents NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'invalid_credit_purchase'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai:user:'||p_user_id::text,0));
  SELECT * INTO v_old FROM public.ai_credit_purchases WHERE session_id=p_session_id FOR UPDATE;
  IF FOUND AND (v_old.user_id IS DISTINCT FROM p_user_id OR v_old.payment_intent_id<>p_payment_intent_id) THEN RAISE EXCEPTION 'credit_purchase_conflict'; END IF;
  v_credits := 100-ceil(p_refunded_cents/10.0)::integer;
  IF v_old.session_id IS NOT NULL THEN v_credits:=least(v_credits,v_old.credits); END IF;
  v_delta:=v_credits-coalesce(v_old.credits,0);
  INSERT INTO public.ai_credit_purchases(session_id,payment_intent_id,user_id,credits)
    VALUES(p_session_id,p_payment_intent_id,p_user_id,v_credits)
    ON CONFLICT(session_id) DO UPDATE SET credits=excluded.credits;
  INSERT INTO public.ai_credit_accounts(user_id,balance) VALUES(p_user_id,v_delta)
    ON CONFLICT(user_id) DO UPDATE SET balance=public.ai_credit_accounts.balance+excluded.balance;
  RETURN v_credits;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_credit_balance(uuid),public.sync_ai_credit_purchase(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_balance(uuid),public.sync_ai_credit_purchase(uuid,text,text,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.ai_quota_snapshot_v2(
  p_user_id uuid,p_limit integer,p_identity_hash text DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,p_period_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_start timestamptz := coalesce(p_period_start,date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  v_end timestamptz := coalesce(p_period_end,(date_trunc('month',now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC');
  v_used integer; v_free integer := 0; v_reserved integer; v_active boolean; v_balance integer; v_credit_reserved integer; v_plan_remaining integer; v_credit_remaining integer;
BEGIN
  IF p_limit < 0 OR p_limit IS NULL THEN RAISE EXCEPTION 'invalid limit'; END IF;
  IF (p_period_start IS NULL) <> (p_period_end IS NULL) OR v_start >= v_end THEN RAISE EXCEPTION 'invalid quota period'; END IF;
  v_active := now() >= v_start AND now() < v_end;
  SELECT count(*) INTO v_used FROM public.ai_usage_events
  WHERE user_id=p_user_id AND kind='callsheet' AND status='done' AND run_at>=v_start AND run_at<v_end AND quota_source='plan';
  IF p_identity_hash IS NOT NULL THEN
    SELECT coalesce(max(used_count),0) INTO v_free FROM public.free_ai_usage_ledger
    WHERE identity_hash=p_identity_hash AND period_start=(v_start AT TIME ZONE 'UTC')::date AND kind='callsheet';
  END IF;
  v_used := greatest(v_used,v_free);
  SELECT count(*) INTO v_reserved FROM public.ai_quota_reservations
  WHERE quota_source='plan' AND reserved_at>=v_start AND reserved_at<v_end AND state='reserved' AND lease_until>now()
    AND (user_id=p_user_id OR (p_identity_hash IS NOT NULL AND identity_hash=p_identity_hash));
  v_balance:=public.ai_credit_balance(p_user_id);
  SELECT count(*) INTO v_credit_reserved FROM public.ai_quota_reservations
    WHERE user_id=p_user_id AND quota_source='credits' AND state='reserved' AND lease_until>now();
  v_plan_remaining:=CASE WHEN v_active THEN greatest(0,p_limit-v_used-v_reserved) ELSE 0 END;
  v_credit_remaining:=greatest(0,v_balance-v_credit_reserved);
  RETURN jsonb_build_object('allowed',v_plan_remaining>0 OR v_credit_remaining>0,'limit',p_limit,
    'used',v_used,'reserved',v_reserved,'planRemaining',v_plan_remaining,
    'creditBalance',v_balance,'creditReserved',v_credit_reserved,'creditsAvailable',v_credit_remaining,
    'remaining',least(2147483647,v_plan_remaining::bigint+v_credit_remaining)::integer);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota_v2(
  p_user_id uuid,p_job_id uuid,p_limit integer,p_identity_hash text,p_attempt_id uuid,p_new_request_id uuid DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,p_period_end timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.callsheet_jobs%ROWTYPE;
  v_res public.ai_quota_reservations%ROWTYPE;
  v_request uuid; v_quota jsonb; v_source text;
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
  v_source:=CASE WHEN (v_quota->>'planRemaining')::integer>0 THEN 'plan' ELSE 'credits' END;
  INSERT INTO public.ai_quota_reservations(request_id,user_id,job_id,identity_hash,period_start,state,attempt_id,lease_until,reserved_at,quota_source)
  VALUES(v_request,p_user_id,p_job_id,p_identity_hash,v_period,'reserved',p_attempt_id,now()+interval '3 minutes',now(),v_source)
  ON CONFLICT(request_id) DO UPDATE SET state='reserved',attempt_id=p_attempt_id,
    lease_until=now()+interval '3 minutes',period_start=v_period,identity_hash=p_identity_hash,reserved_at=now(),quota_source=v_source;
  -- Preserve the last complete result until the new extraction commits.
  UPDATE public.callsheet_jobs SET ai_request_id=v_request,status='processing',
    processing_started_at=now(),processed_at=now(),needs_review_reason=NULL
    WHERE id=p_job_id;
  RETURN jsonb_build_object('allowed',true,'requestId',v_request,'storagePath',v_job.storage_path);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_quota_v2(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota_v2(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz) TO service_role;
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
  INSERT INTO public.ai_usage_events(id,user_id,kind,job_id,run_at,status,quota_source)
  VALUES(p_request_id,p_user_id,'callsheet',p_job_id,v_res.reserved_at,'done',v_res.quota_source);
  IF v_res.quota_source='credits' THEN
    UPDATE public.ai_credit_accounts SET balance=balance-1 WHERE user_id=p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'credit_account_missing'; END IF;
  END IF;
  IF v_res.quota_source='plan' AND v_res.identity_hash IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.ai_quota_snapshot_v2(uuid,integer,text,timestamptz,timestamptz),public.finish_ai_quota(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_quota_snapshot_v2(uuid,integer,text,timestamptz,timestamptz),public.finish_ai_quota(uuid,uuid,uuid,uuid,boolean) TO service_role;
COMMIT;
