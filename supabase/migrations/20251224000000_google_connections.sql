-- Google OAuth connections (Calendar/Drive)
-- This migration brings supabase/google_connections.sql into the migrations chain.

CREATE TABLE IF NOT EXISTS public.google_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google',
  provider_account_email text,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  scopes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_google_connection" ON public.google_connections;
CREATE POLICY "read_own_google_connection"
ON public.google_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
