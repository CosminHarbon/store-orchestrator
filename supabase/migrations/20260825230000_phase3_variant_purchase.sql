-- Phase 3 — variant purchase: order snapshots, variant-level stock, locks.
--
-- Simple products still deduct/restore products.stock.
-- Variant products deduct/restore product_variants.stock; parent stock is
-- updated only by the existing mirror trigger. Do not decrement both.

-- ---------------------------------------------------------------------------
-- 1. Historical order-item snapshots
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_title text,
  add column if not exists variant_sku text,
  add column if not exists variant_options jsonb;

create index if not exists order_items_variant_id_idx
  on public.order_items (variant_id);

comment on column public.order_items.variant_id is
  'Live FK to the sold combination. Null on historical simple-product lines and if the variant is later deleted. Title/SKU/options are the purchase snapshot.';
comment on column public.order_items.variant_title is
  'Snapshot such as Medium / Black. Never reconstructed from current variant tables.';
comment on column public.order_items.variant_sku is
  'SKU at purchase time.';
comment on column public.order_items.variant_options is
  'Snapshot [{name, value}, ...] in option-position order.';

-- ---------------------------------------------------------------------------
-- 2. Ownership: require a valid variant on variant products, reject extras
--    on simple products, never wait on another tenant's rows.
-- ---------------------------------------------------------------------------

create or replace function public.assert_items_owned_by(
  p_items jsonb,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item       jsonb;
  v_id         uuid;
  v_variant_id uuid;
  v_qty        numeric;
  v_owned      boolean;
  v_has_vars   boolean;
  v_var_ok     boolean;
  v_lines      integer;
begin
  if p_user_id is null then
    raise exception 'INVALID_PRODUCT' using errcode = 'P0001';
  end if;

  select count(*) into v_lines
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  if v_lines = 0 then
    raise exception 'INVALID_ITEMS' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    begin
      v_id := nullif(v_item->>'product_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_PRODUCT' using errcode = 'P0001';
    end;

    if v_id is null then
      raise exception 'INVALID_PRODUCT' using errcode = 'P0001';
    end if;

    begin
      v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_VARIANT' using errcode = 'P0001';
    end;

    begin
      v_qty := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end;

    if v_qty is null or v_qty <> trunc(v_qty) or v_qty < 1 or v_qty > 999 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select p.has_variants into v_has_vars
    from public.products p
    where p.id = v_id and p.user_id = p_user_id;

    if not found then
      raise exception 'INVALID_PRODUCT' using errcode = 'P0001';
    end if;

    if coalesce(v_has_vars, false) then
      if v_variant_id is null then
        raise exception 'VARIANT_REQUIRED' using errcode = 'P0001';
      end if;

      select exists (
        select 1
        from public.product_variants pv
        join public.products p on p.id = pv.product_id
        where pv.id = v_variant_id
          and pv.product_id = v_id
          and p.user_id = p_user_id
      ) into v_var_ok;

      if not v_var_ok then
        raise exception 'INVALID_VARIANT' using errcode = 'P0001';
      end if;
    elsif v_variant_id is not null then
      raise exception 'INVALID_VARIANT' using errcode = 'P0001';
    end if;
  end loop;
end;
$function$;

comment on function public.assert_items_owned_by(jsonb, uuid) is
  'Rejects foreign products, missing/invalid variants, and variant_id on simple products. Service-role only.';

-- ---------------------------------------------------------------------------
-- 3. Locks: products first (id order), then variants (id order).
-- ---------------------------------------------------------------------------

create or replace function public.lock_products_for_items(
  p_items jsonb,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id  uuid;
  v_vid uuid;
begin
  if p_user_id is null then
    raise exception 'INVALID_PRODUCT' using errcode = 'P0001';
  end if;

  for v_id in
    select distinct (i->>'product_id')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    where nullif(i->>'product_id', '') is not null
    order by 1
  loop
    perform 1
    from public.products
    where id = v_id
      and user_id = p_user_id
    for update;
  end loop;

  for v_vid in
    select distinct (i->>'variant_id')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    where nullif(i->>'variant_id', '') is not null
    order by 1
  loop
    perform 1
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_vid
      and p.user_id = p_user_id
    for update of pv;
  end loop;
end;
$function$;

comment on function public.lock_products_for_items(jsonb, uuid) is
  'Locks owned products then owned variants in id order before writing order_items.';

-- ---------------------------------------------------------------------------
-- 4. apply_order_stock — deduct the sellable unit
-- ---------------------------------------------------------------------------

create or replace function public.apply_order_stock(
  p_order_id uuid,
  p_mode text default 'strict'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order        public.orders%rowtype;
  v_line         record;
  v_available    integer;
  v_owner        uuid;
  v_has_vars     boolean;
  v_var_product  uuid;
  v_var_active   boolean;
  v_take         integer;
  v_shortfall    jsonb := '[]'::jsonb;
  v_applied      jsonb := '[]'::jsonb;
  v_label        text;
begin
  if p_mode not in ('strict', 'lenient') then
    raise exception 'apply_order_stock: invalid mode %', p_mode;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  if v_order.stock_applied_at is not null then
    return jsonb_build_object(
      'success', true, 'already_applied', true,
      'order_id', p_order_id, 'stock_applied_at', v_order.stock_applied_at
    );
  end if;

  if v_order.order_status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'ORDER_CANCELLED');
  end if;

  for v_line in
    select oi.product_id,
           oi.variant_id,
           sum(oi.quantity)::integer as qty,
           min(oi.product_title)     as title,
           min(oi.variant_title)     as variant_title
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id nulls first
  loop
    v_label := trim(both ' ' from concat_ws(
      ' — ',
      v_line.title,
      nullif(v_line.variant_title, '')
    ));

    select p.stock, p.user_id, p.has_variants
      into v_available, v_owner, v_has_vars
    from public.products p
    where p.id = v_line.product_id
    for update;

    if not found then
      continue;
    end if;

    if v_owner is distinct from v_order.user_id then
      if p_mode = 'strict' then
        raise exception 'INVALID_PRODUCT'
          using errcode = 'P0001';
      end if;

      v_shortfall := v_shortfall || jsonb_build_object(
        'product_id',    v_line.product_id,
        'variant_id',    v_line.variant_id,
        'product_title', v_line.title,
        'variant_title', v_line.variant_title,
        'requested',     v_line.qty,
        'applied',       0,
        'missing',       v_line.qty,
        'reason',        'FOREIGN_PRODUCT'
      );
      continue;
    end if;

    if v_line.variant_id is not null then
      select pv.stock, pv.product_id, pv.active
        into v_available, v_var_product, v_var_active
      from public.product_variants pv
      where pv.id = v_line.variant_id
      for update;

      if not found then
        if p_mode = 'strict' then
          raise exception 'INVALID_VARIANT' using errcode = 'P0001';
        end if;
        v_shortfall := v_shortfall || jsonb_build_object(
          'product_id',    v_line.product_id,
          'variant_id',    v_line.variant_id,
          'product_title', v_line.title,
          'variant_title', v_line.variant_title,
          'requested',     v_line.qty,
          'applied',       0,
          'missing',       v_line.qty,
          'reason',        'INVALID_VARIANT'
        );
        continue;
      end if;

      if v_var_product is distinct from v_line.product_id then
        if p_mode = 'strict' then
          raise exception 'INVALID_VARIANT' using errcode = 'P0001';
        end if;
        v_shortfall := v_shortfall || jsonb_build_object(
          'product_id',    v_line.product_id,
          'variant_id',    v_line.variant_id,
          'product_title', v_line.title,
          'variant_title', v_line.variant_title,
          'requested',     v_line.qty,
          'applied',       0,
          'missing',       v_line.qty,
          'reason',        'INVALID_VARIANT'
        );
        continue;
      end if;

      if not coalesce(v_var_active, false) then
        if p_mode = 'strict' then
          raise exception 'INVALID_VARIANT' using errcode = 'P0001';
        end if;
        v_shortfall := v_shortfall || jsonb_build_object(
          'product_id',    v_line.product_id,
          'variant_id',    v_line.variant_id,
          'product_title', v_line.title,
          'variant_title', v_line.variant_title,
          'requested',     v_line.qty,
          'applied',       0,
          'missing',       v_line.qty,
          'reason',        'INVALID_VARIANT'
        );
        continue;
      end if;
    elsif coalesce(v_has_vars, false) then
      if p_mode = 'strict' then
        raise exception 'VARIANT_REQUIRED' using errcode = 'P0001';
      end if;
      v_shortfall := v_shortfall || jsonb_build_object(
        'product_id',    v_line.product_id,
        'variant_id',    null,
        'product_title', v_line.title,
        'requested',     v_line.qty,
        'applied',       0,
        'missing',       v_line.qty,
        'reason',        'VARIANT_REQUIRED'
      );
      continue;
    end if;

    if v_available >= v_line.qty then
      v_take := v_line.qty;
    elsif p_mode = 'strict' then
      raise exception 'INSUFFICIENT_STOCK: % (available %, requested %)',
        v_label, v_available, v_line.qty
        using errcode = 'P0001';
    else
      v_take := greatest(v_available, 0);
      v_shortfall := v_shortfall || jsonb_build_object(
        'product_id',    v_line.product_id,
        'variant_id',    v_line.variant_id,
        'product_title', v_line.title,
        'variant_title', v_line.variant_title,
        'requested',     v_line.qty,
        'applied',       v_take,
        'missing',       v_line.qty - v_take,
        'reason',        'INSUFFICIENT_STOCK'
      );
    end if;

    if v_take > 0 then
      if v_line.variant_id is not null then
        update public.product_variants
        set stock = stock - v_take, updated_at = now()
        where id = v_line.variant_id;
      else
        update public.products
        set stock = stock - v_take, updated_at = now()
        where id = v_line.product_id
          and user_id = v_order.user_id;
      end if;

      v_applied := v_applied || jsonb_build_object(
        'product_id', v_line.product_id,
        'variant_id', v_line.variant_id,
        'quantity',   v_take
      );
    end if;
  end loop;

  update public.orders
  set stock_applied_at = now(),
      stock_shortfall  = case when v_shortfall = '[]'::jsonb then null else v_shortfall end,
      updated_at       = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'already_applied', false,
    'order_id', p_order_id,
    'applied', v_applied,
    'shortfall', case when v_shortfall = '[]'::jsonb then null else v_shortfall end
  );
end;
$function$;

comment on function public.apply_order_stock(uuid, text) is
  'Commits inventory exactly once at the sellable unit: variant stock when variant_id is set, otherwise parent stock. Service-role only.';

-- ---------------------------------------------------------------------------
-- 5. restore_order_stock — return units to the same sellable unit
-- ---------------------------------------------------------------------------

create or replace function public.restore_order_stock(
  p_order_id uuid,
  p_cancel_order boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order      public.orders%rowtype;
  v_line       record;
  v_missing    integer;
  v_give       integer;
  v_restored   jsonb := '[]'::jsonb;
  v_has_vars   boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  if auth.uid() is not null
     and v_order.user_id <> auth.uid()
     and not public.is_superadmin() then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if v_order.stock_applied_at is null then
    return jsonb_build_object('success', false, 'error', 'STOCK_NOT_APPLIED');
  end if;

  if v_order.stock_restored_at is not null then
    return jsonb_build_object(
      'success', true, 'already_restored', true,
      'order_id', p_order_id, 'stock_restored_at', v_order.stock_restored_at
    );
  end if;

  for v_line in
    select oi.product_id,
           oi.variant_id,
           sum(oi.quantity)::integer as qty,
           min(oi.product_title)     as title
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id nulls first
  loop
    select coalesce(sum((entry->>'missing')::integer), 0) into v_missing
    from jsonb_array_elements(coalesce(v_order.stock_shortfall, '[]'::jsonb)) entry
    where (entry->>'product_id')::uuid = v_line.product_id
      and (
        (
          v_line.variant_id is null
          and nullif(entry->>'variant_id', '') is null
        )
        or (
          nullif(entry->>'variant_id', '')::uuid is not distinct from v_line.variant_id
        )
      );

    v_give := greatest(v_line.qty - v_missing, 0);
    if v_give = 0 then
      continue;
    end if;

    if v_line.variant_id is not null then
      update public.product_variants pv
      set stock = pv.stock + v_give, updated_at = now()
      from public.products p
      where pv.id = v_line.variant_id
        and p.id = pv.product_id
        and p.user_id = v_order.user_id;

      if found then
        v_restored := v_restored || jsonb_build_object(
          'product_id', v_line.product_id,
          'variant_id', v_line.variant_id,
          'quantity',   v_give
        );
      end if;
    else
      select p.has_variants into v_has_vars
      from public.products p
      where p.id = v_line.product_id
        and p.user_id = v_order.user_id;

      -- A null variant_id on a variant product is an old/orphaned line after
      -- SET NULL. Never dump those units onto the parent mirror.
      if coalesce(v_has_vars, false) then
        continue;
      end if;

      update public.products
      set stock = stock + v_give, updated_at = now()
      where id = v_line.product_id
        and user_id = v_order.user_id;

      if found then
        v_restored := v_restored || jsonb_build_object(
          'product_id', v_line.product_id,
          'variant_id', null,
          'quantity',   v_give
        );
      end if;
    end if;
  end loop;

  update public.orders
  set stock_restored_at = now(),
      order_status      = case when p_cancel_order then 'cancelled' else order_status end,
      updated_at        = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'already_restored', false,
    'order_id', p_order_id,
    'order_cancelled', p_cancel_order,
    'restored', v_restored
  );
end;
$function$;

comment on function public.restore_order_stock(uuid, boolean) is
  'Restores deducted units to the same variant or simple product. Exactly once. Authenticated (owner) and service_role.';

-- ---------------------------------------------------------------------------
-- 6. COD + card conversion write the snapshot columns
-- ---------------------------------------------------------------------------

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
  perform public.assert_items_owned_by(p_items, (p_order->>'user_id')::uuid);

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

  perform public.lock_products_for_items(p_items, (p_order->>'user_id')::uuid);

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.order_items (
      order_id, product_id, product_title, product_price, quantity,
      variant_id, variant_title, variant_sku, variant_options
    ) values (
      v_order_id,
      nullif(v_item->>'product_id', '')::uuid,
      coalesce(v_item->>'title', v_item->>'product_title', 'Item'),
      coalesce((v_item->>'price')::numeric, (v_item->>'product_price')::numeric, 0),
      coalesce((v_item->>'quantity')::integer, 1),
      nullif(v_item->>'variant_id', '')::uuid,
      nullif(v_item->>'variant_title', ''),
      nullif(v_item->>'variant_sku', ''),
      case
        when v_item->'variant_options' is null
          or v_item->'variant_options' = 'null'::jsonb
        then null
        else v_item->'variant_options'
      end
    );
  end loop;

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

  PERFORM public.lock_products_for_items(s.items, s.user_id);

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(s.items, '[]'::jsonb))
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_title, product_price, quantity,
      variant_id, variant_title, variant_sku, variant_options
    ) VALUES (
      new_order_id,
      NULLIF(item->>'product_id', '')::uuid,
      COALESCE(item->>'title', item->>'product_title', 'Item'),
      COALESCE((item->>'price')::numeric, (item->>'product_price')::numeric, 0),
      COALESCE((item->>'quantity')::integer, 1),
      NULLIF(item->>'variant_id', '')::uuid,
      NULLIF(item->>'variant_title', ''),
      NULLIF(item->>'variant_sku', ''),
      CASE
        WHEN item->'variant_options' IS NULL
          OR item->'variant_options' = 'null'::jsonb
        THEN NULL
        ELSE item->'variant_options'
      END
    );
  END LOOP;

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

-- ---------------------------------------------------------------------------
-- 7. Privileges (SECURITY DEFINER defaults must not leak to anon)
-- ---------------------------------------------------------------------------

revoke all on function public.assert_items_owned_by(jsonb, uuid) from public;
revoke execute on function public.assert_items_owned_by(jsonb, uuid) from anon, authenticated;
grant  execute on function public.assert_items_owned_by(jsonb, uuid) to service_role;

revoke all on function public.lock_products_for_items(jsonb, uuid) from public;
revoke execute on function public.lock_products_for_items(jsonb, uuid) from anon, authenticated;
grant  execute on function public.lock_products_for_items(jsonb, uuid) to service_role;

revoke all on function public.apply_order_stock(uuid, text) from public;
revoke execute on function public.apply_order_stock(uuid, text) from anon, authenticated;
grant  execute on function public.apply_order_stock(uuid, text) to service_role;

revoke all on function public.create_cod_order(jsonb, jsonb) from public;
revoke execute on function public.create_cod_order(jsonb, jsonb) from anon, authenticated;
grant  execute on function public.create_cod_order(jsonb, jsonb) to service_role;

revoke all on function public.convert_checkout_session_to_order(uuid, text, jsonb) from public;
revoke execute on function public.convert_checkout_session_to_order(uuid, text, jsonb) from anon, authenticated;
grant  execute on function public.convert_checkout_session_to_order(uuid, text, jsonb) to service_role;

revoke all on function public.restore_order_stock(uuid, boolean) from public;
revoke execute on function public.restore_order_stock(uuid, boolean) from anon;
grant  execute on function public.restore_order_stock(uuid, boolean) to authenticated, service_role;
