-- Invoice extraction jobs and results
-- Similar to callsheet_jobs but for invoices

CREATE TABLE IF NOT EXISTS invoice_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created', -- created, queued, processing, done, failed, needs_review
    needs_review_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    CHECK (status IN ('created', 'queued', 'processing', 'done', 'failed', 'needs_review'))
);

CREATE TABLE IF NOT EXISTS invoice_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES invoice_jobs(id) ON DELETE CASCADE,
    total_amount NUMERIC(12,2),
    currency TEXT DEFAULT 'EUR',
    invoice_number TEXT,
    invoice_date DATE,
    vendor_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(job_id)
);

-- Enable RLS
ALTER TABLE invoice_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_results ENABLE ROW LEVEL SECURITY;

-- Policies for invoice_jobs
CREATE POLICY "Users can insert their own invoice jobs" ON invoice_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own invoice jobs" ON invoice_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoice jobs" ON invoice_jobs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoice jobs" ON invoice_jobs
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for invoice_results
CREATE POLICY "Users can view invoice results for their jobs" ON invoice_results
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM invoice_jobs 
            WHERE invoice_jobs.id = invoice_results.job_id 
            AND invoice_jobs.user_id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_jobs_status ON invoice_jobs(status);
CREATE INDEX IF NOT EXISTS idx_invoice_jobs_project_id ON invoice_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_invoice_jobs_trip_id ON invoice_jobs(trip_id);
CREATE INDEX IF NOT EXISTS idx_invoice_jobs_user_id ON invoice_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_results_job_id ON invoice_results(job_id);

-- Add invoice_job_id to project_documents to link documents with their extraction jobs
ALTER TABLE project_documents 
ADD COLUMN IF NOT EXISTS invoice_job_id UUID REFERENCES invoice_jobs(id) ON DELETE SET NULL;
