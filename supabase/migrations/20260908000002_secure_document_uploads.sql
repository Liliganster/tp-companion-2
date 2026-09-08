-- Deploy secure upload endpoints/frontend before applying this migration.
-- No existing objects are modified or deleted. Service role bypasses RLS.
BEGIN;
DROP POLICY IF EXISTS "Validated receipt reads" ON storage.objects;
DROP POLICY IF EXISTS "Validated receipt deletes" ON storage.objects;
UPDATE storage.buckets SET public = false,
  file_size_limit = CASE id WHEN 'callsheets' THEN 10485760 ELSE 5242880 END,
  allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png']
WHERE id IN ('callsheets','project_documents');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('upload_quarantine','upload_quarantine',false,10485760,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=10485760,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

-- Server-created receipts have no end-user owner field. The server enforces
-- the authenticated user's UUID as the first path segment. Retain legacy reads.
DROP POLICY IF EXISTS "Project Documents Access" ON storage.objects;
CREATE POLICY "Project Documents Access" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='project_documents' AND (auth.uid()=owner OR (storage.foldername(name))[1]=auth.uid()::text));
DROP POLICY IF EXISTS "Project Documents Delete" ON storage.objects;
CREATE POLICY "Project Documents Delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='project_documents' AND (auth.uid()=owner OR (storage.foldername(name))[1]=auth.uid()::text));

-- RESTRICTIVE rules defeat existing permissive policies, including FOR ALL.
DROP POLICY IF EXISTS "Validated uploads only insert" ON storage.objects;
CREATE POLICY "Validated uploads only insert" ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id NOT IN ('callsheets','project_documents','upload_quarantine'));
DROP POLICY IF EXISTS "Validated uploads only update" ON storage.objects;
CREATE POLICY "Validated uploads only update" ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
USING (bucket_id NOT IN ('callsheets','project_documents','upload_quarantine'))
WITH CHECK (bucket_id NOT IN ('callsheets','project_documents','upload_quarantine'));
DROP POLICY IF EXISTS "Quarantine is server only" ON storage.objects;
CREATE POLICY "Quarantine is server only" ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (bucket_id <> 'upload_quarantine');
COMMIT;
