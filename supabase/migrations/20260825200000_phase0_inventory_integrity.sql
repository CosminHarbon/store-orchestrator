-- Phase 0 — Inventory integrity: one authoritative stock path.
--
-- Before this migration four overlapping triggers mutated products.stock:
--   order_items  trigger_update_product_stock            -> update_product_stock()                  (INSERT -, DELETE +, UPDATE delta)
--   order_items  trigger_restore_stock_on_order_cancel   -> restore_product_stock_on_order_cancel()  (DELETE +)
--   orders       trigger_reduce_stock_on_order_paid      -> reduce_stock_on_order_paid()             (-> paid  -)
--   orders       trigger_restore_stock_on_order_cancel   -> restore_stock_on_order_cancel()          (-> cancelled +)
--
-- Consequences that this migration removes:
--   * card orders deducted twice (order_items INSERT, then the same RPC's UPDATE to paid)
--   * COD orders deducted once, so the two payment methods disagreed
--   * deleting an order line restored twice
--   * one path raised on insufficient stock, the other silently allowed negatives
--   * no idempotency, so retried callbacks / repeated "mark paid" deducted again
--
-- After this migration inventory is only ever moved by two explicit functions
-- (apply_order_stock / restore_order_stock), each guarded by a timestamp on
-- orders so a second call is a no-op.
--
-- Historical product stock values are deliberately NOT repaired here. See the
-- Phase 0 report for the reconciliation candidates.
--
-- ROLLBACK PATH (only if the new inventory path has to be abandoned):
--   1. drop trigger trigger_order_items_guard_stock_applied on public.order_items;
--   2. alter table public.products drop constraint products_stock_nonneg;
--   3. restore the previous convert_checkout_session_to_order body from
--      supabase/migrations/20260802110000_checkout_sessions.sql;
--   4. recreate the old triggers/functions from
--      supabase/migrations/20250731173826_*.sql (order_items stock trigger) and
--      supabase/migrations/20251105200120_*.sql (orders status triggers);
--   5. revert store-api to inserting orders + order_items directly.
--   The new columns and functions can be left in place; they are inert unless
--   called. No merchant data needs to be touched to roll back.

-- ---------------------------------------------------------------------------
-- 1. Idempotency + shortfall bookkeeping
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists stock_applied_at  timestamptz,
  add column if not exists stock_restored_at timestamptz,
  add column if not exists stock_shortfall   jsonb;

comment on column public.orders.stock_applied_at is
  'Set once inventory has been committed for this order. Guarantees apply_order_stock() is exactly-once.';
comment on column public.orders.stock_restored_at is
  'Set once inventory has been returned for this order. Guarantees restore_order_stock() is exactly-once.';
comment on column public.orders.stock_shortfall is
  'Populated only when inventory was committed after payment had already been captured and stock was insufficient. Array of { product_id, product_title, requested, applied, missing }.';

create index if not exists orders_stock_shortfall_idx
  on public.orders (created_at desc)
  where stock_shortfall is not null;

-- ---------------------------------------------------------------------------
-- 2. Backfill historical orders so the new path never re-applies them.
--
--    Every order that already has order_items had its stock deducted at least
--    once by the old order_items INSERT trigger, so it counts as applied.
--    Cancelled orders are marked restored because the old orders trigger
--    already returned their stock. Neither statement touches products.stock.
--
--    Restricted to rows created before this migration so re-running it can
--    never mark a genuinely un-applied future order as applied.
-- ---------------------------------------------------------------------------

update public.orders o
set stock_applied_at = coalesce(o.updated_at, o.created_at)
where o.stock_applied_at is null
  and o.created_at < timestamptz '2026-08-25 20:00:00+00'
  and exists (select 1 from public.order_items oi where oi.order_id = o.id);

update public.orders o
set stock_restored_at = coalesce(o.updated_at, o.created_at)
where o.stock_restored_at is null
  and o.created_at < timestamptz '2026-08-25 20:00:00+00'
  and o.order_status = 'cancelled'
  and o.stock_applied_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Remove the overlapping trigger architecture
-- ---------------------------------------------------------------------------

drop trigger if exists trigger_update_product_stock          on public.order_items;
drop trigger if exists trigger_restore_stock_on_order_cancel on public.order_items;
drop trigger if exists trigger_update_stock_on_order         on public.order_items;
drop trigger if exists trigger_reduce_stock_on_order_paid    on public.orders;
drop trigger if exists trigger_restore_stock_on_order_cancel on public.orders;

drop function if exists public.update_product_stock();
drop function if exists public.update_product_stock_on_order();
drop function if exists public.restore_product_stock_on_order_cancel();
drop function if exists public.reduce_stock_on_order_paid();
drop function if exists public.restore_stock_on_order_cancel();

-- ---------------------------------------------------------------------------
-- 4. Negative inventory becomes structurally impossible
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass and conname = 'products_stock_nonneg'
  ) then
    alter table public.products
      add constraint products_stock_nonneg check (stock >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. apply_order_stock — the only way inventory leaves the catalogue
--
--    p_mode = 'strict'  : insufficient stock raises, so the caller's whole
--                         transaction rolls back (nothing has been charged yet).
--    p_mode = 'lenient' : used only after money has been captured. Deducts what
--                         exists, never goes negative, records the shortfall on
--                         the order instead of discarding a paid order.
--
--    Lines are aggregated per product and processed in product_id order so
--    concurrent orders always take row locks in the same sequence.
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
  v_order      public.orders%rowtype;
  v_line       record;
  v_available  integer;
  v_take       integer;
  v_shortfall  jsonb := '[]'::jsonb;
  v_applied    jsonb := '[]'::jsonb;
begin
  if p_mode not in ('strict', 'lenient') then
    raise exception 'apply_order_stock: invalid mode %', p_mode;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  -- Exactly-once: retried callbacks, repeated "mark paid", RPC retries.
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
           sum(oi.quantity)::integer as qty,
           min(oi.product_title)     as title
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
    group by oi.product_id
    order by oi.product_id
  loop
    select p.stock into v_available
    from public.products p
    where p.id = v_line.product_id
    for update;

    -- Product deleted after the line was snapshotted: nothing to deduct.
    if not found then
      continue;
    end if;

    if v_available >= v_line.qty then
      v_take := v_line.qty;
    elsif p_mode = 'strict' then
      raise exception 'INSUFFICIENT_STOCK: % (available %, requested %)',
        v_line.title, v_available, v_line.qty
        using errcode = 'P0001';
    else
      v_take := v_available;
      v_shortfall := v_shortfall || jsonb_build_object(
        'product_id',    v_line.product_id,
        'product_title', v_line.title,
        'requested',     v_line.qty,
        'applied',       v_take,
        'missing',       v_line.qty - v_take
      );
    end if;

    if v_take > 0 then
      update public.products
      set stock = stock - v_take, updated_at = now()
      where id = v_line.product_id;

      v_applied := v_applied || jsonb_build_object(
        'product_id', v_line.product_id, 'quantity', v_take
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
  'Commits order inventory exactly once. Service-role only.';

-- ---------------------------------------------------------------------------
-- 6. restore_order_stock — the only way inventory returns to the catalogue.
--
--    Deliberately explicit: a refund does not imply the goods came back, so
--    nothing calls this automatically. Restores exactly the quantity that was
--    actually deducted (ordered quantity minus any recorded shortfall).
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
  v_order    public.orders%rowtype;
  v_line     record;
  v_missing  integer;
  v_give     integer;
  v_restored jsonb := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  -- Callable from the merchant dashboard, so ownership is enforced here.
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
           sum(oi.quantity)::integer as qty,
           min(oi.product_title)     as title
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
    group by oi.product_id
    order by oi.product_id
  loop
    select coalesce(sum((entry->>'missing')::integer), 0) into v_missing
    from jsonb_array_elements(coalesce(v_order.stock_shortfall, '[]'::jsonb)) entry
    where (entry->>'product_id')::uuid = v_line.product_id;

    v_give := greatest(v_line.qty - v_missing, 0);
    if v_give = 0 then
      continue;
    end if;

    update public.products
    set stock = stock + v_give, updated_at = now()
    where id = v_line.product_id;

    if found then
      v_restored := v_restored || jsonb_build_object(
        'product_id', v_line.product_id, 'quantity', v_give
      );
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
  'Returns order inventory exactly once. Never called automatically by a refund.';

-- ---------------------------------------------------------------------------
-- 7. Order lines are immutable once inventory is committed, so a second
--    inventory system can never appear behind order-line edits.
-- ---------------------------------------------------------------------------

create or replace function public.order_items_guard_stock_applied()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  v_applied  timestamptz;
  v_restored timestamptz;
begin
  v_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;

  select o.stock_applied_at, o.stock_restored_at
    into v_applied, v_restored
  from public.orders o
  where o.id = v_order_id;

  -- Parent order already gone: this is the FK cascade, let it through.
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if v_applied is not null and v_restored is null then
    raise exception
      'ORDER_ITEMS_IMMUTABLE: inventory is already committed for order %. Call restore_order_stock() before changing its lines.',
      v_order_id
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

drop trigger if exists trigger_order_items_guard_stock_applied on public.order_items;
create trigger trigger_order_items_guard_stock_applied
before insert or update or delete on public.order_items
for each row execute function public.order_items_guard_stock_applied();

-- ---------------------------------------------------------------------------
-- 8. COD: order + lines + inventory in a single transaction.
--    Replaces store-api's two sequential inserts, which could leave an order
--    row behind when the line insert failed.
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

comment on function public.create_cod_order(jsonb, jsonb) is
  'Atomically creates a COD order, its lines and its inventory commitment. Service-role only.';

-- ---------------------------------------------------------------------------
-- 9. Card: commit inventory inside the same transaction that finalises the
--    order, and stop relying on an awaiting_payment -> paid status flip.
--    Only the inventory-related section changes; conversion idempotency,
--    payment_transactions upsert and session bookkeeping are preserved.
-- ---------------------------------------------------------------------------

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

  -- Inserted directly in its final state: no status flip, so no trigger can
  -- move inventory behind our back.
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

-- ---------------------------------------------------------------------------
-- 10. Grants. The inventory functions are SECURITY DEFINER, so the implicit
--     EXECUTE-to-PUBLIC grant must be removed.
-- ---------------------------------------------------------------------------

revoke all on function public.apply_order_stock(uuid, text) from public;
revoke all on function public.create_cod_order(jsonb, jsonb) from public;
revoke all on function public.restore_order_stock(uuid, boolean) from public;

grant execute on function public.apply_order_stock(uuid, text)      to service_role;
grant execute on function public.create_cod_order(jsonb, jsonb)     to service_role;
grant execute on function public.restore_order_stock(uuid, boolean) to service_role, authenticated;
