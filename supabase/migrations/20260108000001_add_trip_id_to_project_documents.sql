-- Add trip_id to project_documents for better expense tracking
-- This allows us to automatically update trip expenses when invoices are extracted

ALTER TABLE project_documents
ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_project_documents_trip_id ON project_documents(trip_id);

-- Add comment
COMMENT ON COLUMN project_documents.trip_id IS 'Optional reference to a trip. When set, extracted invoice amounts will be automatically categorized into trip expenses.';
