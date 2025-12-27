-- Add optional "purpose" extracted from invoice text (secondary to total/currency)

ALTER TABLE public.invoice_results
  ADD COLUMN IF NOT EXISTS purpose TEXT;

