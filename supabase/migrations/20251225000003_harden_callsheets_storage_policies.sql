-- Broaden callsheets storage policies to support both:
-- - the recommended folder layout: <user_id>/<job_id>/<filename>
-- - and legacy/alternate layouts where the object owner is set correctly
--
-- This fixes deletes failing when paths don't start with auth.uid().

-- SELECT
DROP POLICY IF EXISTS "Users can view their own callsheets" ON storage.objects;
CREATE POLICY "Users can view their own callsheets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'callsheets'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);

-- DELETE
DROP POLICY IF EXISTS "Users can delete their own callsheets" ON storage.objects;
CREATE POLICY "Users can delete their own callsheets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'callsheets'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);
