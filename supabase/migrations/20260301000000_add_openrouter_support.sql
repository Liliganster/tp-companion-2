-- Add OpenRouter preferences to user_profiles
alter table public.user_profiles
  add column if not exists openrouter_enabled boolean default false,
  add column if not exists openrouter_api_key text,
  add column if not exists openrouter_model text;
