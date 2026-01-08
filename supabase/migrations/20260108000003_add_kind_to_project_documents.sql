-- Add kind column to project_documents to distinguish between invoices and other documents
-- This allows better separation of fuel invoices from callsheets and other document types

ALTER TABLE project_documents
ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'document';

-- Add constraint to ensure valid kind values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_documents_kind_check'
  ) THEN
    ALTER TABLE project_documents
    ADD CONSTRAINT project_documents_kind_check
      CHECK (kind IN ('invoice', 'document', 'callsheet'));
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_project_documents_kind ON project_documents(kind);

-- Add comment
COMMENT ON COLUMN project_documents.kind IS 'Type of document: invoice (fuel, toll, parking, etc.), document (general), or callsheet (extraction from callsheet jobs)';
