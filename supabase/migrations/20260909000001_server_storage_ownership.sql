-- Install before deploying the server changes. Only the service role can call this.
BEGIN;
CREATE OR REPLACE FUNCTION public.server_owns_storage_object(
  p_user_id uuid, p_bucket text, p_path text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM storage.objects AS o
    WHERE o.bucket_id = p_bucket AND o.name = p_path
      AND p_bucket IN ('callsheets', 'project_documents')
      AND (
        o.owner = p_user_id
        OR (
          p_bucket = 'callsheets'
          AND split_part(o.name, '/', 1) = p_user_id::text
          AND (o.owner IS NULL OR o.owner = p_user_id)
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.server_owns_storage_object(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_owns_storage_object(uuid, text, text) TO service_role;
COMMIT;
