-- Harden RLS: ensure UPDATE policies also enforce ownership on the *new* row
-- via WITH CHECK, preventing a user from re-assigning rows to another user_id.

-- user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- trips
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can update own trips" ON public.trips;
CREATE POLICY "Users can update own trips" ON public.trips
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- producer_mappings (replace broad ALL policy with explicit CRUD)
ALTER TABLE public.producer_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their mappings" ON public.producer_mappings;

DROP POLICY IF EXISTS "Users can view own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can view own producer mappings" ON public.producer_mappings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can insert own producer mappings" ON public.producer_mappings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can update own producer mappings" ON public.producer_mappings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own producer mappings" ON public.producer_mappings;
CREATE POLICY "Users can delete own producer mappings" ON public.producer_mappings
  FOR DELETE
  USING (auth.uid() = user_id);
