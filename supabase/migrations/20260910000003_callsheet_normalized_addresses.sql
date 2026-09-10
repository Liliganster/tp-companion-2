BEGIN;
-- Preserve address_raw for evidence; formatted_address is the trip destination.
DO $$
DECLARE original text; patched text;
BEGIN
  original := pg_get_functiondef('public.save_callsheet_extraction(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure);
  IF position('x.formatted_address' IN original)>0 THEN RETURN; END IF;
  patched := replace(original,
    'callsheet_locations(job_id,address_raw,name_raw,label_source',
    'callsheet_locations(job_id,address_raw,formatted_address,name_raw,label_source');
  patched := replace(patched,'p_job_id,x.address_raw,x.name_raw',
    'p_job_id,x.address_raw,x.formatted_address,x.name_raw');
  patched := replace(patched,'x(address_raw text,name_raw text',
    'x(address_raw text,formatted_address text,name_raw text');
  IF patched=original OR position('formatted_address text' IN patched)=0
    OR position('address_raw,formatted_address,name_raw' IN patched)=0 THEN
    RAISE EXCEPTION 'Unexpected save_callsheet_extraction definition; no changes applied';
  END IF;
  EXECUTE patched;
END;
$$;
COMMIT;
