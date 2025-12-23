-- Add missing columns to reports table to match SavedReport type
ALTER TABLE public.reports 
ADD COLUMN IF NOT EXISTS trip_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS driver TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS license_plate TEXT;
