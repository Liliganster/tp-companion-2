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
