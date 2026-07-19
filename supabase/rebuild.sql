-- ============================================================
-- Fahrtenbuch Pro — reconstrucción completa de Supabase
-- Generado a partir de supabase/migrations/ (2026-07-08)
-- Uso: pegar ENTERO en el SQL Editor de un proyecto NUEVO y ejecutar.
-- ============================================================

-- ------------------------------------------------------------
-- Migración: 20241223000000_universal_extractor.sql
-- ------------------------------------------------------------
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

-- Table: callsheet_excluded_blocks (Audit — base del multi-crew de la v2;
-- la propietaria decidió CONSERVARLA 2026-07-19. Solo escribe el service
-- role; el dueño del job puede leer los suyos por RLS.)
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

-- ------------------------------------------------------------
-- Migración: 20241223000001_storage_bucket.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Migración: 20241223000002_core_schema.sql
-- ------------------------------------------------------------
-- Core Schema Migration for Trip Companion

-- Enable UUID extension if not enabled (usually standard in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. User Profiles
-- Stores user configuration, plan details, and base location.
-- Linked to auth.users via id.
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    vat_id TEXT,
    license_plate TEXT,
    language TEXT DEFAULT 'es',
    rate_per_km NUMERIC DEFAULT 0.42, -- Standard Default
    passenger_surcharge NUMERIC DEFAULT 0.05,
    base_address TEXT,
    city TEXT,
    country TEXT,
    plan_tier TEXT DEFAULT 'basic', -- 'basic', 'pro'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Projects
-- Stores project definitions to group trips.
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    producer TEXT,
    description TEXT,
    rate_per_km NUMERIC, -- Override default if set
    starred BOOLEAN DEFAULT false,
    archived BOOLEAN DEFAULT false,
    
    -- Cache fields can be computed, but simple counters are fine for now if maintained by app
    -- Alternatively, we can use Views, but let's stick to simple columns for sync simplicity initially
    -- or leave them out and calc on the fly.
    -- Let's persist basic meta. Stats might be better calculated on Read or via RPC/View.
    -- For now, let's keep the table simple.
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can view own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

-- 3. Trips
-- The main ledger of trips.
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Client can generate this UUID
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    
    -- App uses 'date' string. Let's use 'trip_date' to be safe.
    trip_date DATE NOT NULL,
    
    purpose TEXT,
    passengers INT DEFAULT 0,
    distance_km NUMERIC NOT NULL DEFAULT 0,
    co2_kg NUMERIC NOT NULL DEFAULT 0,
    
    route JSONB, -- Array of strings ["Origin", "Stop 1", "Dest"]
    
    rate_per_km_override NUMERIC,
    special_origin TEXT, -- 'base', 'continue', 'return'
    
    invoice_number TEXT,
    
    documents JSONB, -- Array of {id, name, path, kind}
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for trips
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can insert own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can update own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can delete own trips" ON public.trips;
CREATE POLICY "Users can view own trips" ON public.trips
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trips" ON public.trips
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON public.trips
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trips" ON public.trips
    FOR DELETE USING (auth.uid() = user_id);

-- 4. Reports (Optional history)
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    month TEXT,
    year TEXT,
    project_filter TEXT,
    
    start_date DATE,
    end_date DATE,
    
    total_km NUMERIC,
    trips_count INT,
    
    pdf_path TEXT, -- Storage path if saved
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can delete own reports" ON public.reports;
CREATE POLICY "Users can view own reports" ON public.reports
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reports" ON public.reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reports" ON public.reports
    FOR DELETE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trips_user_date ON public.trips(user_id, trip_date);
CREATE INDEX IF NOT EXISTS idx_trips_project ON public.trips(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);

-- ------------------------------------------------------------
-- Migración: 20241223000003_update_reports_schema.sql
-- ------------------------------------------------------------
-- Add missing columns to reports table to match SavedReport type
ALTER TABLE public.reports 
ADD COLUMN IF NOT EXISTS trip_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS driver TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS license_plate TEXT;

-- ------------------------------------------------------------
-- Migración: 20241223000004_fix_trips_date.sql
-- ------------------------------------------------------------
-- Fix trips table: remove duplicate date column
ALTER TABLE public.trips DROP COLUMN IF EXISTS date_value;

-- ------------------------------------------------------------
-- Migración: 20241223000005_add_project_context_to_jobs.sql
-- ------------------------------------------------------------
ALTER TABLE callsheet_jobs
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- Migración: 20241223000006_project_documents.sql
-- ------------------------------------------------------------
-- Create generic project documents table (for invoices/others not linked to trips)
CREATE TABLE IF NOT EXISTS project_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'invoice', -- invoice, contract, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert their own project documents" ON project_documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own project documents" ON project_documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project documents" ON project_documents
    FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for project items
INSERT INTO storage.buckets (id, name, public) VALUES ('project_documents', 'project_documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Project Documents Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'project_documents' AND auth.uid() = owner);

CREATE POLICY "Project Documents Upload" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'project_documents' AND auth.uid() = owner);
    
CREATE POLICY "Project Documents Delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'project_documents' AND auth.uid() = owner);

-- ------------------------------------------------------------
-- Migración: 20241224000000_check_project_mismatch.sql
-- ------------------------------------------------------------
-- Function to check project mismatch
CREATE OR REPLACE FUNCTION check_project_mismatch()
RETURNS TRIGGER AS $$
DECLARE
    job_project_id UUID;
    job_project_name TEXT;
BEGIN
    -- Get the project_id from the job
    SELECT project_id INTO job_project_id
    FROM callsheet_jobs
    WHERE id = NEW.job_id;

    -- If the job has a specific project assigned (uploaded from Project Modal)
    IF job_project_id IS NOT NULL THEN
        -- Get the project name
        SELECT name INTO job_project_name
        FROM projects
        WHERE id = job_project_id;
        
        -- Compare extracted project_value with actual project name
        -- Simple normalization: trim and lowercase
        IF NEW.project_value IS NOT NULL AND job_project_name IS NOT NULL THEN
            IF lower(trim(NEW.project_value)) != lower(trim(job_project_name)) THEN
                -- Mismatch detected!
                -- Update job status to needs_review
                UPDATE callsheet_jobs
                SET status = 'needs_review',
                    needs_review_reason = 'Project mismatch: AI extracted "' || NEW.project_value || '" but file is in project "' || job_project_name || '"'
                WHERE id = NEW.job_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS on_callsheet_result_check_project ON callsheet_results;
CREATE TRIGGER on_callsheet_result_check_project
    BEFORE INSERT ON callsheet_results
    FOR EACH ROW
    EXECUTE FUNCTION check_project_mismatch();

-- ------------------------------------------------------------
-- Migración: 20241224000001_callsheets_delete_policy.sql
-- ------------------------------------------------------------
-- Allow authenticated users to delete their own callsheet files
-- (matches the existing folder-based ownership rule used for INSERT/SELECT)

DROP POLICY IF EXISTS "Users can delete their own callsheets" ON storage.objects;
CREATE POLICY "Users can delete their own callsheets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'callsheets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ------------------------------------------------------------
-- Migración: 20241224000002_add_unique_constraints.sql
-- ------------------------------------------------------------
-- Add UNIQUE constraint to prevent duplicate project names per user
ALTER TABLE projects
ADD CONSTRAINT unique_project_name_per_user UNIQUE (user_id, name);

-- Add UNIQUE constraint on storage_path for project_documents to prevent duplicate file paths
ALTER TABLE project_documents
ADD CONSTRAINT unique_storage_path UNIQUE (storage_path);

-- Add index to detect duplicate storage paths in callsheet_jobs
CREATE UNIQUE INDEX IF NOT EXISTS idx_callsheet_jobs_storage_path_user
ON callsheet_jobs(user_id, storage_path)
WHERE storage_path != 'pending';

-- ------------------------------------------------------------
-- Migración: 20241225000000_invoice_extraction.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Migración: 20241226000000_invoice_amounts.sql
-- ------------------------------------------------------------
-- Add invoice/cost tracking columns to trips table
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS invoice_currency TEXT DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS invoice_job_id UUID REFERENCES invoice_jobs(id) ON DELETE SET NULL;

-- Create view to calculate project totals including invoices
CREATE OR REPLACE VIEW project_totals AS
SELECT 
    p.id as project_id,
    p.name as project_name,
    p.user_id,
    COALESCE(SUM(t.distance_km), 0) as total_distance_km,
    COALESCE(SUM(t.co2_kg), 0) as total_co2_kg,
    COUNT(DISTINCT t.id) as total_trips,
    -- Invoice totals from project-level invoices
    COALESCE(SUM(
        CASE WHEN ir.currency = 'EUR' THEN ir.total_amount
             WHEN ir.currency = 'USD' THEN ir.total_amount * 0.92 -- approximate conversion
             WHEN ir.currency = 'GBP' THEN ir.total_amount * 1.17
             ELSE ir.total_amount 
        END
    ), 0) as total_invoiced_eur,
    -- Invoice totals from trip-level invoices
    COALESCE(SUM(
        CASE WHEN t.invoice_currency = 'EUR' THEN t.invoice_amount
             WHEN t.invoice_currency = 'USD' THEN t.invoice_amount * 0.92
             WHEN t.invoice_currency = 'GBP' THEN t.invoice_amount * 1.17
             ELSE t.invoice_amount
        END
    ), 0) as total_trip_invoices_eur
FROM projects p
LEFT JOIN trips t ON t.project_id = p.id
LEFT JOIN project_documents pd ON pd.project_id = p.id AND pd.type = 'invoice'
LEFT JOIN invoice_jobs ij ON ij.id = pd.invoice_job_id
LEFT JOIN invoice_results ir ON ir.job_id = ij.id AND ij.status = 'done'
GROUP BY p.id, p.name, p.user_id;

-- Create function to update trip invoice amount when invoice job completes
CREATE OR REPLACE FUNCTION update_trip_invoice_amount()
RETURNS TRIGGER AS $$
BEGIN
    -- When an invoice result is inserted/updated, check if it's linked to a trip
    IF NEW.job_id IS NOT NULL THEN
        -- Find the trip associated with this invoice job
        UPDATE trips
        SET 
            invoice_amount = NEW.total_amount,
            invoice_currency = NEW.currency
        WHERE invoice_job_id = NEW.job_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update trip amounts
DROP TRIGGER IF EXISTS trigger_update_trip_invoice_amount ON invoice_results;
CREATE TRIGGER trigger_update_trip_invoice_amount
AFTER INSERT OR UPDATE ON invoice_results
FOR EACH ROW
EXECUTE FUNCTION update_trip_invoice_amount();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_trips_invoice_job_id ON trips(invoice_job_id);

-- ------------------------------------------------------------
-- Migración: 20251224000000_google_connections.sql
-- ------------------------------------------------------------
-- Google OAuth connections (Calendar/Drive)
-- This migration brings supabase/google_connections.sql into the migrations chain.

CREATE TABLE IF NOT EXISTS public.google_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google',
  provider_account_email text,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  scopes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

-- SIN policies de cliente (2026-07-19): la tabla guarda refresh/access tokens
-- de Google y el navegador no debe poder leerlos. Deny-all para
-- anon/authenticated; solo el service role (bypass de RLS) la usa. El estado
-- de conexión se consulta vía /api/google/oauth/status.
DROP POLICY IF EXISTS "read_own_google_connection" ON public.google_connections;

-- ------------------------------------------------------------
-- Migración: 20251224000001_fix_missing_rls_policies.sql
-- ------------------------------------------------------------
-- Fix missing RLS policies needed by the current UI.
-- The frontend performs UPDATE/DELETE on some tables directly via the anon client.

-- 1) callsheet_jobs: allow users to UPDATE/DELETE their own jobs
-- (required by ProjectDetailModal best-effort persist and by cascade delete / rollback flows)

ALTER TABLE public.callsheet_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own jobs" ON public.callsheet_jobs;
CREATE POLICY "Users can update their own jobs"
ON public.callsheet_jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own jobs" ON public.callsheet_jobs;
CREATE POLICY "Users can delete their own jobs"
ON public.callsheet_jobs
FOR DELETE
USING (auth.uid() = user_id);

-- 2) reports: allow users to UPDATE their own reports
-- (required by cascadeDeleteTripById() which removes deleted trip ids from saved reports)

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update own reports" ON public.reports;
CREATE POLICY "Users can update own reports"
ON public.reports
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Migración: 20251225000000_route_templates.sql
-- ------------------------------------------------------------
-- Route templates (Advanced -> Routes)

CREATE TABLE IF NOT EXISTS public.route_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name text NOT NULL,
  category text NOT NULL DEFAULT 'business',
  start_location text,
  end_location text,
  distance_km numeric NOT NULL DEFAULT 0,
  estimated_time_min integer NOT NULL DEFAULT 0,
  description text,
  uses integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own route templates" ON public.route_templates;
CREATE POLICY "Users can view own route templates"
ON public.route_templates
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own route templates" ON public.route_templates;
CREATE POLICY "Users can insert own route templates"
ON public.route_templates
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own route templates" ON public.route_templates;
CREATE POLICY "Users can update own route templates"
ON public.route_templates
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own route templates" ON public.route_templates;
CREATE POLICY "Users can delete own route templates"
ON public.route_templates
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_route_templates_user_created
ON public.route_templates(user_id, created_at DESC);

-- ------------------------------------------------------------
-- Migración: 20251225000001_fix_callsheet_jobs_service_role_policy.sql
-- ------------------------------------------------------------
-- Fix an overly-permissive RLS policy on callsheet_jobs.
--
-- The original policy "Service role can all" used `USING (true)` which effectively bypasses
-- row filtering for *any* role with table privileges (policies are OR-ed).
-- This migration constrains that policy to the service_role JWT only.

ALTER TABLE public.callsheet_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can all" ON public.callsheet_jobs;

CREATE POLICY "Service role can all"
ON public.callsheet_jobs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- Migración: 20251225000002_harden_rls_with_check.sql
-- ------------------------------------------------------------
-- Harden RLS: ensure UPDATE policies also enforce ownership on the *new* row
-- via WITH CHECK, preventing a user from re-assigning rows to another user_id.

-- user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- trips
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can update own trips" ON public.trips;
CREATE POLICY "Users can update own trips" ON public.trips
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- producer_mappings (replace broad ALL policy with explicit CRUD)
ALTER TABLE public.producer_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their mappings" ON public.producer_mappings;

DROP POLICY IF EXISTS "Users can view own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can view own producer mappings" ON public.producer_mappings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can insert own producer mappings" ON public.producer_mappings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can update own producer mappings" ON public.producer_mappings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can delete own producer mappings" ON public.producer_mappings
  FOR DELETE
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Migración: 20251225000003_harden_callsheets_storage_policies.sql
-- ------------------------------------------------------------
-- Broaden callsheets storage policies to support both:
-- - the recommended folder layout: <user_id>/<job_id>/<filename>
-- - and legacy/alternate layouts where the object owner is set correctly
--
-- This fixes deletes failing when paths don't start with auth.uid().

-- SELECT
DROP POLICY IF EXISTS "Users can view their own callsheets" ON storage.objects;
CREATE POLICY "Users can view their own callsheets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'callsheets'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);

-- DELETE
DROP POLICY IF EXISTS "Users can delete their own callsheets" ON storage.objects;
CREATE POLICY "Users can delete their own callsheets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'callsheets'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);

-- ------------------------------------------------------------
-- Migración: 20251225000004_add_callsheet_job_ref_to_trips.sql
-- ------------------------------------------------------------
-- Add callsheet_job_id column to trips table to reference project callsheets
ALTER TABLE trips ADD COLUMN IF NOT EXISTS callsheet_job_id UUID REFERENCES callsheet_jobs(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_trips_callsheet_job_id ON trips(callsheet_job_id);

-- ------------------------------------------------------------
-- Migración: 20251227000000_harden_invoice_jobs_rls_with_check.sql
-- ------------------------------------------------------------
-- Harden RLS: ensure invoice_jobs UPDATE enforces ownership on the *new* row too.
-- Prevents users from re-assigning invoice_jobs.user_id to another user on UPDATE.

ALTER TABLE public.invoice_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own invoice jobs" ON public.invoice_jobs;
CREATE POLICY "Users can update their own invoice jobs"
ON public.invoice_jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------
-- Migración: 20251227000001_remove_user_profile_defaults.sql
-- ------------------------------------------------------------
-- Remove user profile numeric defaults so new users start blank

ALTER TABLE public.user_profiles
  ALTER COLUMN rate_per_km DROP DEFAULT,
  ALTER COLUMN passenger_surcharge DROP DEFAULT;

-- ------------------------------------------------------------
-- Migración: 20251227000002_add_vehicle_emissions_to_user_profiles.sql
-- ------------------------------------------------------------
-- Add vehicle/emissions settings to user profile (no defaults; user-configured)

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS fuel_type TEXT,
  ADD COLUMN IF NOT EXISTS fuel_l_per_100km NUMERIC,
  ADD COLUMN IF NOT EXISTS ev_kwh_per_100km NUMERIC,
  ADD COLUMN IF NOT EXISTS grid_kgco2_per_kwh NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_fuel_type_check'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_fuel_type_check
      CHECK (
        fuel_type IS NULL OR fuel_type IN ('gasoline', 'diesel', 'ev', 'unknown')
      );
  END IF;
END $$;


-- ------------------------------------------------------------
-- Migración: 20251227000003_add_cost_parameters_to_user_profiles.sql
-- ------------------------------------------------------------
-- Add vehicle/cost settings to user profile (no defaults; user-configured)

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS fuel_price_per_liter NUMERIC,
  ADD COLUMN IF NOT EXISTS electricity_price_per_kwh NUMERIC,
  ADD COLUMN IF NOT EXISTS maintenance_eur_per_km NUMERIC,
  ADD COLUMN IF NOT EXISTS other_eur_per_km NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_fuel_price_non_negative'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_fuel_price_non_negative
      CHECK (fuel_price_per_liter IS NULL OR fuel_price_per_liter >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_electricity_price_non_negative'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_electricity_price_non_negative
      CHECK (electricity_price_per_kwh IS NULL OR electricity_price_per_kwh >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_maintenance_per_km_non_negative'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_maintenance_per_km_non_negative
      CHECK (maintenance_eur_per_km IS NULL OR maintenance_eur_per_km >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_other_per_km_non_negative'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_other_per_km_non_negative
      CHECK (other_eur_per_km IS NULL OR other_eur_per_km >= 0);
  END IF;
END $$;


-- ------------------------------------------------------------
-- Migración: 20251227000004_add_invoice_purpose_to_results.sql
-- ------------------------------------------------------------
-- Add optional "purpose" extracted from invoice text (secondary to total/currency)

ALTER TABLE public.invoice_results
  ADD COLUMN IF NOT EXISTS purpose TEXT;


-- ------------------------------------------------------------
-- Migración: 20251229000000_add_out_of_quota_status.sql
-- ------------------------------------------------------------
-- Add explicit out_of_quota status for AI jobs

-- 1) Callsheets use enum job_status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'job_status'
      AND n.nspname = 'public'
  ) THEN
    BEGIN
      ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'out_of_quota';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2) Invoices use TEXT + CHECK constraint
DO $$
DECLARE
  c RECORD;
  existing_def TEXT;
BEGIN
  IF to_regclass('public.invoice_jobs') IS NULL THEN
    RETURN;
  END IF;

  -- If our target constraint already exists and already allows out_of_quota, do nothing.
  SELECT pg_get_constraintdef(oid)
    INTO existing_def
  FROM pg_constraint
  WHERE conrelid = 'public.invoice_jobs'::regclass
    AND conname = 'invoice_jobs_status_check'
  LIMIT 1;

  IF existing_def IS NOT NULL AND existing_def ILIKE '%out_of_quota%' THEN
    RETURN;
  END IF;

  -- If the target constraint exists but doesn't include out_of_quota, drop it so we can recreate.
  EXECUTE 'ALTER TABLE public.invoice_jobs DROP CONSTRAINT IF EXISTS invoice_jobs_status_check';

  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.invoice_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%in (%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoice_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.invoice_jobs
    ADD CONSTRAINT invoice_jobs_status_check
    CHECK (status IN ('created', 'queued', 'processing', 'done', 'failed', 'needs_review', 'out_of_quota'));
END $$;

-- ------------------------------------------------------------
-- Migración: 20251231000000_add_retry_fields.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Migración: 20260101000000_add_cancelled_status.sql
-- ------------------------------------------------------------
-- Add explicit cancelled status for AI jobs
-- Used to stop queued/processing jobs when users close IA-related modals.

-- 1) Callsheets use enum job_status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'job_status'
      AND n.nspname = 'public'
  ) THEN
    BEGIN
      ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'cancelled';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2) Invoices use TEXT + CHECK constraint
DO $$
DECLARE
  c RECORD;
  existing_def TEXT;
BEGIN
  IF to_regclass('public.invoice_jobs') IS NULL THEN
    RETURN;
  END IF;

  -- If our target constraint already exists and already allows cancelled, do nothing.
  SELECT pg_get_constraintdef(oid)
    INTO existing_def
  FROM pg_constraint
  WHERE conrelid = 'public.invoice_jobs'::regclass
    AND conname = 'invoice_jobs_status_check'
  LIMIT 1;

  IF existing_def IS NOT NULL AND existing_def ILIKE '%cancelled%' THEN
    RETURN;
  END IF;

  -- If the target constraint exists but doesn't include cancelled, drop it so we can recreate.
  EXECUTE 'ALTER TABLE public.invoice_jobs DROP CONSTRAINT IF EXISTS invoice_jobs_status_check';

  -- Also drop any other status IN() CHECK constraints (defensive).
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.invoice_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%in (%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoice_jobs DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.invoice_jobs
    ADD CONSTRAINT invoice_jobs_status_check
    CHECK (status IN ('created', 'queued', 'processing', 'done', 'failed', 'needs_review', 'out_of_quota', 'cancelled'));
END $$;


-- ------------------------------------------------------------
-- Migración: 20260101000001_ai_usage_events.sql
-- ------------------------------------------------------------
-- Track AI usage independently from trips/jobs so deleting user data doesn't reset the counter.
-- This table stores one row per successful AI extraction run.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  job_id UUID NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'done',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind IN ('callsheet', 'invoice')),
  CHECK (status IN ('done'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_usage_events_kind_job_run
  ON public.ai_usage_events(kind, job_id, run_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_run_at
  ON public.ai_usage_events(user_id, run_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own AI usage events" ON public.ai_usage_events;
CREATE POLICY "Users can view own AI usage events"
  ON public.ai_usage_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Backfill existing successful jobs (best-effort).
-- We intentionally do NOT add FKs to job tables because jobs can be deleted by the user.
INSERT INTO public.ai_usage_events (user_id, kind, job_id, run_at, status)
SELECT
  cj.user_id,
  'callsheet'::text,
  cj.id,
  COALESCE(cj.processed_at, cj.created_at, now()),
  'done'::text
FROM public.callsheet_jobs cj
WHERE cj.status = 'done'
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_usage_events (user_id, kind, job_id, run_at, status)
SELECT
  ij.user_id,
  'invoice'::text,
  ij.id,
  COALESCE(ij.processed_at, ij.created_at, now()),
  'done'::text
FROM public.invoice_jobs ij
WHERE ij.status = 'done'
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------
-- Migración: 20260102000000_route_templates_waypoints.sql
-- ------------------------------------------------------------
-- Support intermediate stops (waypoints) for route templates.
-- This keeps templates consistent with the trip route model (origin -> stops -> destination).

ALTER TABLE public.route_templates
ADD COLUMN IF NOT EXISTS waypoints text[] NOT NULL DEFAULT '{}'::text[];


-- ------------------------------------------------------------
-- Migración: 20260102000001_ai_usage_events_add_expense.sql
-- ------------------------------------------------------------
-- Add 'expense' as valid kind for AI usage events
-- This allows tracking expense receipt extractions in the quota counter

-- Drop the old constraint
ALTER TABLE public.ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_kind_check;

-- Add new constraint that includes 'expense'
ALTER TABLE public.ai_usage_events 
  ADD CONSTRAINT ai_usage_events_kind_check 
  CHECK (kind IN ('callsheet', 'invoice', 'expense'));

-- ------------------------------------------------------------
-- Migración: 20260103000000_project_documents_update_policy.sql
-- ------------------------------------------------------------
-- Allow users to UPDATE their own project documents.
-- Required so trip-linked invoices/documents can move with a trip when the user changes its project.

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own project documents" ON public.project_documents;
CREATE POLICY "Users can update their own project documents"
  ON public.project_documents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------
-- Migración: 20260105_ai_extraction_logs.sql
-- ------------------------------------------------------------
-- Create ai_extraction_logs table to track timing metrics for AI extractions
create table if not exists ai_extraction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  job_type text not null, -- 'callsheet' or 'invoice'
  gemini_duration_ms integer,
  geocoding_duration_ms integer,
  geocoding_locations integer,
  total_duration_ms integer,
  error_message text,
  created_at timestamp with time zone default now(),
  
  unique(job_id)
);

-- Create indexes for faster queries
create index if not exists idx_ai_extraction_logs_user_id on ai_extraction_logs(user_id);
create index if not exists idx_ai_extraction_logs_created_at on ai_extraction_logs(created_at);

-- Enable RLS
alter table ai_extraction_logs enable row level security;

-- Users can only access their own logs
create policy "Users can view their own extraction logs"
  on ai_extraction_logs for select
  using (auth.uid() = user_id);

-- SIN policy de INSERT (2026-07-19): la versión anterior ("Service role can
-- insert extraction logs") aplicaba a todos los roles con WITH CHECK (true) y
-- permitía insertar filas con el user_id de otro. El worker escribe con
-- service role (bypass de RLS); los clientes no insertan aquí.

-- ------------------------------------------------------------
-- Migración: 20260105_climatiq_cache.sql
-- ------------------------------------------------------------
-- Create climatiq_cache table to store API responses
create table if not exists climatiq_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fuel_type text not null, -- 'gasoline', 'diesel', 'ev'
  kg_co2e_per_liter numeric,
  kg_co2e_per_km numeric,
  region text,
  source text,
  year integer,
  activity_id text,
  data_version text,
  cached_at timestamp with time zone default now(),
  expires_at timestamp with time zone default (now() + interval '30 days'),
  raw_response jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Unique constraint: one cache entry per user + fuel_type
  unique(user_id, fuel_type)
);

-- Create index for faster queries
create index if not exists idx_climatiq_cache_user_id on climatiq_cache(user_id);
create index if not exists idx_climatiq_cache_expires_at on climatiq_cache(expires_at);

-- Enable RLS
alter table climatiq_cache enable row level security;

-- Users can only access their own cache
create policy "Users can view their own climatiq cache"
  on climatiq_cache for select
  using (auth.uid() = user_id);

create policy "Users can insert their own climatiq cache"
  on climatiq_cache for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own climatiq cache"
  on climatiq_cache for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own climatiq cache"
  on climatiq_cache for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Migración: 20260108000000_add_trip_expenses.sql
-- ------------------------------------------------------------
-- Add expense fields to trips table
-- These fields allow users to track per-trip expenses: tolls, parking, and other costs

-- Add toll amount (peajes)
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS toll_amount NUMERIC;

-- Add parking amount
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS parking_amount NUMERIC;

-- Add other expenses (comida, multas, etc.)
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS other_expenses NUMERIC;

-- Add constraints to ensure non-negative values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trips_toll_amount_non_negative'
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT trips_toll_amount_non_negative
      CHECK (toll_amount IS NULL OR toll_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trips_parking_amount_non_negative'
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT trips_parking_amount_non_negative
      CHECK (parking_amount IS NULL OR parking_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trips_other_expenses_non_negative'
  ) THEN
    ALTER TABLE public.trips
    ADD CONSTRAINT trips_other_expenses_non_negative
      CHECK (other_expenses IS NULL OR other_expenses >= 0);
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.trips.toll_amount IS 'Toll/peaje amount in EUR for this trip';
COMMENT ON COLUMN public.trips.parking_amount IS 'Parking amount in EUR for this trip';
COMMENT ON COLUMN public.trips.other_expenses IS 'Other expenses (food, fines, etc.) in EUR for this trip';

-- ------------------------------------------------------------
-- Migración: 20260108000001_add_trip_id_to_project_documents.sql
-- ------------------------------------------------------------
-- Add trip_id to project_documents for better expense tracking
-- This allows us to automatically update trip expenses when invoices are extracted

ALTER TABLE project_documents
ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_project_documents_trip_id ON project_documents(trip_id);

-- Add comment
COMMENT ON COLUMN project_documents.trip_id IS 'Optional reference to a trip. When set, extracted invoice amounts will be automatically categorized into trip expenses.';

-- ------------------------------------------------------------
-- Migración: 20260108000002_add_quantity_to_invoice_results.sql
-- ------------------------------------------------------------
-- Add quantity and unit columns to invoice_results for extracted invoice data
-- This allows us to store fuel quantity (liters) and other measurements from invoices

ALTER TABLE invoice_results
ADD COLUMN IF NOT EXISTS quantity NUMERIC;

ALTER TABLE invoice_results
ADD COLUMN IF NOT EXISTS unit TEXT;

-- Add constraint to ensure quantity is non-negative if present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_results_quantity_non_negative'
  ) THEN
    ALTER TABLE invoice_results
    ADD CONSTRAINT invoice_results_quantity_non_negative
      CHECK (quantity IS NULL OR quantity > 0);
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN invoice_results.quantity IS 'Quantity extracted from invoice (e.g., liters of fuel, number of nights, etc.)';
COMMENT ON COLUMN invoice_results.unit IS 'Unit of measurement for quantity (e.g., "liters", "litros", "l", "nights", etc.)';

-- ------------------------------------------------------------
-- Migración: 20260108000003_add_kind_to_project_documents.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Migración: 20260108000004_add_fuel_amount_to_trips.sql
-- ------------------------------------------------------------
-- Add fuel_amount column to trips table
-- This replaces the old invoice_amount/invoice_currency/invoice_job_id system
-- with a simpler direct amount field like toll_amount, parking_amount, other_expenses

ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS fuel_amount NUMERIC;

-- Comment for clarity
COMMENT ON COLUMN trips.fuel_amount IS 'Total fuel expenses for this trip (extracted from receipts or entered manually)';

-- ------------------------------------------------------------
-- Migración: 20260108000005_create_project_expenses.sql
-- ------------------------------------------------------------
-- Create project_expenses table to store expenses at project level
-- For cases where user has receipts but doesn't know which trip they belong to

CREATE TABLE IF NOT EXISTS public.project_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL CHECK (expense_type IN ('toll', 'parking', 'fuel', 'other')),
  amount NUMERIC NOT NULL DEFAULT 0,
  receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, expense_type)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_project_expenses_project_id ON public.project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_user_id ON public.project_expenses(user_id);

-- Enable RLS
ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own project expenses"
  ON public.project_expenses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project expenses"
  ON public.project_expenses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own project expenses"
  ON public.project_expenses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project expenses"
  ON public.project_expenses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comment
COMMENT ON TABLE public.project_expenses IS 'Stores expense receipts at project level for cases where trip association is unknown';
COMMENT ON COLUMN public.project_expenses.expense_type IS 'Type: toll, parking, fuel, or other';
COMMENT ON COLUMN public.project_expenses.receipts IS 'JSON array of receipt documents with id, storagePath, amount, name, createdAt';

-- ------------------------------------------------------------
-- Migración: 20260110000000_user_profiles_plan_tier.sql
-- ------------------------------------------------------------
-- Ensure a single source-of-truth plan column on user_profiles.
-- Idempotent/safe to run multiple times.

DO $$
BEGIN
  -- Add column if missing
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'plan_tier'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN plan_tier TEXT;
  END IF;

  -- Default to basic (app expects basic/pro)
  ALTER TABLE public.user_profiles
    ALTER COLUMN plan_tier SET DEFAULT 'basic';

  -- Normalize legacy values
  UPDATE public.user_profiles
  SET plan_tier = 'basic'
  WHERE plan_tier IS NULL OR plan_tier = '' OR lower(plan_tier) = 'free';

  -- Enforce allowed values (keep 'enterprise' for forward compatibility)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_plan_tier_check'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_plan_tier_check
      CHECK (plan_tier IN ('basic', 'pro', 'enterprise'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- Migración: 20260110000001_secure_project_totals_view.sql
-- ------------------------------------------------------------
-- Secure the project_totals view by making it a security invoker
-- This ensures that querying the view checks RLS policies of the underlying tables (projects, trips, etc.)
ALTER VIEW project_totals SET (security_invoker = true);

-- ------------------------------------------------------------
-- Migración: 20260111000000_add_trip_consumption_fields.sql
-- ------------------------------------------------------------
-- Add per-trip real consumption fields for more accurate CO₂ calculations.
-- `fuel_amount` remains the monetary expense; these fields store physical consumption.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS fuel_liters NUMERIC,
  ADD COLUMN IF NOT EXISTS ev_kwh_used NUMERIC;

COMMENT ON COLUMN public.trips.fuel_liters IS 'Fuel consumed for this trip in liters (ICE). Used for CO₂ calculations.';
COMMENT ON COLUMN public.trips.ev_kwh_used IS 'Electric energy used for this trip in kWh (EV). Used for CO₂ calculations.';


-- ------------------------------------------------------------
-- Migración: 20260301000000_add_openrouter_support.sql
-- ------------------------------------------------------------
-- Add OpenRouter preferences to user_profiles
alter table public.user_profiles
  add column if not exists openrouter_enabled boolean default false,
  add column if not exists openrouter_api_key text,
  add column if not exists openrouter_model text;

-- ------------------------------------------------------------
-- Migración: 20260301010000_add_ai_provider_tracking.sql
-- ------------------------------------------------------------
alter table public.ai_extraction_logs
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists ai_vendor text;

-- ------------------------------------------------------------
-- Migración: add_odometer_snapshots.sql
-- ------------------------------------------------------------
-- Migration: add_odometer_snapshots
-- Creates the odometer_snapshots table for km ratio calculation (Pro feature)
-- Also requires creating the 'odometer-images' Storage bucket manually in Supabase dashboard:
--   Bucket name: odometer-images
--   Public: NO (private)
--   Then add RLS policies via Supabase Storage settings

CREATE TABLE IF NOT EXISTS public.odometer_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  reading_km NUMERIC NOT NULL,
  source TEXT,         -- 'itv' | 'taller' | 'seguro' | 'manual'
  notes TEXT,
  image_storage_path TEXT,   -- storage path in 'odometer-images' bucket
  extraction_status TEXT DEFAULT 'manual',  -- 'ai' | 'manual' | 'failed'
  -- QR mobile capture flow (optional, cleared after use)
  capture_token UUID,          -- random token for the QR link (30-min expiry)
  capture_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safe to run on an already-created table (idempotent)
ALTER TABLE public.odometer_snapshots ADD COLUMN IF NOT EXISTS capture_token UUID;
ALTER TABLE public.odometer_snapshots ADD COLUMN IF NOT EXISTS capture_expires_at TIMESTAMPTZ;
ALTER TABLE public.odometer_snapshots ADD COLUMN IF NOT EXISTS user_correction_note TEXT;

ALTER TABLE public.odometer_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_odometer_snapshots" ON public.odometer_snapshots
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_odometer_user_date
  ON public.odometer_snapshots(user_id, snapshot_date);

-- ------------------------------------------------------------
-- Realtime: tablas que la app escucha con postgres_changes
-- ------------------------------------------------------------
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.callsheet_jobs; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_jobs; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.project_documents; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.trips; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Suaviza el guardián de "project mismatch": si el nombre del proyecto está
-- CONTENIDO en el extraído (o viceversa), no es un mismatch.
-- Caso real: proyecto "rex" + extracción "KOMMISSAR REX" → antes needs_review.

CREATE OR REPLACE FUNCTION check_project_mismatch()
RETURNS TRIGGER AS $$
DECLARE
    job_project_id UUID;
    job_project_name TEXT;
    a TEXT;
    b TEXT;
BEGIN
    SELECT project_id INTO job_project_id
    FROM callsheet_jobs
    WHERE id = NEW.job_id;

    IF job_project_id IS NOT NULL THEN
        SELECT name INTO job_project_name
        FROM projects
        WHERE id = job_project_id;

        IF NEW.project_value IS NOT NULL AND job_project_name IS NOT NULL THEN
            a := lower(trim(NEW.project_value));
            b := lower(trim(job_project_name));
            -- Mismatch solo si ninguno contiene al otro.
            IF a != b AND position(b IN a) = 0 AND position(a IN b) = 0 THEN
                UPDATE callsheet_jobs
                SET status = 'needs_review',
                    needs_review_reason = 'Project mismatch: AI extracted "' || NEW.project_value || '" but file is in project "' || job_project_name || '"'
                WHERE id = NEW.job_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Migración: 20260710000000_google_api_cache.sql
-- Caché de Google Maps (geocoding y rutas) — Fase 2 del PLAN.md.
-- Los rodajes repiten localizaciones durante semanas: cachear recorta el
-- mayor coste variable (Google Maps). Tabla SOLO para el service role
-- (RLS activado sin políticas a propósito: los clientes nunca la tocan).
-- TTL por código: geocodes 180 días, rutas 30 días (columna updated_at).

CREATE TABLE IF NOT EXISTS public.google_api_cache (
  cache_key text PRIMARY KEY,
  kind text NOT NULL,          -- 'geocode' | 'geocode_api' | 'directions'
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_api_cache ENABLE ROW LEVEL SECURITY;


-- Migración: 20260711000000_annual_car_total_km.sql
-- % de uso profesional manual (Fase 4 del PLAN.md): km totales del coche
-- este año (lectura del cuentakilómetros o factura del taller/ITV).
-- El dashboard calcula: km profesionales registrados ÷ este valor.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS annual_car_total_km numeric;
