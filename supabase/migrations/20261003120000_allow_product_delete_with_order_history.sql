-- Allow merchants to delete catalog products that already appear on orders.
--
-- order_items.product_id / variant_id use ON DELETE SET NULL so historical lines
-- keep title/price snapshots. Two things blocked that detach for sold products:
--   1) order_items has no merchant UPDATE RLS policy, so SET NULL failed under RLS
--   2) order_items_guard_stock_applied rejected any change once stock was applied
--
-- Fix: detach order lines in a SECURITY DEFINER BEFORE DELETE on products (bypasses
-- RLS), and teach the immutability guard that nulling product/variant FKs while
-- leaving snapshot fields alone is allowed.

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

  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Partial returns update only returned_quantity via return_order_items().
  if tg_op = 'UPDATE'
     and v_applied is not null
     and v_restored is null
     and new.order_id is not distinct from old.order_id
     and new.product_id is not distinct from old.product_id
     and new.variant_id is not distinct from old.variant_id
     and new.product_title is not distinct from old.product_title
     and new.product_price is not distinct from old.product_price
     and new.quantity is not distinct from old.quantity
     and new.variant_title is not distinct from old.variant_title
     and new.variant_sku is not distinct from old.variant_sku
     and new.variant_options is not distinct from old.variant_options
     and new.image_url is not distinct from old.image_url
     and new.created_at is not distinct from old.created_at
     and new.returned_quantity is distinct from old.returned_quantity
     and new.returned_quantity >= old.returned_quantity
     and new.returned_quantity <= new.quantity
  then
    return new;
  end if;

  -- Catalog delete: detach live product/variant FKs; keep sold snapshots.
  if tg_op = 'UPDATE'
     and v_applied is not null
     and v_restored is null
     and new.order_id is not distinct from old.order_id
     and new.product_title is not distinct from old.product_title
     and new.product_price is not distinct from old.product_price
     and new.quantity is not distinct from old.quantity
     and new.variant_title is not distinct from old.variant_title
     and new.variant_sku is not distinct from old.variant_sku
     and new.variant_options is not distinct from old.variant_options
     and new.image_url is not distinct from old.image_url
     and new.created_at is not distinct from old.created_at
     and new.returned_quantity is not distinct from old.returned_quantity
     and (
       (new.product_id is null and old.product_id is not null)
       or (new.variant_id is null and old.variant_id is not null)
     )
     and (new.product_id is null or new.product_id is not distinct from old.product_id)
     and (new.variant_id is null or new.variant_id is not distinct from old.variant_id)
  then
    return new;
  end if;

  if v_applied is not null and v_restored is null then
    raise exception
      'ORDER_ITEMS_IMMUTABLE: inventory is already committed for order %. Call restore_order_stock() or return_order_items() before changing its lines.',
      v_order_id
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

comment on function public.order_items_guard_stock_applied() is
  'Blocks edits to committed order lines, except returned_quantity increases and detaching product/variant FKs when a catalog product is deleted.';

create or replace function public.products_detach_order_items_before_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Bypass merchant RLS on order_items UPDATE. Snapshots stay on the line.
  update public.order_items oi
     set product_id = null,
         variant_id = null
   where oi.product_id = old.id
      or oi.variant_id in (
           select v.id from public.product_variants v where v.product_id = old.id
         );
  return old;
end;
$$;

comment on function public.products_detach_order_items_before_delete() is
  'Before deleting a product, null order_items.product_id/variant_id so sold history does not block catalog deletes.';

drop trigger if exists products_detach_order_items_before_delete on public.products;
create trigger products_detach_order_items_before_delete
before delete on public.products
for each row
execute function public.products_detach_order_items_before_delete();

revoke all on function public.products_detach_order_items_before_delete() from public, anon, authenticated;
