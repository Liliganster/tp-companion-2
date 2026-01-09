-- User subscription/plan management table
-- Tracks which plan tier each user is on and their subscription status

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Plan tier: 'basic', 'pro', 'enterprise'
  plan_tier TEXT NOT NULL DEFAULT 'basic',
  
  -- Subscription status
  status TEXT NOT NULL DEFAULT 'active',
  
  -- For Pro/Enterprise: subscription dates
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Payment tracking (for future Stripe/payment integration)
  payment_provider TEXT, -- 'stripe', 'manual', etc.
  external_subscription_id TEXT, -- Stripe subscription ID, etc.
  
  -- Plan limits (can override defaults for enterprise customers)
  custom_limits JSONB, -- { "maxTrips": 5000, "maxAiJobsPerMonth": 100, ... }
  
  -- Billing info
  price_cents INTEGER, -- Monthly price in cents (1900 = 19€)
  currency TEXT DEFAULT 'EUR',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_plan_tier CHECK (plan_tier IN ('basic', 'pro', 'enterprise')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  CONSTRAINT one_subscription_per_user UNIQUE (user_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id 
  ON public.user_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status 
  ON public.user_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at 
  ON public.user_subscriptions(expires_at) 
  WHERE expires_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update/delete subscriptions
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.user_subscriptions;
CREATE POLICY "Service role can manage subscriptions"
  ON public.user_subscriptions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER trigger_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_subscriptions_updated_at();

-- Function to create default subscription for new users
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_tier, status, started_at)
  VALUES (NEW.id, 'basic', 'active', now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create subscription when user signs up
DROP TRIGGER IF EXISTS trigger_create_default_subscription ON auth.users;
CREATE TRIGGER trigger_create_default_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_subscription();

-- Backfill: Create basic subscriptions for existing users who don't have one
INSERT INTO public.user_subscriptions (user_id, plan_tier, status, started_at)
SELECT id, 'basic', 'active', COALESCE(created_at, now())
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_subscriptions)
ON CONFLICT (user_id) DO NOTHING;

-- View for easy access to user plan info with limits
CREATE OR REPLACE VIEW public.user_plan_info AS
SELECT 
  us.user_id,
  us.plan_tier,
  us.status,
  us.started_at,
  us.expires_at,
  us.custom_limits,
  us.price_cents,
  us.currency,
  -- Calculate effective limits based on tier and custom overrides
  COALESCE(
    (us.custom_limits->>'maxTrips')::integer,
    CASE us.plan_tier
      WHEN 'basic' THEN 20
      WHEN 'pro' THEN 2000
      WHEN 'enterprise' THEN 999999
      ELSE 20
    END
  ) AS max_trips,
  COALESCE(
    (us.custom_limits->>'maxProjects')::integer,
    CASE us.plan_tier
      WHEN 'basic' THEN 3
      WHEN 'pro' THEN 30
      WHEN 'enterprise' THEN 999999
      ELSE 3
    END
  ) AS max_projects,
  COALESCE(
    (us.custom_limits->>'maxAiJobsPerMonth')::integer,
    CASE us.plan_tier
      WHEN 'basic' THEN 5
      WHEN 'pro' THEN 60
      WHEN 'enterprise' THEN 999999
      ELSE 5
    END
  ) AS max_ai_jobs_per_month,
  COALESCE(
    (us.custom_limits->>'maxStopsPerTrip')::integer,
    CASE us.plan_tier
      WHEN 'basic' THEN 10
      WHEN 'pro' THEN 25
      WHEN 'enterprise' THEN 100
      ELSE 10
    END
  ) AS max_stops_per_trip,
  COALESCE(
    (us.custom_limits->>'maxRouteTemplates')::integer,
    CASE us.plan_tier
      WHEN 'basic' THEN 5
      WHEN 'pro' THEN 50
      WHEN 'enterprise' THEN 999999
      ELSE 5
    END
  ) AS max_route_templates
FROM public.user_subscriptions us
WHERE us.status = 'active';

-- Grant access to the view
GRANT SELECT ON public.user_plan_info TO authenticated;
