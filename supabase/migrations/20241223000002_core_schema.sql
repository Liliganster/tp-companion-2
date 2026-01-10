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
