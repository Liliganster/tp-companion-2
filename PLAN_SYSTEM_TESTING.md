# Plan System - Testing & Verification Guide

## Database Setup

1. **Run the migration** in Supabase:
   ```bash
   supabase db push
   ```
   This will create:
   - `user_subscriptions` table
   - Auto-trigger to create "basic" plan for new users
   - RLS policies for security
   - View `user_plan_info` with calculated limits

2. **Verify table exists**:
   ```sql
   SELECT * FROM public.user_subscriptions LIMIT 1;
   ```

## How the Plan System Works

### 1. User Registration Flow
- When a user signs up → Auth trigger creates record in `user_subscriptions` with `plan_tier = 'basic'`
- User has 20 trips, 3 projects, 5 AI/month, 10 stops/trip by default

### 2. Loading Plan on App Startup
- `PlanContext` fetches from `user_subscriptions` table
- If no record exists, creates one automatically
- Logs: `[PlanContext] Loaded plan: basic for user {id}`

### 3. Upgrading to Pro (19€/month)
- User clicks "Upgrade to Pro" button on `/plans` page
- Calls `POST /api/user/subscription` with `{ tier: "pro" }`
- API saves to database:
  - `plan_tier = 'pro'`
  - `started_at = now()`
  - `price_cents = 1900`
  - `status = 'active'`
- PlanContext reloads and applies new limits:
  - 2000 trips, 30 projects, 60 AI/month, 25 stops/trip
- Toast shows: "¡Bienvenido a Pro!"

### 4. Limit Enforcement
- `usePlanLimits()` hook checks current plan limits
- Each page (Trips, Projects, etc.) validates before allowing actions
- Logs show: `[PlanLimits] Plan: pro, Max trips: 2000, ...`

## Testing Checklist

### ✓ Test 1: User Creates Account with Basic Plan
1. Sign up new account
2. Check browser console: Should see `[PlanContext] Loaded plan: basic`
3. Query Supabase:
   ```sql
   SELECT user_id, plan_tier, status FROM public.user_subscriptions 
   WHERE user_id = '{user_id}';
   ```
   Expected: `basic | active`

### ✓ Test 2: Visit Plans Page
1. Navigate to `/plans`
2. Check console logs:
   - `[PlanLimits] Plan: basic, Max trips: 20, Max projects: 3, Max AI: 5`
3. Click "Upgrade to Pro"
4. Wait for toast: "¡Bienvenido a Pro!"
5. Check console: `[PlanContext] Upgrade successful, new tier: pro`

### ✓ Test 3: Verify Database Updated
```sql
SELECT plan_tier, status, started_at, price_cents 
FROM public.user_subscriptions 
WHERE user_id = '{user_id}';
```
Expected: `pro | active | 2024-01-09T... | 1900`

### ✓ Test 4: Plan Limits Applied
1. User on Pro plan should see:
   - `[PlanLimits] Plan: pro, Max trips: 2000, Max projects: 30, Max AI: 60`
2. Create trips/projects to near limit
3. Limit validation should trigger

### ✓ Test 5: Sidebar Shows Current Plan
1. Sidebar shows crown icon with "Pro" badge
2. Refreshing page keeps Pro badge
3. If still "Basic", no badge shown

## Console Logs to Monitor

### Plan Loading
```
[PlanContext] Fetching subscription for user {id}
[PlanContext] Loaded plan: pro for user {id}
```

### Plan Upgrade
```
[Subscription] User {id} upgrading to pro
[Subscription] Successfully updated {id} to pro
[PlanContext] Starting upgrade to pro
[PlanContext] Upgrade successful, new tier: pro
```

### Limit Checks
```
[PlanLimits] Plan: pro, Max trips: 2000, Max projects: 30, Max AI: 60
[PlanLimits] Trips: 5 AI, 10 non-AI, 15 total
[PlanLimits] Active projects: 2/30
```

## Troubleshooting

### ❌ Problem: Plan not saving to database
- Check API response in Network tab
- Look for `[Subscription]` logs in server
- Verify Supabase credentials in environment

### ❌ Problem: Plan not loading on page refresh
- Check RLS policy: `Users can view own subscription`
- Verify user is authenticated
- Check browser console for errors

### ❌ Problem: Limits not enforcing
- Verify `usePlanLimits()` is called in the page
- Check `[PlanLimits]` logs show correct tier
- Check current trip/project counts

### ❌ Problem: Sidebar doesn't show plan tier
- Verify PlanContext is properly loaded
- Check that `planTier` is being read correctly
- Refresh page to reload context

## Database Admin Operations

### Set user to Pro plan manually
```sql
UPDATE public.user_subscriptions 
SET plan_tier = 'pro', price_cents = 1900, started_at = now()
WHERE user_id = '{user_id}';
```

### Set custom limits for enterprise user
```sql
UPDATE public.user_subscriptions 
SET custom_limits = '{"maxTrips": 5000, "maxAiJobsPerMonth": 100}'::jsonb
WHERE user_id = '{user_id}';
```

### View all user subscriptions
```sql
SELECT user_id, plan_tier, status, started_at, price_cents 
FROM public.user_subscriptions 
ORDER BY created_at DESC;
```

### Export user plan info (with calculated limits)
```sql
SELECT * FROM public.user_plan_info 
WHERE user_id = '{user_id}';
```

## Expected Database Schema

Table: `user_subscriptions`
- `id` (UUID) - Primary key
- `user_id` (UUID) - Foreign key to auth.users
- `plan_tier` (TEXT) - 'basic', 'pro', 'enterprise'
- `status` (TEXT) - 'active', 'cancelled', 'past_due', 'trialing'
- `started_at` (TIMESTAMPTZ) - When subscription started
- `expires_at` (TIMESTAMPTZ) - When subscription expires (NULL = no expiration)
- `custom_limits` (JSONB) - Override limits for enterprise
- `price_cents` (INTEGER) - Monthly price in cents
- `currency` (TEXT) - 'EUR'
- `created_at` (TIMESTAMPTZ) - Record creation time
- `updated_at` (TIMESTAMPTZ) - Last update time

RLS Policies:
- Users can SELECT their own subscription
- Service role can INSERT/UPDATE/DELETE
