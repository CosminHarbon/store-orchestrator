-- Billing address on every order (invoice client address).
-- Same as delivery for home, or a distinct address. Always required for locker.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS billing_same_as_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_county text,
  ADD COLUMN IF NOT EXISTS billing_street text,
  ADD COLUMN IF NOT EXISTS billing_street_number text,
  ADD COLUMN IF NOT EXISTS billing_block text,
  ADD COLUMN IF NOT EXISTS billing_apartment text;

UPDATE public.orders
SET
  billing_address = COALESCE(NULLIF(billing_address, ''), customer_address),
  billing_city = COALESCE(NULLIF(billing_city, ''), customer_city),
  billing_county = COALESCE(NULLIF(billing_county, ''), customer_county),
  billing_street = COALESCE(NULLIF(billing_street, ''), customer_street),
  billing_street_number = COALESCE(NULLIF(billing_street_number, ''), customer_street_number),
  billing_block = COALESCE(billing_block, customer_block),
  billing_apartment = COALESCE(billing_apartment, customer_apartment)
WHERE billing_address IS NULL OR billing_address = '';

ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS billing_same_as_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_county text,
  ADD COLUMN IF NOT EXISTS billing_street text,
  ADD COLUMN IF NOT EXISTS billing_street_number text,
  ADD COLUMN IF NOT EXISTS billing_block text,
  ADD COLUMN IF NOT EXISTS billing_apartment text;

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
    billing_same_as_delivery,
    billing_address,
    billing_city,
    billing_county,
    billing_street,
    billing_street_number,
    billing_block,
    billing_apartment,
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
    COALESCE(s.billing_same_as_delivery, true),
    COALESCE(s.billing_address, s.customer_address),
    COALESCE(s.billing_city, s.customer_city),
    COALESCE(s.billing_county, s.customer_county),
    COALESCE(s.billing_street, s.customer_street),
    COALESCE(s.billing_street_number, s.customer_street_number),
    COALESCE(s.billing_block, s.customer_block),
    COALESCE(s.billing_apartment, s.customer_apartment),
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
