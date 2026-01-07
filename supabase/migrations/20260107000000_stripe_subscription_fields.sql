-- Add Stripe subscription fields to user_profiles
-- This migration adds the necessary columns for Stripe payment integration

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS plan_id TEXT DEFAULT 'free';

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT false;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

-- Create index for faster lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer_id 
ON public.user_profiles (stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- Create index for faster lookups by stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_subscription_id 
ON public.user_profiles (stripe_subscription_id) 
WHERE stripe_subscription_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.plan_id IS 'User subscription plan: free, pro';
COMMENT ON COLUMN public.user_profiles.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN public.user_profiles.stripe_subscription_id IS 'Stripe subscription ID';
COMMENT ON COLUMN public.user_profiles.subscription_status IS 'Stripe subscription status: none, active, past_due, canceled, trialing';
COMMENT ON COLUMN public.user_profiles.subscription_cancel_at_period_end IS 'Whether subscription will cancel at period end';
COMMENT ON COLUMN public.user_profiles.subscription_current_period_end IS 'When current subscription period ends';
COMMENT ON COLUMN public.user_profiles.subscription_updated_at IS 'Last subscription status update timestamp';
