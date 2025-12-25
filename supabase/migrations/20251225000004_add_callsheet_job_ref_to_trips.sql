-- Add callsheet_job_id column to trips table to reference project callsheets
ALTER TABLE trips ADD COLUMN IF NOT EXISTS callsheet_job_id UUID REFERENCES callsheet_jobs(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_trips_callsheet_job_id ON trips(callsheet_job_id);
