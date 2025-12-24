-- Allow authenticated users to delete their own callsheet files
-- (matches the existing folder-based ownership rule used for INSERT/SELECT)

DROP POLICY IF EXISTS "Users can delete their own callsheets" ON storage.objects;
CREATE POLICY "Users can delete their own callsheets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'callsheets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
