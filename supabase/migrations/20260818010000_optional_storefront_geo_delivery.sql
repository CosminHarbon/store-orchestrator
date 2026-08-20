-- Optional storefront settings + custom geographic delivery pricing.
-- Defaults preserve existing store behaviour.

-- 1) Store / product flags
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_stock_to_customers BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_order_notes BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS show_stock_to_customers BOOLEAN;

COMMENT ON COLUMN public.profiles.show_stock_to_customers IS 'When false, storefront hides stock quantities. Inventory still works.';
COMMENT ON COLUMN public.profiles.allow_order_notes IS 'When true, checkout shows an optional customer observation field.';
COMMENT ON COLUMN public.products.show_stock_to_customers IS 'NULL inherits store default; true/false overrides.';

-- 2) Persist notes + delivery quote on orders / card sessions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_notes TEXT,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS delivery_pricing_snapshot JSONB;

ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS customer_notes TEXT,
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS delivery_pricing_snapshot JSONB;

-- 3) Per-store custom delivery settings
CREATE TABLE IF NOT EXISTS public.delivery_pricing_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  coverage_mode TEXT NOT NULL DEFAULT 'romania'
    CHECK (coverage_mode IN ('romania', 'counties', 'localities')),
  covered_counties TEXT[] NOT NULL DEFAULT '{}',
  covered_localities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  county TEXT,
  locality TEXT,
  min_distance_km NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_distance_km >= 0),
  max_distance_km NUMERIC(10,2) NOT NULL CHECK (max_distance_km > min_distance_km),
  price_per_unit NUMERIC(12,2) NOT NULL CHECK (price_per_unit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_pricing_rules_user_idx
  ON public.delivery_pricing_rules (user_id);

ALTER TABLE public.delivery_pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own delivery pricing settings" ON public.delivery_pricing_settings;
CREATE POLICY "Owners manage own delivery pricing settings"
  ON public.delivery_pricing_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners manage own delivery pricing rules" ON public.delivery_pricing_rules;
CREATE POLICY "Owners manage own delivery pricing rules"
  ON public.delivery_pricing_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_pricing_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_pricing_rules TO authenticated;
GRANT ALL ON TABLE public.delivery_pricing_settings TO service_role;
GRANT ALL ON TABLE public.delivery_pricing_rules TO service_role;
REVOKE ALL ON TABLE public.delivery_pricing_settings FROM anon;
REVOKE ALL ON TABLE public.delivery_pricing_rules FROM anon;

DROP TRIGGER IF EXISTS update_delivery_pricing_settings_updated_at ON public.delivery_pricing_settings;
CREATE TRIGGER update_delivery_pricing_settings_updated_at
  BEFORE UPDATE ON public.delivery_pricing_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_delivery_pricing_rules_updated_at ON public.delivery_pricing_rules;
CREATE TRIGGER update_delivery_pricing_rules_updated_at
  BEFORE UPDATE ON public.delivery_pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Copy notes + delivery snapshot when converting a paid card session
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
  PERFORM public.expire_checkout_sessions();

  SELECT * INTO s
  FROM public.checkout_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

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
    checkout_session_id,
    customer_notes,
    delivery_fee,
    delivery_distance_km,
    delivery_pricing_snapshot
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
    s.id,
    s.customer_notes,
    s.shipping_amount,
    s.delivery_distance_km,
    s.delivery_pricing_snapshot
  )
  RETURNING id INTO new_order_id;

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

  UPDATE public.orders
  SET payment_status = 'paid',
      order_status = 'paid',
      updated_at = now()
  WHERE id = new_order_id;

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
