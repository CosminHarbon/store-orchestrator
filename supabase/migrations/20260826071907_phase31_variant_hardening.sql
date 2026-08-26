-- Phase 3.1 — variant relational integrity + query indexes.
-- Production recorded this file as version 20260826071907. Keep that version.
--
-- Catalogue aggregate contract (enforced in store-api, mirrored here for operators):
--   variant_count  = active variants
--   parent stock   = sum of active variant stock (sync_parent_stock_from_variants)
--   price range    = active variants, including out-of-stock
-- Inactive combinations are omitted from count, parent stock, and price range.
--
-- SKU contract (unchanged): product_variants_product_sku_uidx is UNIQUE (product_id, sku)
-- where sku is present. Duplicate SKUs ARE allowed across different products in the
-- same store. Parent products.sku remains unique per merchant.

-- ---------------------------------------------------------------------------
-- 1. option_value.option_id must match product_variant_values.option_id
-- ---------------------------------------------------------------------------
create unique index if not exists product_option_values_id_option_uidx
  on public.product_option_values (id, option_id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'product_variant_values_option_value_option_fk'
  ) then
    alter table public.product_variant_values
      add constraint product_variant_values_option_value_option_fk
      foreign key (option_value_id, option_id)
      references public.product_option_values (id, option_id)
      on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. variant, option, and mapping must share the same product
-- ---------------------------------------------------------------------------
create or replace function public.enforce_product_variant_value_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product uuid;
  o_product uuid;
begin
  select product_id into v_product
    from public.product_variants
   where id = new.variant_id;

  select product_id into o_product
    from public.product_options
   where id = new.option_id;

  if v_product is null or o_product is null or v_product is distinct from o_product then
    raise exception 'VARIANT_OPTION_CROSS_PRODUCT'
      using errcode = '23514',
            hint = 'product_variant_values cannot map a variant to an option from another product';
  end if;

  return new;
end;
$$;

drop trigger if exists product_variant_values_same_product on public.product_variant_values;
create trigger product_variant_values_same_product
before insert or update on public.product_variant_values
for each row
execute function public.enforce_product_variant_value_ownership();

comment on function public.enforce_product_variant_value_ownership() is
  'Rejects product_variant_values rows whose variant and option belong to different products. Complements the composite FK that keeps option_id aligned with option_value.option_id.';

-- ---------------------------------------------------------------------------
-- 3. Indexes used by storefront variant bundle loads
-- ---------------------------------------------------------------------------
create index if not exists product_variants_product_active_idx
  on public.product_variants (product_id)
  where active;

create index if not exists product_variant_values_variant_id_idx
  on public.product_variant_values (variant_id);
