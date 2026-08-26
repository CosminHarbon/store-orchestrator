-- Phase 0 follow-up — remove a lock-upgrade deadlock between concurrent orders.
--
-- Found by the Phase 0 concurrency test: two buyers ordering the same product
-- at the same instant failed with "deadlock detected" instead of one of them
-- getting a clean INSUFFICIENT_STOCK.
--
-- Cause: inserting into order_items takes a FOR KEY SHARE lock on the
-- referenced products row (order_items.product_id -> products.id). Both
-- transactions therefore held FOR KEY SHARE on the same product before either
-- tried to upgrade to FOR UPDATE inside apply_order_stock, and each waited for
-- the other to release. With enough stock for both buyers this would still have
-- killed one of the orders, so it is not only a bad error message.
--
-- Fix: take the strong lock on every referenced product BEFORE inserting the
-- order lines, in ascending product_id order. Concurrent orders then serialise
-- on the product row instead of deadlocking, and the loser re-reads the
-- committed stock and fails with the intended message.

create or replace function public.lock_products_for_items(p_items jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  -- Ascending id order so multi-line orders always take locks in the same
  -- sequence and cannot deadlock against each other.
  for v_id in
    select distinct (i->>'product_id')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    where nullif(i->>'product_id', '') is not null
    order by 1
  loop
    perform 1 from public.products where id = v_id for update;
  end loop;
end;
$function$;

comment on function public.lock_products_for_items(jsonb) is
  'Locks every product referenced by a cart snapshot, in deterministic order, before order lines are written.';

revoke all on function public.lock_products_for_items(jsonb) from public;
grant execute on function public.lock_products_for_items(jsonb) to service_role;

-- COD: lock before writing lines.
create or replace function public.create_cod_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_stock    jsonb;
begin
  insert into public.orders (
    user_id, customer_name, customer_email, customer_phone, customer_address,
    customer_city, customer_county, customer_street, customer_street_number,
    customer_block, customer_apartment,
    billing_same_as_delivery, billing_address, billing_city, billing_county,
    billing_street, billing_street_number, billing_block, billing_apartment,
    delivery_type, selected_carrier_code, locker_id, locker_name, locker_address,
    total, payment_status, order_status, shipping_status,
    customer_notes, delivery_fee, delivery_distance_km, delivery_pricing_snapshot
  ) values (
    (p_order->>'user_id')::uuid,
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_order->>'customer_address',
    p_order->>'customer_city',
    p_order->>'customer_county',
    p_order->>'customer_street',
    p_order->>'customer_street_number',
    p_order->>'customer_block',
    p_order->>'customer_apartment',
    coalesce((p_order->>'billing_same_as_delivery')::boolean, true),
    p_order->>'billing_address',
    p_order->>'billing_city',
    p_order->>'billing_county',
    p_order->>'billing_street',
    p_order->>'billing_street_number',
    p_order->>'billing_block',
    p_order->>'billing_apartment',
    p_order->>'delivery_type',
    p_order->>'selected_carrier_code',
    p_order->>'locker_id',
    p_order->>'locker_name',
    p_order->>'locker_address',
    coalesce((p_order->>'total')::numeric, 0),
    coalesce(p_order->>'payment_status', 'cash'),
    coalesce(p_order->>'order_status', 'paid')::public.order_status_enum,
    coalesce(p_order->>'shipping_status', 'pending'),
    p_order->>'customer_notes',
    (p_order->>'delivery_fee')::numeric,
    (p_order->>'delivery_distance_km')::numeric,
    nullif(p_order->'delivery_pricing_snapshot', 'null'::jsonb)
  )
  returning id into v_order_id;

  perform public.lock_products_for_items(p_items);

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.order_items (order_id, product_id, product_title, product_price, quantity)
    values (
      v_order_id,
      nullif(v_item->>'product_id', '')::uuid,
      coalesce(v_item->>'title', v_item->>'product_title', 'Item'),
      coalesce((v_item->>'price')::numeric, (v_item->>'product_price')::numeric, 0),
      coalesce((v_item->>'quantity')::integer, 1)
    );
  end loop;

  -- Nothing has been charged for COD, so insufficient stock must abort the
  -- whole order rather than oversell.
  v_stock := public.apply_order_stock(v_order_id, 'strict');
  if coalesce((v_stock->>'success')::boolean, false) is not true then
    raise exception 'STOCK_APPLY_FAILED: %', coalesce(v_stock->>'error', 'UNKNOWN')
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order', to_jsonb((select o from public.orders o where o.id = v_order_id)),
    'stock', v_stock
  );
end;
$function$;

-- Card: same pre-lock, immediately before the order lines are written.
create or replace function public.convert_checkout_session_to_order(
  p_session_id uuid,
  p_netopia_payment_id text default null::text,
  p_provider_response jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  s public.checkout_sessions%ROWTYPE;
  new_order_id uuid;
  existing_tx_id uuid;
  item jsonb;
  v_payment_id text;
  v_stock jsonb;
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
    user_id, customer_name, customer_email, customer_phone,
    customer_address, customer_city, customer_county, customer_street,
    customer_street_number, customer_block, customer_apartment,
    billing_same_as_delivery, billing_address, billing_city, billing_county,
    billing_street, billing_street_number, billing_block, billing_apartment,
    delivery_type, selected_carrier_code, locker_id, locker_name, locker_address,
    total, payment_status, order_status, shipping_status, checkout_session_id,
    customer_notes, delivery_fee, delivery_distance_km, delivery_pricing_snapshot
  ) VALUES (
    s.user_id, s.customer_name, s.customer_email, s.customer_phone,
    s.customer_address, s.customer_city, s.customer_county, s.customer_street,
    s.customer_street_number, s.customer_block, s.customer_apartment,
    COALESCE(s.billing_same_as_delivery, true),
    COALESCE(s.billing_address, s.customer_address),
    COALESCE(s.billing_city, s.customer_city),
    COALESCE(s.billing_county, s.customer_county),
    COALESCE(s.billing_street, s.customer_street),
    COALESCE(s.billing_street_number, s.customer_street_number),
    COALESCE(s.billing_block, s.customer_block),
    COALESCE(s.billing_apartment, s.customer_apartment),
    s.delivery_type, s.selected_carrier_code, s.locker_id, s.locker_name, s.locker_address,
    s.total, 'paid', 'paid', 'pending', s.id,
    s.customer_notes, s.shipping_amount, s.delivery_distance_km, s.delivery_pricing_snapshot
  )
  RETURNING id INTO new_order_id;

  PERFORM public.lock_products_for_items(s.items);

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(s.items, '[]'::jsonb))
  LOOP
    INSERT INTO public.order_items (order_id, product_id, product_title, product_price, quantity)
    VALUES (
      new_order_id,
      NULLIF(item->>'product_id', '')::uuid,
      COALESCE(item->>'title', item->>'product_title', 'Item'),
      COALESCE((item->>'price')::numeric, (item->>'product_price')::numeric, 0),
      COALESCE((item->>'quantity')::integer, 1)
    );
  END LOOP;

  -- The customer has already been charged, so never discard the order here:
  -- deduct what exists, never go negative, and record any shortfall for the
  -- merchant on the order itself.
  v_stock := public.apply_order_stock(new_order_id, 'lenient');

  SELECT id INTO existing_tx_id
  FROM public.payment_transactions
  WHERE checkout_session_id = s.id
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF existing_tx_id IS NOT NULL THEN
    UPDATE public.payment_transactions
    SET order_id = new_order_id, payment_status = 'completed',
        netopia_payment_id = COALESCE(v_payment_id, netopia_payment_id),
        netopia_order_id = COALESCE(netopia_order_id, s.id::text),
        provider_response = COALESCE(p_provider_response, provider_response),
        updated_at = now()
    WHERE id = existing_tx_id;
  ELSE
    INSERT INTO public.payment_transactions (
      user_id, order_id, checkout_session_id, payment_provider, payment_status,
      amount, currency, payment_method, netopia_payment_id, netopia_order_id, provider_response
    ) VALUES (
      s.user_id, new_order_id, s.id, 'netopia', 'completed',
      s.total, 'RON', 'card', v_payment_id, s.id::text, p_provider_response
    );
  END IF;

  UPDATE public.checkout_sessions
  SET status = 'converted', payment_status = 'paid', order_id = new_order_id,
      netopia_payment_id = COALESCE(v_payment_id, netopia_payment_id),
      provider_response = COALESCE(p_provider_response, provider_response),
      updated_at = now()
  WHERE id = s.id;

  RETURN jsonb_build_object(
    'success', true, 'already_converted', false,
    'order_id', new_order_id, 'checkout_session_id', s.id,
    'user_id', s.user_id, 'customer_name', s.customer_name, 'total', s.total,
    'stock', v_stock
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT order_id INTO new_order_id FROM public.checkout_sessions WHERE id = p_session_id;
    RETURN jsonb_build_object(
      'success', true, 'already_converted', true,
      'order_id', new_order_id, 'checkout_session_id', p_session_id
    );
END;
$function$;
