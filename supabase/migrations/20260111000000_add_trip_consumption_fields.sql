-- Add per-trip real consumption fields for more accurate CO₂ calculations.
-- `fuel_amount` remains the monetary expense; these fields store physical consumption.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS fuel_liters NUMERIC,
  ADD COLUMN IF NOT EXISTS ev_kwh_used NUMERIC;

COMMENT ON COLUMN public.trips.fuel_liters IS 'Fuel consumed for this trip in liters (ICE). Used for CO₂ calculations.';
COMMENT ON COLUMN public.trips.ev_kwh_used IS 'Electric energy used for this trip in kWh (EV). Used for CO₂ calculations.';

