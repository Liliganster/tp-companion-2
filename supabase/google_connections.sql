-- Google OAuth connections (Calendar/Drive)
-- Run this in Supabase SQL editor.

create table if not exists public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'google',
  provider_account_email text,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  scopes text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

-- Users can read only their own connection row (optional, for future client-side status).
create policy "read_own_google_connection"
on public.google_connections
for select
to authenticated
using (auth.uid() = user_id);

-- Writes are done server-side with service role (no insert/update policy needed).

