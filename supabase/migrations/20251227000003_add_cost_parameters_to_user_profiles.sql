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

