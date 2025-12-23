-- Create callsheets bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('callsheets', 'callsheets', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for Storage
DROP POLICY IF EXISTS "Users can upload their own callsheets" ON storage.objects;
CREATE POLICY "Users can upload their own callsheets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'callsheets' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can view their own callsheets" ON storage.objects;
CREATE POLICY "Users can view their own callsheets"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'callsheets' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role bypass needed for worker?
-- Usually service_role key bypasses RLS automatically, but explicit policy helps if using client.
-- The worker uses supabaseAdmin with service_role key, so it bypasses RLS.
