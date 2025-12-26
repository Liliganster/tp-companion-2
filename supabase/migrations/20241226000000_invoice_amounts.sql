-- Add invoice/cost tracking columns to trips table
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS invoice_currency TEXT DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS invoice_job_id UUID REFERENCES invoice_jobs(id) ON DELETE SET NULL;

-- Create view to calculate project totals including invoices
CREATE OR REPLACE VIEW project_totals AS
SELECT 
    p.id as project_id,
    p.name as project_name,
    p.user_id,
    COALESCE(SUM(t.distance_km), 0) as total_distance_km,
    COALESCE(SUM(t.co2_kg), 0) as total_co2_kg,
    COUNT(DISTINCT t.id) as total_trips,
    -- Invoice totals from project-level invoices
    COALESCE(SUM(
        CASE WHEN ir.currency = 'EUR' THEN ir.total_amount
             WHEN ir.currency = 'USD' THEN ir.total_amount * 0.92 -- approximate conversion
             WHEN ir.currency = 'GBP' THEN ir.total_amount * 1.17
             ELSE ir.total_amount 
        END
    ), 0) as total_invoiced_eur,
    -- Invoice totals from trip-level invoices
    COALESCE(SUM(
        CASE WHEN t.invoice_currency = 'EUR' THEN t.invoice_amount
             WHEN t.invoice_currency = 'USD' THEN t.invoice_amount * 0.92
             WHEN t.invoice_currency = 'GBP' THEN t.invoice_amount * 1.17
             ELSE t.invoice_amount
        END
    ), 0) as total_trip_invoices_eur
FROM projects p
LEFT JOIN trips t ON t.project_id = p.id
LEFT JOIN project_documents pd ON pd.project_id = p.id AND pd.type = 'invoice'
LEFT JOIN invoice_jobs ij ON ij.id = pd.invoice_job_id
LEFT JOIN invoice_results ir ON ir.job_id = ij.id AND ij.status = 'done'
GROUP BY p.id, p.name, p.user_id;

-- Create function to update trip invoice amount when invoice job completes
CREATE OR REPLACE FUNCTION update_trip_invoice_amount()
RETURNS TRIGGER AS $$
BEGIN
    -- When an invoice result is inserted/updated, check if it's linked to a trip
    IF NEW.job_id IS NOT NULL THEN
        -- Find the trip associated with this invoice job
        UPDATE trips
        SET 
            invoice_amount = NEW.total_amount,
            invoice_currency = NEW.currency
        WHERE invoice_job_id = NEW.job_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update trip amounts
DROP TRIGGER IF EXISTS trigger_update_trip_invoice_amount ON invoice_results;
CREATE TRIGGER trigger_update_trip_invoice_amount
AFTER INSERT OR UPDATE ON invoice_results
FOR EACH ROW
EXECUTE FUNCTION update_trip_invoice_amount();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_trips_invoice_job_id ON trips(invoice_job_id);
