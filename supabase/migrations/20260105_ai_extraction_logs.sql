-- Create ai_extraction_logs table to track timing metrics for AI extractions
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
