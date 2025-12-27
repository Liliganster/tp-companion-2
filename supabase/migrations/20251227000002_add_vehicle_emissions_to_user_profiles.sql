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

