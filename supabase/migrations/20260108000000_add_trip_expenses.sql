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
