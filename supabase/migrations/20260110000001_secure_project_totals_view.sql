-- Secure the project_totals view by making it a security invoker
-- This ensures that querying the view checks RLS policies of the underlying tables (projects, trips, etc.)
ALTER VIEW project_totals SET (security_invoker = true);
