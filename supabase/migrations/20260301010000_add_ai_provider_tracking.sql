alter table public.ai_extraction_logs
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists ai_vendor text;
