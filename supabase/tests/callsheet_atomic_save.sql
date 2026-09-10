-- Run in SQL Editor. No provider calls; ALL fixture and usage changes roll back.
BEGIN;
DO $$
DECLARE
  u uuid; proj uuid := gen_random_uuid(); job uuid; req uuid; attempt uuid;
  reservation jsonb; mode text; expected text;
BEGIN
  SELECT user_id INTO STRICT u FROM public.callsheet_jobs LIMIT 1;
  INSERT INTO public.projects(id,user_id,name) VALUES(proj,u,'ZZZ rollback fixture');
  FOREACH mode IN ARRAY ARRAY['done','needs_review','mismatch'] LOOP
    job:=gen_random_uuid(); req:=gen_random_uuid(); attempt:=gen_random_uuid();
    INSERT INTO public.callsheet_jobs(id,user_id,storage_path,project_id)
    VALUES(job,u,'__rollback_only_test__/'||job::text,CASE WHEN mode='mismatch' THEN proj ELSE NULL END);
    reservation:=public.reserve_ai_quota(u,job,2147483647,NULL,attempt,req);
    IF NOT (reservation->>'allowed')::boolean THEN RAISE EXCEPTION 'reserve_failed'; END IF;
    expected:=CASE WHEN mode='done' THEN 'done' ELSE 'needs_review' END;
    IF NOT public.save_callsheet_extraction(u,job,req,attempt,
      jsonb_build_object('date_value','2026-09-10','project_value','Other Production',
        'extraction_state',CASE WHEN mode='needs_review' THEN 'needs_review' ELSE 'done' END,
        'review_reason',CASE WHEN mode='needs_review' THEN 'test review' ELSE NULL END,'model_output','{}'::jsonb),
      '[{"address_raw":"Test Street 1","position":0,"selection_state":"confirmed"}]'::jsonb,'[]'::jsonb)
    THEN RAISE EXCEPTION 'save_failed'; END IF;
    IF (SELECT status::text FROM public.callsheet_jobs WHERE id=job) IS DISTINCT FROM expected
    THEN RAISE EXCEPTION 'wrong_final_status %',mode; END IF;
    IF NOT public.finish_ai_quota(u,job,req,attempt,true) THEN RAISE EXCEPTION 'idempotency_failed'; END IF;
    IF (SELECT count(*) FROM public.ai_usage_events WHERE job_id=job)<>1 THEN RAISE EXCEPTION 'wrong_charge_count'; END IF;
  END LOOP;
END;
$$;
ROLLBACK;
SELECT 'PASS: done, review, mismatch, one charge, idempotency; fixtures rolled back' AS verification;
