-- Fuente de verdad de planes y Stripe, accesible solo desde el servidor.
-- Crea siempre un perfil Free/basic al registrarse y elimina del navegador
-- cualquier permiso para modificar user_profiles directamente.

CREATE TABLE IF NOT EXISTS public.billing_entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'basic' CHECK (plan_tier IN ('basic', 'pro')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_subscription_status TEXT,
  stripe_price_id TEXT,
  stripe_current_period_end TIMESTAMPTZ,
  stripe_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  stripe_event_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_entitlements_stripe_customer_id_key
  ON public.billing_entitlements (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_entitlements_stripe_subscription_id_key
  ON public.billing_entitlements (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;

-- Sin policies: anon/authenticated no pueden leer ni escribir facturación.
REVOKE ALL ON TABLE public.billing_entitlements FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.billing_entitlements TO service_role;

-- Todo usuario de Auth debe tener perfil y plan Free desde el primer segundo.
INSERT INTO public.user_profiles (id, full_name, plan_tier)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  'basic'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Migra los datos de Stripe existentes sin sobrescribir la nueva tabla si la
-- migración se ejecuta más de una vez.
INSERT INTO public.billing_entitlements (
  user_id,
  plan_tier,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  stripe_price_id,
  stripe_current_period_end,
  stripe_cancel_at_period_end,
  updated_at
)
SELECT
  p.id,
  CASE WHEN lower(COALESCE(p.plan_tier, 'basic')) = 'pro' THEN 'pro' ELSE 'basic' END,
  p.stripe_customer_id,
  p.stripe_subscription_id,
  p.stripe_subscription_status,
  p.stripe_price_id,
  p.stripe_current_period_end,
  COALESCE(p.stripe_cancel_at_period_end, false),
  COALESCE(p.stripe_updated_at, p.updated_at, now())
FROM public.user_profiles p
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_fahrtenbuch_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, plan_tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    'basic'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.billing_entitlements (user_id, plan_tier)
  VALUES (NEW.id, 'basic')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_fahrtenbuch_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_fahrtenbuch ON auth.users;
CREATE TRIGGER on_auth_user_created_fahrtenbuch
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_fahrtenbuch_user();

-- El perfil se lee desde el navegador, pero solo la API con service_role lo
-- modifica. Esto protege plan_tier y las columnas Stripe incluso si alguien
-- manipula manualmente las peticiones del frontend.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;

-- Contador gratuito seudonimizado. No referencia auth.users a propósito:
-- borrar/recrear una cuenta no reinicia la cuota de la misma identidad.
CREATE TABLE IF NOT EXISTS public.free_ai_usage_ledger (
  identity_hash TEXT NOT NULL,
  period_start DATE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'callsheet' CHECK (kind IN ('callsheet')),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  first_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 months'),
  PRIMARY KEY (identity_hash, period_start, kind)
);

CREATE INDEX IF NOT EXISTS free_ai_usage_ledger_expires_at_idx
  ON public.free_ai_usage_ledger (expires_at);

ALTER TABLE public.free_ai_usage_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.free_ai_usage_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.free_ai_usage_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.increment_free_ai_usage(
  p_identity_hash TEXT,
  p_period_start DATE,
  p_kind TEXT DEFAULT 'callsheet'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_used_count INTEGER;
BEGIN
  -- Los hashes de meses ya finalizados no se conservan indefinidamente.
  DELETE FROM public.free_ai_usage_ledger WHERE expires_at <= now();

  INSERT INTO public.free_ai_usage_ledger (
    identity_hash, period_start, kind, used_count,
    first_used_at, last_used_at, expires_at
  )
  VALUES (
    p_identity_hash, p_period_start, p_kind, 1,
    now(), now(), p_period_start + interval '2 months'
  )
  ON CONFLICT (identity_hash, period_start, kind)
  DO UPDATE SET
    used_count = public.free_ai_usage_ledger.used_count + 1,
    last_used_at = now()
  RETURNING used_count INTO v_used_count;

  RETURN v_used_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_free_ai_usage(TEXT, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_free_ai_usage(TEXT, DATE, TEXT) TO service_role;
