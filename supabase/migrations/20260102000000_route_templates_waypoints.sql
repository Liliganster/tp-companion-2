-- Support intermediate stops (waypoints) for route templates.
-- This keeps templates consistent with the trip route model (origin -> stops -> destination).

ALTER TABLE public.route_templates
ADD COLUMN IF NOT EXISTS waypoints text[] NOT NULL DEFAULT '{}'::text[];

