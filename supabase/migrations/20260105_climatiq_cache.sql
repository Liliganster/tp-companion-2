-- Create climatiq_cache table to store API responses
create table if not exists climatiq_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fuel_type text not null, -- 'gasoline', 'diesel', 'ev'
  kg_co2e_per_liter numeric,
  kg_co2e_per_km numeric,
  region text,
  source text,
  year integer,
  activity_id text,
  data_version text,
  cached_at timestamp with time zone default now(),
  expires_at timestamp with time zone default (now() + interval '30 days'),
  raw_response jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Unique constraint: one cache entry per user + fuel_type
  unique(user_id, fuel_type)
);

-- Create index for faster queries
create index if not exists idx_climatiq_cache_user_id on climatiq_cache(user_id);
create index if not exists idx_climatiq_cache_expires_at on climatiq_cache(expires_at);

-- Enable RLS
alter table climatiq_cache enable row level security;

-- Users can only access their own cache
create policy "Users can view their own climatiq cache"
  on climatiq_cache for select
  using (auth.uid() = user_id);

create policy "Users can insert their own climatiq cache"
  on climatiq_cache for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own climatiq cache"
  on climatiq_cache for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own climatiq cache"
  on climatiq_cache for delete
  using (auth.uid() = user_id);

-- Create ai_extraction_logs table to track timing metrics
create table if not exists ai_extraction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  job_type text not null, -- 'callsheet' or 'invoice'
  gemini_duration_ms integer,
  geocoding_duration_ms integer,
  geocoding_locations integer,
  total_duration_ms integer,
  error_message text,
  created_at timestamp with time zone default now(),
  
  unique(job_id)
);

-- Create indexes for faster queries
create index if not exists idx_ai_extraction_logs_user_id on ai_extraction_logs(user_id);
create index if not exists idx_ai_extraction_logs_created_at on ai_extraction_logs(created_at);

-- Enable RLS
alter table ai_extraction_logs enable row level security;

-- Users can only access their own logs
create policy "Users can view their own extraction logs"
  on ai_extraction_logs for select
  using (auth.uid() = user_id);

create policy "Service role can insert extraction logs"
  on ai_extraction_logs for insert
  with check (true);
