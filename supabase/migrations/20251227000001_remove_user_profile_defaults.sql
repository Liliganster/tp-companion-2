-- Remove user profile numeric defaults so new users start blank

ALTER TABLE public.user_profiles
  ALTER COLUMN rate_per_km DROP DEFAULT,
  ALTER COLUMN passenger_surcharge DROP DEFAULT;
