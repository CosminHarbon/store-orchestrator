-- Abandoned Carts: pre–Place Order checkout progress (independent of checkout_sessions / orders)

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'converted', 'discarded', 'expired')),

  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_city TEXT,
  customer_county TEXT,
  customer_street TEXT,
  customer_street_number TEXT,
  customer_block TEXT,
  customer_apartment TEXT,

  delivery_type TEXT,
  selected_carrier_code TEXT,
  locker_id TEXT,
  locker_name TEXT,
  locker_address TEXT,

  payment_method TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  cart_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  checkout_step TEXT NOT NULL DEFAULT 'cart'
    CHECK (checkout_step IN ('cart', 'checkout', 'ready')),

  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovered_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  converted_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  converted_checkout_session_id UUID REFERENCES public.checkout_sessions(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active abandoned cart per browser session per store
CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_carts_active_session
  ON public.abandoned_carts (user_id, session_token)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_user_status_activity
  ON public.abandoned_carts (user_id, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_user_email
  ON public.abandoned_carts (user_id, customer_email)
  WHERE customer_email IS NOT NULL;

DROP TRIGGER IF EXISTS update_abandoned_carts_updated_at ON public.abandoned_carts;
CREATE TRIGGER update_abandoned_carts_updated_at
BEFORE UPDATE ON public.abandoned_carts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own abandoned carts" ON public.abandoned_carts;
CREATE POLICY "Users can view their own abandoned carts"
ON public.abandoned_carts FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own abandoned carts" ON public.abandoned_carts;
CREATE POLICY "Users can update their own abandoned carts"
ON public.abandoned_carts FOR UPDATE
USING (auth.uid() = user_id);

-- Expire idle active carts (default 14 days)
CREATE OR REPLACE FUNCTION public.expire_abandoned_carts(p_idle_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.abandoned_carts
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND last_activity_at < now() - make_interval(days => p_idle_days);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Delete old non-active carts (default 60 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_abandoned_carts(p_keep_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.abandoned_carts
  WHERE status IN ('converted', 'discarded', 'expired')
    AND COALESCE(converted_at, updated_at, created_at) < now() - make_interval(days => p_keep_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_abandoned_carts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_abandoned_carts(integer) TO service_role;

-- Realtime for merchant Orders page
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'abandoned_carts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.abandoned_carts;
  END IF;
END $$;

COMMENT ON TABLE public.abandoned_carts IS
  'Pre–Place Order checkout progress. Independent of checkout_sessions (pending card) and orders.';
