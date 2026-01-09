-- Plan System Verification Queries
-- Run these in Supabase SQL Editor to verify everything is working

-- 1. Check table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'user_subscriptions'
);

-- 2. View all subscriptions
SELECT 
  u.id,
  u.email,
  us.plan_tier,
  us.status,
  us.started_at,
  us.expires_at,
  us.price_cents,
  us.custom_limits
FROM auth.users u
LEFT JOIN public.user_subscriptions us ON u.id = us.user_id
ORDER BY u.created_at DESC
LIMIT 10;

-- 3. Check a specific user (replace with actual user_id)
SELECT * FROM public.user_subscriptions 
WHERE user_id = '{USER_ID}';

-- 4. View calculated limits (with overrides)
SELECT * FROM public.user_plan_info 
WHERE user_id = '{USER_ID}';

-- 5. Count users by plan tier
SELECT 
  plan_tier,
  status,
  COUNT(*) as count
FROM public.user_subscriptions
GROUP BY plan_tier, status
ORDER BY plan_tier;

-- 6. Check Pro users (paying)
SELECT 
  us.user_id,
  u.email,
  us.started_at,
  us.price_cents
FROM public.user_subscriptions us
JOIN auth.users u ON u.id = us.user_id
WHERE us.plan_tier = 'pro'
AND us.status = 'active'
ORDER BY us.started_at DESC;

-- 7. Check subscriptions about to expire (next 7 days)
SELECT 
  us.user_id,
  u.email,
  us.plan_tier,
  us.expires_at
FROM public.user_subscriptions us
JOIN auth.users u ON u.id = us.user_id
WHERE us.expires_at IS NOT NULL
AND us.expires_at BETWEEN now() AND now() + interval '7 days'
ORDER BY us.expires_at;

-- 8. Manual upgrade user to Pro
UPDATE public.user_subscriptions 
SET 
  plan_tier = 'pro',
  status = 'active',
  price_cents = 1900,
  started_at = now()
WHERE user_id = '{USER_ID}';

-- 9. Set custom limits for Enterprise user
UPDATE public.user_subscriptions 
SET custom_limits = jsonb_build_object(
  'maxTrips', 5000,
  'maxProjects', 50,
  'maxAiJobsPerMonth', 200,
  'maxStopsPerTrip', 50,
  'maxRouteTemplates', 100
)
WHERE user_id = '{USER_ID}';

-- 10. Check triggers are working
SELECT 
  t.trigger_name,
  t.trigger_schema,
  t.event_object_table
FROM information_schema.triggers t
WHERE t.trigger_schema = 'public'
AND t.event_object_table IN ('user_subscriptions', 'users');

-- 11. Downgrade user to Basic
UPDATE public.user_subscriptions 
SET 
  plan_tier = 'basic',
  price_cents = 0,
  expires_at = NULL
WHERE user_id = '{USER_ID}';

-- 12. Cancel subscription
UPDATE public.user_subscriptions 
SET status = 'cancelled'
WHERE user_id = '{USER_ID}';

-- 13. Restore user to Basic (if cancelled)
UPDATE public.user_subscriptions 
SET 
  plan_tier = 'basic',
  status = 'active',
  price_cents = 0
WHERE user_id = '{USER_ID}';

-- 14. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_subscriptions';

-- 15. Test RLS (run as authenticated user)
-- Should only see own subscription
SELECT * FROM public.user_subscriptions;

-- 16. Create test user with custom limits
INSERT INTO public.user_subscriptions (user_id, plan_tier, status, custom_limits, started_at)
VALUES (
  '{USER_ID}',
  'enterprise',
  'active',
  jsonb_build_object(
    'maxTrips', 10000,
    'maxProjects', 100,
    'maxAiJobsPerMonth', 500,
    'maxStopsPerTrip', 100,
    'maxRouteTemplates', 500
  ),
  now()
)
ON CONFLICT (user_id) DO UPDATE SET
  plan_tier = 'enterprise',
  custom_limits = EXCLUDED.custom_limits;

-- 17. Get subscription stats
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN plan_tier = 'basic' THEN 1 END) as basic_users,
  COUNT(CASE WHEN plan_tier = 'pro' THEN 1 END) as pro_users,
  COUNT(CASE WHEN plan_tier = 'enterprise' THEN 1 END) as enterprise_users,
  COALESCE(SUM(CASE WHEN plan_tier = 'pro' THEN price_cents ELSE 0 END) / 100, 0) as monthly_revenue_eur
FROM public.user_subscriptions
WHERE status = 'active';

-- 18. Check update triggers are working
SELECT 
  id,
  user_id,
  plan_tier,
  created_at,
  updated_at
FROM public.user_subscriptions
ORDER BY updated_at DESC
LIMIT 5;
