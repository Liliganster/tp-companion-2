BEGIN;
-- Move a saved trip and its owned document associations in one transaction.
-- Never call the destructive project/storage deletion workflow for this action.
CREATE OR REPLACE FUNCTION public.move_trip_to_project(
  p_trip_id uuid, p_source_project_id uuid, p_target_project_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_trip public.trips%ROWTYPE;
  v_source public.projects%ROWTYPE;
  v_target public.projects%ROWTYPE;
  v_ref record;
  v_has_content boolean := false;
  v_has_trips boolean;
  v_deleted boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_source_project_id IS NULL OR p_target_project_id IS NULL OR p_source_project_id = p_target_project_id THEN
    RAISE EXCEPTION 'Invalid project move' USING ERRCODE = '22023';
  END IF;
  -- Serialize moves within an account, then lock parents in a stable order.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-move:' || v_user::text, 0));
  PERFORM id FROM public.projects WHERE id IN (p_source_project_id, p_target_project_id) AND user_id = v_user ORDER BY id FOR UPDATE;
  SELECT * INTO v_source FROM public.projects WHERE id = p_source_project_id AND user_id = v_user;
  SELECT * INTO v_target FROM public.projects WHERE id = p_target_project_id AND user_id = v_user;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Project unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id AND user_id = v_user FOR UPDATE;
  IF v_trip.id IS NULL THEN RAISE EXCEPTION 'Trip unavailable' USING ERRCODE = '42501'; END IF;
  -- A repeated request after a lost response is harmless.
  IF v_trip.project_id = v_target.id THEN
    RETURN jsonb_build_object('source_deleted', v_source.id IS NULL, 'source_retained', false, 'project_name', v_target.name);
  END IF;
  IF v_source.id IS NULL THEN RAISE EXCEPTION 'Source project unavailable' USING ERRCODE = '42501'; END IF;
  IF v_trip.project_id IS DISTINCT FROM v_source.id THEN
    -- Support the same unambiguous legacy name association as the project list.
    IF v_trip.project_id IS NOT NULL OR
      (SELECT count(*) FROM public.projects WHERE user_id = v_user AND lower(trim(name)) = lower(trim(v_source.name))) <> 1 OR
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_trip.documents, '[]'::jsonb)) d WHERE d->>'kind' = 'client_meta' AND lower(trim(d->>'name')) = lower(trim(v_source.name))) THEN
      RAISE EXCEPTION 'Trip association changed; refresh before moving' USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.callsheet_jobs j SET project_id = v_target.id
  WHERE j.user_id = v_user AND (j.id = v_trip.callsheet_job_id OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_trip.documents, '[]'::jsonb)) d
    WHERE coalesce(d->>'bucketId', 'callsheets') = 'callsheets' AND coalesce(d->>'storagePath', d->>'path') = j.storage_path
  )) AND NOT EXISTS (
    SELECT 1 FROM public.trips other WHERE other.id <> v_trip.id AND (other.callsheet_job_id = j.id OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(other.documents, '[]'::jsonb)) d
      WHERE coalesce(d->>'bucketId', 'callsheets') = 'callsheets' AND coalesce(d->>'storagePath', d->>'path') = j.storage_path
    ))
  );
  UPDATE public.invoice_jobs j SET project_id = v_target.id
  WHERE j.user_id = v_user AND (j.trip_id = v_trip.id OR j.id = v_trip.invoice_job_id OR EXISTS (SELECT 1 FROM public.project_documents pd WHERE pd.invoice_job_id = j.id AND pd.trip_id = v_trip.id) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_trip.documents, '[]'::jsonb)) d
    WHERE d->>'bucketId' = 'project_documents' AND coalesce(d->>'storagePath', d->>'path') = j.storage_path
  )) AND NOT EXISTS (SELECT 1 FROM public.trips other WHERE other.id <> v_trip.id AND (other.invoice_job_id = j.id OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(other.documents, '[]'::jsonb)) d
    WHERE d->>'bucketId' = 'project_documents' AND coalesce(d->>'storagePath', d->>'path') = j.storage_path
  )));
  UPDATE public.project_documents pd SET project_id = v_target.id
  WHERE pd.user_id = v_user AND (pd.trip_id = v_trip.id OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_trip.documents, '[]'::jsonb)) d
    WHERE d->>'bucketId' = 'project_documents' AND coalesce(d->>'storagePath', d->>'path') = pd.storage_path
  ) OR EXISTS (SELECT 1 FROM public.invoice_jobs j WHERE j.id = pd.invoice_job_id AND j.trip_id = v_trip.id AND j.project_id = v_target.id))
  AND NOT EXISTS (SELECT 1 FROM public.trips other WHERE other.id <> v_trip.id AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(other.documents, '[]'::jsonb)) d
    WHERE d->>'bucketId' = 'project_documents' AND coalesce(d->>'storagePath', d->>'path') = pd.storage_path
  ));

  UPDATE public.trips SET project_id = v_target.id,
    documents = (SELECT coalesce(jsonb_agg(CASE WHEN d->>'kind' = 'client_meta' THEN jsonb_set(d, '{name}', to_jsonb(v_target.name)) ELSE d END ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(v_trip.documents, '[]'::jsonb)) WITH ORDINALITY AS docs(d, ord))
    WHERE id = v_trip.id AND user_id = v_user;

  -- All years, including legacy trips; visibility filters cannot justify deletion.
  SELECT EXISTS (SELECT 1 FROM public.trips t WHERE t.project_id = v_source.id OR
    (t.user_id = v_user AND t.project_id IS NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(t.documents, '[]'::jsonb)) d
      WHERE d->>'kind' = 'client_meta' AND lower(trim(d->>'name')) = lower(trim(v_source.name))
    ))) INTO v_has_trips;
  v_has_content := v_has_trips;
  -- Protect every FK child, including future document/expense tables, from cascades.
  IF NOT v_has_content THEN
    FOR v_ref IN SELECT n.nspname, c.relname, a.attname, cardinality(fk.conkey) AS key_count FROM pg_catalog.pg_constraint fk
      JOIN pg_catalog.pg_class c ON c.oid = fk.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = fk.conkey[1]
      WHERE fk.contype = 'f' AND fk.confrelid = 'public.projects'::regclass
    LOOP
      IF v_ref.key_count <> 1 THEN v_has_content := true; EXIT; END IF;
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)', v_ref.nspname, v_ref.relname, v_ref.attname) INTO v_has_content USING v_source.id;
      EXIT WHEN v_has_content;
    END LOOP;
  END IF;
  IF NOT v_has_content THEN
    SELECT EXISTS (SELECT 1 FROM public.callsheet_jobs j JOIN public.callsheet_results r ON r.job_id = j.id
      WHERE j.user_id = v_user AND j.project_id IS NULL AND lower(trim(r.project_value)) = lower(trim(v_source.name))
      AND NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.callsheet_job_id = j.id AND t.project_id = v_target.id)) INTO v_has_content;
  END IF;
  IF NOT v_has_content THEN
    DELETE FROM public.projects WHERE id = v_source.id AND user_id = v_user;
    v_deleted := FOUND;
  END IF;
  RETURN jsonb_build_object('source_deleted', v_deleted, 'source_retained', NOT v_deleted AND NOT v_has_trips, 'project_name', v_target.name);
END;
$$;
REVOKE ALL ON FUNCTION public.move_trip_to_project(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_trip_to_project(uuid, uuid, uuid) TO authenticated;
COMMIT;
