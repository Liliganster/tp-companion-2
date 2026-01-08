-- Migration to remove all plan and Stripe-related columns from user_profiles
-- Run this in your Supabase SQL Editor

ALTER TABLE public.user_profiles
DROP COLUMN IF EXISTS plan_id,
DROP COLUMN IF EXISTS plan_tier,
DROP COLUMN IF EXISTS stripe_customer_id,
DROP COLUMN IF EXISTS stripe_subscription_id,
DROP COLUMN IF EXISTS subscription_status,
DROP COLUMN IF EXISTS subscription_cancel_at_period_end,
DROP COLUMN IF EXISTS subscription_current_period_end,
DROP COLUMN IF EXISTS subscription_updated_at;
