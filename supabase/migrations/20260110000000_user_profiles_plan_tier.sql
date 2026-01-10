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
