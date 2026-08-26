-- Phase 0.1 — Order security & tenant integrity.
--
-- Phase 0 made inventory movements exactly-once and transactional, but it still
-- trusted store-api to only ever hand it product ids belonging to the store
-- being checked out. These functions are SECURITY DEFINER, so that trust was
-- the only thing standing between a crafted product_id and another merchant's
-- stock. Ownership is now asserted inside the database as well, so a future bug
-- in an edge function cannot cross a merchant boundary on its own.
--
-- Ownership model: products.user_id = orders.user_id. `user_id` is the store
-- owner everywhere in this schema (products, orders, checkout_sessions,
-- discounts), and store-api resolves it from profiles.store_api_key.
--
-- Also here: a committed order can no longer be deleted while it still holds
-- inventory, which would have destroyed the only record of the deduction.
--
-- Rollback: see the block at the end of this file.

-- ---------------------------------------------------------------------------
-- 1. Ownership assertion for a cart snapshot, used before anything is written.
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
  v_id      uuid;
  v_owned   boolean;
  v_lines   integer;
begin
  if p_user_id is null then
    raise exception 'INVALID_PRODUCT: order has no store owner'
      using errcode = 'P0001';
  end if;

  select count(*) into v_lines
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  if v_lines = 0 then
    raise exception 'INVALID_ITEMS: order has no lines'
      using errcode = 'P0001';
  end if;

  for v_id in
    select distinct nullif(i->>'product_id', '')::uuid
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
  loop
    -- A line that names no product cannot be checked, so it cannot be trusted
    -- to move inventory either.
    if v_id is null then
      raise exception 'INVALID_PRODUCT: order line without a product'
        using errcode = 'P0001';
    end if;

    select exists (
      select 1 from public.products p
      where p.id = v_id and p.user_id = p_user_id
    ) into v_owned;

    -- Deliberately identical for "does not exist" and "belongs to someone
    -- else": callers must not be able to probe foreign catalogues.
    if not v_owned then
      raise exception 'INVALID_PRODUCT: % is not available in this store', v_id
        using errcode = 'P0001';
    end if;
  end loop;
end;
$function$;

comment on function public.assert_items_owned_by(jsonb, uuid) is
  'Raises INVALID_PRODUCT unless every cart line names a product owned by p_user_id. Service-role only.';

-- ---------------------------------------------------------------------------
-- 2. apply_order_stock — same as Phase 0, plus the tenant boundary.
--
--    strict (COD, nothing charged yet): a foreign product aborts the order.
--    lenient (card, already captured): never discard a paid order — deduct
--    nothing for the foreign line and record it on the order so the merchant
--    sees it.
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
  v_owner      uuid;
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
    select p.stock, p.user_id into v_available, v_owner
    from public.products p
    where p.id = v_line.product_id
    for update;

    -- Product deleted after the line was snapshotted: nothing to deduct.
    if not found then
      continue;
    end if;

    -- The tenant boundary, enforced independently of store-api.
    if v_owner is distinct from v_order.user_id then
      if p_mode = 'strict' then
        raise exception 'INVALID_PRODUCT: order % references product % from another store',
          p_order_id, v_line.product_id
          using errcode = 'P0001';
      end if;

      v_shortfall := v_shortfall || jsonb_build_object(
        'product_id',    v_line.product_id,
        'product_title', v_line.title,
        'requested',     v_line.qty,
        'applied',       0,
        'missing',       v_line.qty,
        'reason',        'FOREIGN_PRODUCT'
      );
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
        'missing',       v_line.qty - v_take,
        'reason',        'INSUFFICIENT_STOCK'
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
  'Commits order inventory exactly once, only from products owned by the order''s store. Service-role only.';

-- ---------------------------------------------------------------------------
-- 3. restore_order_stock — inventory can only ever go back to its own store.
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

    -- Mirrors apply_order_stock: nothing was ever taken from another store, so
    -- nothing can be given back to one.
    update public.products
    set stock = stock + v_give, updated_at = now()
    where id = v_line.product_id
      and user_id = v_order.user_id;

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
  'Returns order inventory exactly once, only to products owned by the order''s store. Never called automatically by a refund.';

-- ---------------------------------------------------------------------------
-- 4. COD: reject foreign or product-less lines before an order row exists.
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
  -- Nothing is written until every line is known to belong to this store.
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

-- ---------------------------------------------------------------------------
-- 5. An order holding inventory cannot be deleted.
--
--    The Phase 0 order-line guard allows FK cascades, which meant deleting the
--    order itself still silently consumed the merchant's stock. Restore the
--    stock first (Cancel order & restock), then the order can be deleted.
-- ---------------------------------------------------------------------------

create or replace function public.orders_guard_delete_committed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.stock_applied_at is not null and old.stock_restored_at is null then
    raise exception
      'ORDER_DELETE_BLOCKED: inventory is still committed for order %. Restore its stock before deleting it.',
      old.id
      using errcode = 'P0001';
  end if;

  return old;
end;
$function$;

drop trigger if exists trigger_orders_guard_delete_committed on public.orders;
create trigger trigger_orders_guard_delete_committed
before delete on public.orders
for each row execute function public.orders_guard_delete_committed();

-- ---------------------------------------------------------------------------
-- 6. Privileges, stated explicitly. Supabase grants EXECUTE to anon and
--    authenticated by default, which is how Phase 0 briefly exposed these.
-- ---------------------------------------------------------------------------

revoke all on function public.assert_items_owned_by(jsonb, uuid) from public;
revoke execute on function public.assert_items_owned_by(jsonb, uuid) from anon, authenticated;
grant  execute on function public.assert_items_owned_by(jsonb, uuid) to service_role;

revoke all on function public.orders_guard_delete_committed() from public;
revoke execute on function public.orders_guard_delete_committed() from anon, authenticated;

-- create-or-replace keeps existing ACLs, but never assume: re-assert them.
revoke execute on function public.apply_order_stock(uuid, text) from anon, authenticated;
grant  execute on function public.apply_order_stock(uuid, text) to service_role;

revoke execute on function public.create_cod_order(jsonb, jsonb) from anon, authenticated;
grant  execute on function public.create_cod_order(jsonb, jsonb) to service_role;

revoke execute on function public.restore_order_stock(uuid, boolean) from anon;
grant  execute on function public.restore_order_stock(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rollback path
--
--   drop trigger if exists trigger_orders_guard_delete_committed on public.orders;
--   drop function if exists public.orders_guard_delete_committed();
--   drop function if exists public.assert_items_owned_by(jsonb, uuid);
--   -- then re-run 20260825200000_phase0_inventory_integrity.sql and
--   -- 20260825201000_phase0_lock_products_before_lines.sql to restore the
--   -- Phase 0 bodies of apply_order_stock / restore_order_stock /
--   -- create_cod_order, followed by 20260825202000 for their privileges.
-- ---------------------------------------------------------------------------
