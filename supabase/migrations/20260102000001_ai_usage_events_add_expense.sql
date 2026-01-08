-- Add 'expense' as valid kind for AI usage events
-- This allows tracking expense receipt extractions in the quota counter

-- Drop the old constraint
ALTER TABLE public.ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_kind_check;

-- Add new constraint that includes 'expense'
ALTER TABLE public.ai_usage_events 
  ADD CONSTRAINT ai_usage_events_kind_check 
  CHECK (kind IN ('callsheet', 'invoice', 'expense'));
