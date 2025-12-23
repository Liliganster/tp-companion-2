DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('created', 'queued', 'processing', 'done', 'failed', 'needs_review');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE pdf_kind AS ENUM ('native_text', 'scanned', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Table: callsheet_jobs
CREATE TABLE IF NOT EXISTS callsheet_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    status job_status NOT NULL DEFAULT 'created',
    pdf_kind pdf_kind DEFAULT 'unknown',
    model_path TEXT,
    error TEXT,
    needs_review_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Table: callsheet_results
CREATE TABLE IF NOT EXISTS callsheet_results (
    job_id UUID PRIMARY KEY REFERENCES callsheet_jobs(id) ON DELETE CASCADE,
    
    -- Date
    date_value DATE,
    date_page INT,
    date_evidence TEXT,
    date_confidence NUMERIC,
    
    -- Project
    project_value TEXT,
    project_page INT,
    project_evidence TEXT,
    project_confidence NUMERIC,
    
    -- Producer
    producer_value TEXT,
    producer_page INT,
    producer_evidence TEXT,
    producer_confidence NUMERIC,
    producer_logo_detected BOOLEAN DEFAULT FALSE,
    producer_needs_review BOOLEAN DEFAULT FALSE
);

-- Table: callsheet_locations
CREATE TABLE IF NOT EXISTS callsheet_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES callsheet_jobs(id) ON DELETE CASCADE,
    
    name_raw TEXT,
    address_raw TEXT,
    label_source TEXT, -- e.g. "MOTIV", "SET"
    page INT,
    evidence_text TEXT,
    confidence NUMERIC,
    
    -- Geocoding results
    place_id TEXT,
    formatted_address TEXT,
    lat NUMERIC,
    lng NUMERIC,
    geocode_quality TEXT
);

-- Table: callsheet_excluded_blocks (Audit)
CREATE TABLE IF NOT EXISTS callsheet_excluded_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES callsheet_jobs(id) ON DELETE CASCADE,
    label TEXT, -- PARKING, BASE, CATERING, etc.
    page INT,
    evidence_text TEXT,
    reason TEXT
);

-- Table: producer_mappings
CREATE TABLE IF NOT EXISTS producer_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_key TEXT NOT NULL,
    producer_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, project_key)
);

-- RLS Policies

-- callsheet_jobs
ALTER TABLE callsheet_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert their own jobs" ON callsheet_jobs;
CREATE POLICY "Users can insert their own jobs" ON callsheet_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own jobs" ON callsheet_jobs;
CREATE POLICY "Users can view their own jobs" ON callsheet_jobs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role can all" ON callsheet_jobs;
CREATE POLICY "Service role can all" ON callsheet_jobs USING (true) WITH CHECK (true);

-- callsheet_results
ALTER TABLE callsheet_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view results for own jobs" ON callsheet_results;
CREATE POLICY "Users can view results for own jobs" ON callsheet_results FOR SELECT USING (
    EXISTS (SELECT 1 FROM callsheet_jobs WHERE id = callsheet_results.job_id AND user_id = auth.uid())
);

-- callsheet_locations
ALTER TABLE callsheet_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view locations for own jobs" ON callsheet_locations;
CREATE POLICY "Users can view locations for own jobs" ON callsheet_locations FOR SELECT USING (
    EXISTS (SELECT 1 FROM callsheet_jobs WHERE id = callsheet_locations.job_id AND user_id = auth.uid())
);

-- callsheet_excluded_blocks
ALTER TABLE callsheet_excluded_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view audit for own jobs" ON callsheet_excluded_blocks;
CREATE POLICY "Users can view audit for own jobs" ON callsheet_excluded_blocks FOR SELECT USING (
    EXISTS (SELECT 1 FROM callsheet_jobs WHERE id = callsheet_excluded_blocks.job_id AND user_id = auth.uid())
);

-- producer_mappings
ALTER TABLE producer_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their mappings" ON producer_mappings;
CREATE POLICY "Users can manage their mappings" ON producer_mappings USING (auth.uid() = user_id);
