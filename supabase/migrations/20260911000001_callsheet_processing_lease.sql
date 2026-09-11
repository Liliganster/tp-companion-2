-- Align reservation lifetime with provider (100s), server (150s), client (160s).
-- Only changes future leases; no balances, events or historical results change.
DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.reserve_ai_quota(uuid,uuid,integer,text,uuid,uuid)'::regprocedure) INTO definition;
  IF position('interval ''3 minutes''' in definition) > 0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition, 'interval ''2 minutes''', '')))/length('interval ''2 minutes''') <> 2 THEN
    RAISE EXCEPTION 'Unexpected reserve_ai_quota definition; lease migration aborted';
  END IF;
  EXECUTE replace(definition, 'interval ''2 minutes''', 'interval ''3 minutes''');
END;
$migration$;
