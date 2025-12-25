-- Route templates (Advanced -> Routes)

CREATE TABLE IF NOT EXISTS public.route_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name text NOT NULL,
  category text NOT NULL DEFAULT 'business',
  start_location text,
  end_location text,
  distance_km numeric NOT NULL DEFAULT 0,
  estimated_time_min integer NOT NULL DEFAULT 0,
  description text,
  uses integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own route templates" ON public.route_templates;
CREATE POLICY "Users can view own route templates"
ON public.route_templates
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own route templates" ON public.route_templates;
CREATE POLICY "Users can insert own route templates"
ON public.route_templates
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own route templates" ON public.route_templates;
CREATE POLICY "Users can update own route templates"
ON public.route_templates
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own route templates" ON public.route_templates;
CREATE POLICY "Users can delete own route templates"
ON public.route_templates
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_route_templates_user_created
ON public.route_templates(user_id, created_at DESC);
