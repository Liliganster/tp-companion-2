-- Add fuel_amount column to trips table
-- This replaces the old invoice_amount/invoice_currency/invoice_job_id system
-- with a simpler direct amount field like toll_amount, parking_amount, other_expenses

ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS fuel_amount NUMERIC;

-- Comment for clarity
COMMENT ON COLUMN trips.fuel_amount IS 'Total fuel expenses for this trip (extracted from receipts or entered manually)';
