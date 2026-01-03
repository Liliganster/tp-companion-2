-- Allow users to UPDATE their own project documents.
-- Required so trip-linked invoices/documents can move with a trip when the user changes its project.

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own project documents" ON public.project_documents;
CREATE POLICY "Users can update their own project documents"
  ON public.project_documents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

