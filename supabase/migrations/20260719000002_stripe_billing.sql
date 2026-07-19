-- Stripe Billing para Fahrtenbuch Pro.
-- Idempotente y compatible con perfiles existentes.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_stripe_customer_id_key
  ON public.user_profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_stripe_subscription_id_key
  ON public.user_profiles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- RLS por fila no protege columnas. Este trigger impide que anon/authenticated
-- se otorguen Pro o falsifiquen IDs/estado de Stripe. El webhook usa service_role.
CREATE OR REPLACE FUNCTION public.protect_user_profile_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan_tier := 'basic';
      NEW.stripe_customer_id := NULL;
      NEW.stripe_subscription_id := NULL;
      NEW.stripe_subscription_status := NULL;
      NEW.stripe_price_id := NULL;
      NEW.stripe_current_period_end := NULL;
      NEW.stripe_cancel_at_period_end := false;
      NEW.stripe_updated_at := NULL;
    ELSE
      NEW.plan_tier := OLD.plan_tier;
      NEW.stripe_customer_id := OLD.stripe_customer_id;
      NEW.stripe_subscription_id := OLD.stripe_subscription_id;
      NEW.stripe_subscription_status := OLD.stripe_subscription_status;
      NEW.stripe_price_id := OLD.stripe_price_id;
      NEW.stripe_current_period_end := OLD.stripe_current_period_end;
      NEW.stripe_cancel_at_period_end := OLD.stripe_cancel_at_period_end;
      NEW.stripe_updated_at := OLD.stripe_updated_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_profile_billing_fields
  ON public.user_profiles;
CREATE TRIGGER protect_user_profile_billing_fields
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_profile_billing_fields();

