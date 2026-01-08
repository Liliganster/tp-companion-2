-- Add quantity and unit columns to invoice_results for extracted invoice data
-- This allows us to store fuel quantity (liters) and other measurements from invoices

ALTER TABLE invoice_results
ADD COLUMN IF NOT EXISTS quantity NUMERIC;

ALTER TABLE invoice_results
ADD COLUMN IF NOT EXISTS unit TEXT;

-- Add constraint to ensure quantity is non-negative if present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_results_quantity_non_negative'
  ) THEN
    ALTER TABLE invoice_results
    ADD CONSTRAINT invoice_results_quantity_non_negative
      CHECK (quantity IS NULL OR quantity > 0);
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN invoice_results.quantity IS 'Quantity extracted from invoice (e.g., liters of fuel, number of nights, etc.)';
COMMENT ON COLUMN invoice_results.unit IS 'Unit of measurement for quantity (e.g., "liters", "litros", "l", "nights", etc.)';
