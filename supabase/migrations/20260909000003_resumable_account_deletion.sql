BEGIN;

-- No FK: the final acknowledgement must survive removal of auth.users.
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  user_id uuid PRIMARY KEY,
  phase text NOT NULL DEFAULT 'billing' CHECK (phase IN ('billing','storage','data','auth','complete')),
  lease_token uuid,
  lease_until timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL DEFAULT now() + interval '2 minutes',
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_claim(p_user_id uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.account_deletion_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('account:'||p_user_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id=p_user_id)
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'account_missing'; END IF;
  INSERT INTO public.account_deletion_requests(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.account_deletion_requests WHERE user_id=p_user_id FOR UPDATE;
  IF r.phase='complete' THEN RETURN jsonb_build_object('complete',true); END IF;
  IF r.lease_until>now() THEN RETURN jsonb_build_object('busy',true); END IF;
  UPDATE public.account_deletion_requests SET lease_token=p_token,lease_until=now()+interval '2 minutes',updated_at=now(),last_error=NULL WHERE user_id=p_user_id;
  RETURN jsonb_build_object('phase',r.phase,'notBefore',r.not_before);
END; $$;

CREATE OR REPLACE FUNCTION public.account_deletion_checkpoint(p_user_id uuid,p_token uuid,p_phase text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.account_deletion_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.account_deletion_requests WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR r.lease_token IS DISTINCT FROM p_token OR r.lease_until<=now() THEN RAISE EXCEPTION 'deletion_lease_lost'; END IF;
  IF p_phase IS NOT NULL AND NOT (
    (r.phase='billing' AND p_phase='storage') OR (r.phase='storage' AND p_phase='data') OR
    (r.phase='data' AND p_phase='auth') OR (r.phase='auth' AND p_phase='complete')
  ) THEN RAISE EXCEPTION 'invalid_deletion_transition'; END IF;
  IF p_phase='complete' AND EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'auth_not_deleted'; END IF;
  UPDATE public.account_deletion_requests SET phase=coalesce(p_phase,phase),last_error=left(p_error,80),
    lease_token=CASE WHEN p_phase IS NULL OR p_phase='complete' THEN NULL ELSE lease_token END,
    lease_until=CASE WHEN p_phase IS NULL OR p_phase='complete' THEN NULL ELSE now()+interval '2 minutes' END,
    updated_at=now() WHERE user_id=p_user_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.account_deletion_files(p_user_id uuid,p_token uuid)
RETURNS TABLE(bucket text,path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id=p_user_id AND lease_token=p_token AND lease_until>now() AND phase IN ('storage','data','auth')) THEN RAISE EXCEPTION 'deletion_lease_lost'; END IF;
  -- Refuse conflicting metadata rather than deleting another account's object.
  IF EXISTS (SELECT 1 FROM storage.objects o WHERE
    (o.owner::text=p_user_id::text OR o.owner_id=p_user_id::text OR split_part(o.name,'/',1)=p_user_id::text)
    AND ((o.owner IS NOT NULL AND o.owner::text<>p_user_id::text) OR (o.owner_id IS NOT NULL AND o.owner_id<>p_user_id::text))) THEN RAISE EXCEPTION 'storage_owner_conflict'; END IF;
  RETURN QUERY SELECT o.bucket_id,o.name FROM storage.objects o WHERE
    o.owner::text=p_user_id::text OR o.owner_id=p_user_id::text OR
    (o.owner IS NULL AND o.owner_id IS NULL AND split_part(o.name,'/',1)=p_user_id::text)
    ORDER BY o.bucket_id,o.name LIMIT 100;
  -- Always read the first remaining page: deletion must not shift an offset.
END; $$;

CREATE OR REPLACE FUNCTION public.account_deletion_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb:=to_jsonb(NEW); uid uuid; raw_uid text;
BEGIN
  IF TG_TABLE_SCHEMA='storage' THEN
    raw_uid:=coalesce(payload->>'owner_id',payload->>'owner',split_part(payload->>'name','/',1));
    IF raw_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN uid:=raw_uid::uuid; END IF;
  ELSIF TG_TABLE_NAME='user_profiles' THEN uid:=(payload->>'id')::uuid;
  ELSIF payload ? 'user_id' THEN uid:=(payload->>'user_id')::uuid;
  ELSIF payload ? 'job_id' THEN
    IF TG_TABLE_NAME IN ('invoice_results') THEN SELECT user_id INTO uid FROM public.invoice_jobs WHERE id=(payload->>'job_id')::uuid;
    ELSE SELECT user_id INTO uid FROM public.callsheet_jobs WHERE id=(payload->>'job_id')::uuid; END IF;
  END IF;
  IF uid IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('account:'||uid::text,0));
  IF current_setting('app.deleting_user',true)=uid::text THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id=uid) THEN RAISE EXCEPTION 'account_deletion_in_progress'; END IF;
  RETURN NEW;
END; $$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema='public' AND (column_name='user_id' OR table_name='user_profiles'
      OR table_name IN ('callsheet_results','callsheet_locations','callsheet_excluded_blocks','invoice_results'))
      AND table_name NOT IN ('account_deletion_requests','ai_quota_reservations')
      AND EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_name=columns.table_name AND t.table_type='BASE TABLE')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS account_deletion_guard ON public.%I',r.table_name);
    EXECUTE format('CREATE TRIGGER account_deletion_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.account_deletion_guard()',r.table_name);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS account_deletion_guard ON storage.objects;
CREATE TRIGGER account_deletion_guard BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.account_deletion_guard();

CREATE OR REPLACE FUNCTION public.account_deletion_purge(p_user_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('account:'||p_user_id::text,0));
  PERFORM 1 FROM public.account_deletion_requests WHERE user_id=p_user_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id=p_user_id AND lease_token=p_token AND lease_until>now() AND phase='data') THEN RAISE EXCEPTION 'deletion_lease_lost'; END IF;
  IF EXISTS (SELECT 1 FROM public.account_deletion_files(p_user_id,p_token)) THEN RAISE EXCEPTION 'storage_not_empty'; END IF;
  PERFORM set_config('app.deleting_user',p_user_id::text,true);
  -- One transaction: a failed table delete rolls all row deletions back.
  FOR r IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name)
    WHERE c.table_schema='public' AND c.column_name='user_id' AND c.data_type='uuid' AND t.table_type='BASE TABLE'
      AND c.table_name<>'account_deletion_requests'
    ORDER BY c.table_name
  LOOP EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',r.table_name) USING p_user_id; END LOOP;
  DELETE FROM public.user_profiles WHERE id=p_user_id;
  PERFORM public.account_deletion_checkpoint(p_user_id,p_token,'auth',NULL);
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.account_deletion_claim(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_checkpoint(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_files(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_purge(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_claim(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_checkpoint(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_files(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_purge(uuid,uuid) TO service_role;
COMMIT;
