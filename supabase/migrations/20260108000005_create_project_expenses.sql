-- Create project_expenses table to store expenses at project level
-- For cases where user has receipts but doesn't know which trip they belong to

CREATE TABLE IF NOT EXISTS public.project_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL CHECK (expense_type IN ('toll', 'parking', 'fuel', 'other')),
  amount NUMERIC NOT NULL DEFAULT 0,
  receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, expense_type)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_project_expenses_project_id ON public.project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_user_id ON public.project_expenses(user_id);

-- Enable RLS
ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own project expenses"
  ON public.project_expenses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project expenses"
  ON public.project_expenses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own project expenses"
  ON public.project_expenses
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project expenses"
  ON public.project_expenses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comment
COMMENT ON TABLE public.project_expenses IS 'Stores expense receipts at project level for cases where trip association is unknown';
COMMENT ON COLUMN public.project_expenses.expense_type IS 'Type: toll, parking, fuel, or other';
COMMENT ON COLUMN public.project_expenses.receipts IS 'JSON array of receipt documents with id, storagePath, amount, name, createdAt';
