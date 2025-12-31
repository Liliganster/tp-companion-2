-- Add retry and timeout tracking fields to job tables
-- This enables exponential backoff, stuck job detection, and prevents double-processing

-- Add retry fields to callsheet_jobs
ALTER TABLE callsheet_jobs
ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Add retry fields to invoice_jobs
ALTER TABLE invoice_jobs
ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Add purpose field to invoice_results (if not exists)
ALTER TABLE invoice_results
ADD COLUMN IF NOT EXISTS purpose TEXT;

-- Create index for efficient stuck job detection
CREATE INDEX IF NOT EXISTS idx_callsheet_jobs_stuck 
ON callsheet_jobs(status, processing_started_at) 
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_invoice_jobs_stuck 
ON invoice_jobs(status, processing_started_at) 
WHERE status = 'processing';

-- Create index for retry queue
CREATE INDEX IF NOT EXISTS idx_callsheet_jobs_retry 
ON callsheet_jobs(status, next_retry_at) 
WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_jobs_retry 
ON invoice_jobs(status, next_retry_at) 
WHERE status = 'failed' AND next_retry_at IS NOT NULL;

COMMENT ON COLUMN callsheet_jobs.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN callsheet_jobs.max_retries IS 'Maximum retry attempts before giving up';
COMMENT ON COLUMN callsheet_jobs.last_error IS 'Last error message for debugging';
COMMENT ON COLUMN callsheet_jobs.next_retry_at IS 'Timestamp when job should be retried (exponential backoff)';
COMMENT ON COLUMN callsheet_jobs.processing_started_at IS 'Timestamp when processing began (for stuck job detection)';
