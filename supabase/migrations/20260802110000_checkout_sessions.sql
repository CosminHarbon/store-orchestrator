-- Checkout Sessions: hold card checkout data until Netopia payment confirms.
-- Orders are created only after successful payment via convert_checkout_session_to_order().

CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired', 'converted')),
  payment_method TEXT NOT NULL DEFAULT 'card',
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),

  -- Immutable snapshots
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT NOT NULL,
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

  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  cart_fingerprint TEXT NOT NULL,

  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  discount_code TEXT,
  discount_meta JSONB,

  netopia_payment_id TEXT,
  netopia_payment_url TEXT,
  provider_response JSONB,

  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_status
  ON public.checkout_sessions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_expires
  ON public.checkout_sessions (expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_fingerprint
  ON public.checkout_sessions (user_id, customer_email, cart_fingerprint, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkout_sessions_order_id
  ON public.checkout_sessions (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_netopia_payment_id
  ON public.checkout_sessions (netopia_payment_id)
  WHERE netopia_payment_id IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_session_id UUID REFERENCES public.checkout_sessions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_session_id
  ON public.orders (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS checkout_session_id UUID REFERENCES public.checkout_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_checkout_session_id
  ON public.payment_transactions (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_checkout_sessions_updated_at ON public.checkout_sessions;
CREATE TRIGGER update_checkout_sessions_updated_at
BEFORE UPDATE ON public.checkout_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Users can view their own checkout sessions"
ON public.checkout_sessions FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Users can create their own checkout sessions"
ON public.checkout_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Users can update their own checkout sessions"
ON public.checkout_sessions FOR UPDATE
USING (auth.uid() = user_id);

-- Expire pending sessions past expires_at
CREATE OR REPLACE FUNCTION public.expire_checkout_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.checkout_sessions
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'pending'
    AND expires_at < now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Delete expired/cancelled sessions older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_checkout_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM public.checkout_sessions
  WHERE status IN ('expired', 'cancelled')
    AND updated_at < now() - interval '30 days';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Atomic, idempotent conversion: Checkout Session → Order (+ items + payment tx)
CREATE OR REPLACE FUNCTION public.convert_checkout_session_to_order(
  p_session_id uuid,
  p_netopia_payment_id text DEFAULT NULL,
  p_provider_response jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.checkout_sessions%ROWTYPE;
  new_order_id uuid;
  existing_tx_id uuid;
  item jsonb;
  v_payment_id text;
BEGIN
  -- Keep house tidy opportunistically
  PERFORM public.expire_checkout_sessions();

  SELECT * INTO s
  FROM public.checkout_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- Idempotent: already converted
  IF s.order_id IS NOT NULL OR s.status = 'converted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_converted', true,
      'order_id', s.order_id,
      'checkout_session_id', s.id
    );
  END IF;

  IF s.status = 'expired' OR s.expires_at < now() THEN
    UPDATE public.checkout_sessions
    SET status = 'expired', updated_at = now()
    WHERE id = s.id AND status = 'pending';

    RETURN jsonb_build_object('success', false, 'error', 'SESSION_EXPIRED');
  END IF;

  IF s.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_CANCELLED');
  END IF;

  v_payment_id := COALESCE(p_netopia_payment_id, s.netopia_payment_id);

  -- 1) Create Order from immutable snapshot (awaiting_payment first so stock trigger fires on UPDATE)
  INSERT INTO public.orders (
    user_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_address,
    customer_city,
    customer_county,
    customer_street,
    customer_street_number,
    customer_block,
    customer_apartment,
    delivery_type,
    selected_carrier_code,
    locker_id,
    locker_name,
    locker_address,
    total,
    payment_status,
    order_status,
    shipping_status,
    checkout_session_id
  ) VALUES (
    s.user_id,
    s.customer_name,
    s.customer_email,
    s.customer_phone,
    s.customer_address,
    s.customer_city,
    s.customer_county,
    s.customer_street,
    s.customer_street_number,
    s.customer_block,
    s.customer_apartment,
    s.delivery_type,
    s.selected_carrier_code,
    s.locker_id,
    s.locker_name,
    s.locker_address,
    s.total,
    'pending',
    'awaiting_payment',
    'pending',
    s.id
  )
  RETURNING id INTO new_order_id;

  -- 2) Order items from snapshot (never live product prices)
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(s.items, '[]'::jsonb))
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_title,
      product_price,
      quantity
    ) VALUES (
      new_order_id,
      NULLIF(item->>'product_id', '')::uuid,
      COALESCE(item->>'title', item->>'product_title', 'Item'),
      COALESCE((item->>'price')::numeric, (item->>'product_price')::numeric, 0),
      COALESCE((item->>'quantity')::integer, 1)
    );
  END LOOP;

  -- 3) Mark order paid (fires reduce_stock_on_order_paid trigger)
  UPDATE public.orders
  SET payment_status = 'paid',
      order_status = 'paid',
      updated_at = now()
  WHERE id = new_order_id;

  -- 4) Payment transaction: link existing session tx or create completed one
  SELECT id INTO existing_tx_id
  FROM public.payment_transactions
  WHERE checkout_session_id = s.id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF existing_tx_id IS NOT NULL THEN
    UPDATE public.payment_transactions
    SET order_id = new_order_id,
        payment_status = 'completed',
        netopia_payment_id = COALESCE(v_payment_id, netopia_payment_id),
        netopia_order_id = COALESCE(netopia_order_id, s.id::text),
        provider_response = COALESCE(p_provider_response, provider_response),
        updated_at = now()
    WHERE id = existing_tx_id;
  ELSE
    INSERT INTO public.payment_transactions (
      user_id,
      order_id,
      checkout_session_id,
      payment_provider,
      payment_status,
      amount,
      currency,
      payment_method,
      netopia_payment_id,
      netopia_order_id,
      provider_response
    ) VALUES (
      s.user_id,
      new_order_id,
      s.id,
      'netopia',
      'completed',
      s.total,
      'RON',
      'card',
      v_payment_id,
      s.id::text,
      p_provider_response
    );
  END IF;

  -- 5) Link session
  UPDATE public.checkout_sessions
  SET status = 'converted',
      payment_status = 'paid',
      order_id = new_order_id,
      netopia_payment_id = COALESCE(v_payment_id, netopia_payment_id),
      provider_response = COALESCE(p_provider_response, provider_response),
      updated_at = now()
  WHERE id = s.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_converted', false,
    'order_id', new_order_id,
    'checkout_session_id', s.id,
    'user_id', s.user_id,
    'customer_name', s.customer_name,
    'total', s.total
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Race: another worker converted first
    SELECT order_id INTO new_order_id
    FROM public.checkout_sessions
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_converted', true,
      'order_id', new_order_id,
      'checkout_session_id', p_session_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_checkout_session_to_order(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_checkout_session_to_order(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_checkout_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_checkout_sessions() TO service_role;

COMMENT ON TABLE public.checkout_sessions IS
  'Card checkout snapshots. Orders are created only after Netopia payment confirmation.';
COMMENT ON FUNCTION public.convert_checkout_session_to_order(uuid, text, jsonb) IS
  'Idempotent atomic conversion of a paid checkout session into an order.';
