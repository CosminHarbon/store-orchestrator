-- Phase 1 — Product options + variants (normalized, merchant-defined names).
--
-- Limits (keep in sync with src/lib/productVariants/limits.ts):
--   max options per product: 3
--   soft warning:            100 combinations
--   hard maximum:            200 combinations
--
-- Existing products stay simple: has_variants defaults to false and we do not
-- fabricate variant rows for them.
--
-- Inventory: this migration does NOT add triggers on order_items / orders.
-- Parent products.stock becomes a compatibility mirror of active variant stock
-- only when has_variants is true. Checkout remains parent-product-based until
-- a later phase; store-api blocks purchase of variant products until then.

-- ---------------------------------------------------------------------------
-- 1. Parent flag
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists has_variants boolean not null default false;

comment on column public.products.has_variants is
  'When true, sellable stock lives on product_variants and products.stock is the sum of active variant stock.';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_options_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists product_options_product_name_uidx
  on public.product_options (product_id, lower(btrim(name)));

create index if not exists product_options_product_id_idx
  on public.product_options (product_id, position);

comment on table public.product_options is
  'Merchant-defined option dimensions (Size, Colour, Storage, …). Names are free text.';
comment on column public.product_options.archived is
  'Soft-removed. Kept so variants that used this option retain stable IDs.';

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.product_options(id) on delete cascade,
  value text not null,
  position integer not null default 0,
  swatch_hex text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_option_values_value_not_blank check (length(btrim(value)) > 0),
  constraint product_option_values_swatch_hex_format check (
    swatch_hex is null or swatch_hex ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create unique index if not exists product_option_values_option_value_uidx
  on public.product_option_values (option_id, lower(btrim(value)));

create index if not exists product_option_values_option_id_idx
  on public.product_option_values (option_id, position);

comment on table public.product_option_values is
  'Values for a product option. swatch_hex is optional and not limited to Colour.';

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  option_key text not null,
  sku text,
  price_override numeric,
  stock integer not null default 0,
  low_stock_threshold integer,
  active boolean not null default true,
  barcode text,
  weight_grams integer,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_stock_nonneg check (stock >= 0),
  constraint product_variants_price_override_nonneg check (
    price_override is null or price_override >= 0
  ),
  constraint product_variants_weight_nonneg check (
    weight_grams is null or weight_grams >= 0
  ),
  constraint product_variants_option_key_not_blank check (length(btrim(option_key)) > 0)
);

create unique index if not exists product_variants_product_option_key_uidx
  on public.product_variants (product_id, option_key);

create unique index if not exists product_variants_product_sku_uidx
  on public.product_variants (product_id, sku)
  where sku is not null and btrim(sku) <> '';

create index if not exists product_variants_product_id_idx
  on public.product_variants (product_id, position);

comment on column public.product_variants.option_key is
  'Deterministic combination identity: option_id:value_id pairs sorted by option_id, joined with |. Stable across adding/removing other values.';
comment on column public.product_variants.price_override is
  'NULL means inherit products.price. Never duplicate the base price into every row.';

create table if not exists public.product_variant_values (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  option_id uuid not null references public.product_options(id) on delete cascade,
  option_value_id uuid not null references public.product_option_values(id) on delete cascade,
  primary key (variant_id, option_id)
);

create index if not exists product_variant_values_value_id_idx
  on public.product_variant_values (option_value_id);

comment on table public.product_variant_values is
  'Normalized mapping of a variant to one value per option. Display names are derived, not stored as the identity.';

-- ---------------------------------------------------------------------------
-- 3. updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists update_product_options_updated_at on public.product_options;
create trigger update_product_options_updated_at
before update on public.product_options
for each row execute function public.update_updated_at_column();

drop trigger if exists update_product_variants_updated_at on public.product_variants;
create trigger update_product_variants_updated_at
before update on public.product_variants
for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Parent stock mirror (variants only — not order_items)
-- ---------------------------------------------------------------------------
create or replace function public.sync_parent_stock_from_variants()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_product_id uuid;
begin
  v_product_id := coalesce(new.product_id, old.product_id);
  update public.products p
  set stock = coalesce((
        select sum(v.stock)::integer
        from public.product_variants v
        where v.product_id = v_product_id
          and v.active
      ), 0),
      updated_at = now()
  where p.id = v_product_id
    and p.has_variants;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists product_variants_sync_parent_stock on public.product_variants;
create trigger product_variants_sync_parent_stock
after insert or update of stock, active or delete
on public.product_variants
for each row execute function public.sync_parent_stock_from_variants();

revoke all on function public.sync_parent_stock_from_variants() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Limits + cartesian expansion
-- ---------------------------------------------------------------------------
create or replace function public.product_variant_limits()
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'max_options', 3,
    'soft_warning', 100,
    'hard_maximum', 200
  );
$$;

comment on function public.product_variant_limits() is
  'Keep in sync with src/lib/productVariants/limits.ts';

create or replace function public.expand_product_variant_combinations(p_product_id uuid)
returns table (
  option_key text,
  value_ids uuid[],
  option_ids uuid[],
  sort_position integer
)
language sql
stable
set search_path to 'public'
as $function$
  with recursive opts as (
    select
      o.id,
      o.position,
      row_number() over (order by o.position, o.id) as ord
    from public.product_options o
    where o.product_id = p_product_id
      and not o.archived
      and exists (
        select 1
        from public.product_option_values v
        where v.option_id = o.id
          and not v.archived
      )
  ),
  vals as (
    select ov.option_id, ov.id as value_id, ov.position
    from public.product_option_values ov
    join opts o on o.id = ov.option_id
    where not ov.archived
  ),
  cart as (
    select
      o.ord,
      array[v.value_id]::uuid[] as value_ids,
      array[o.id]::uuid[] as option_ids,
      array[v.position]::integer[] as pos_parts
    from opts o
    join vals v on v.option_id = o.id
    where o.ord = 1

    union all

    select
      o.ord,
      c.value_ids || v.value_id,
      c.option_ids || o.id,
      c.pos_parts || v.position
    from cart c
    join opts o on o.ord = c.ord + 1
    join vals v on v.option_id = o.id
  ),
  ranked as (
    select
      (
        select string_agg(p.option_id::text || ':' || p.value_id::text, '|' order by p.option_id::text)
        from unnest(c.option_ids, c.value_ids) as p(option_id, value_id)
      ) as option_key,
      c.value_ids,
      c.option_ids,
      c.pos_parts
    from cart c
    where c.ord = (select max(ord) from opts)
  )
  select
    r.option_key,
    r.value_ids,
    r.option_ids,
    (row_number() over (
      order by r.pos_parts[1] nulls first,
               r.pos_parts[2] nulls first,
               r.pos_parts[3] nulls first,
               r.option_key
    ) - 1)::integer as sort_position
  from ranked r;
$function$;

revoke all on function public.expand_product_variant_combinations(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. save_product_variants
-- ---------------------------------------------------------------------------
create or replace function public.save_product_variants(
  p_product_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_product public.products%rowtype;
  v_limits jsonb := public.product_variant_limits();
  v_max_options integer := (v_limits->>'max_options')::integer;
  v_hard_max integer := (v_limits->>'hard_maximum')::integer;
  v_has_variants boolean;
  v_missing_action text;
  v_opt jsonb;
  v_val jsonb;
  v_name text;
  v_value text;
  v_client_id text;
  v_id uuid;
  v_option_id uuid;
  v_pos integer;
  v_opt_map jsonb := '{}'::jsonb;
  v_val_map jsonb := '{}'::jsonb;
  v_keep_options uuid[] := '{}';
  v_keep_values uuid[] := '{}';
  v_delete_value_ids uuid[] := '{}';
  v_combo_count integer := 1;
  v_expr text := '';
  v_count integer;
  v_seen text;
  v_combo record;
  v_variant_id uuid;
  v_i integer;
  v_payload_variant jsonb;
  v_client_ids text[];
  v_mapped uuid[];
  v_key text;
  v_stock integer;
  v_price numeric;
  v_sku text;
  v_active boolean;
  v_parent_stock integer;
  v_created integer := 0;
  v_deactivated integer := 0;
  v_deleted integer := 0;
  v_name_key text;
begin
  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'PRODUCT_NOT_FOUND', 'message', 'Product not found');
  end if;

  if auth.uid() is not null
     and v_product.user_id <> auth.uid()
     and not public.is_superadmin() then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED', 'message', 'Not authorized');
  end if;

  v_has_variants := coalesce((p_payload->>'has_variants')::boolean, false);
  v_missing_action := coalesce(nullif(p_payload->>'missing_action', ''), 'deactivate');
  if v_missing_action not in ('deactivate', 'delete') then
    v_missing_action := 'deactivate';
  end if;

  if coalesce(p_payload->'permanently_remove_value_ids', '[]'::jsonb) <> '[]'::jsonb then
    select coalesce(array_agg((x)::uuid), '{}') into v_delete_value_ids
    from jsonb_array_elements_text(p_payload->'permanently_remove_value_ids') as x
    where x ~ '^[0-9a-fA-F-]{36}$';
  end if;

  if not v_has_variants then
    update public.products
    set has_variants = false, updated_at = now()
    where id = p_product_id;
    return jsonb_build_object(
      'ok', true,
      'has_variants', false,
      'parent_stock', v_product.stock
    );
  end if;

  -- Unique option names in the payload (case/whitespace insensitive).
  v_seen := '';
  v_pos := 0;
  for v_opt in
    select elem from jsonb_array_elements(coalesce(p_payload->'options', '[]'::jsonb)) as elem
  loop
    v_name := btrim(coalesce(v_opt->>'name', ''));
    if v_name = '' then
      continue;
    end if;
    v_pos := v_pos + 1;
    v_name_key := lower(regexp_replace(v_name, '\s+', ' ', 'g'));
    if position('|' || v_name_key || '|' in v_seen) > 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'DUPLICATE_OPTION',
        'message', format('Option names must be unique. “%s” is duplicated.', v_name)
      );
    end if;
    v_seen := v_seen || '|' || v_name_key || '|';
  end loop;

  if v_pos > v_max_options then
    return jsonb_build_object(
      'ok', false,
      'error', 'TOO_MANY_OPTIONS',
      'message', format('A product can have at most %s options.', v_max_options)
    );
  end if;

  -- Combination cap from payload value counts (options with at least one value).
  v_combo_count := 1;
  v_expr := '';
  v_pos := 0;
  for v_opt in
    select elem from jsonb_array_elements(coalesce(p_payload->'options', '[]'::jsonb)) as elem
  loop
    v_name := btrim(coalesce(v_opt->>'name', ''));
    if v_name = '' then
      continue;
    end if;
    select count(*)::integer into v_count
    from jsonb_array_elements(coalesce(v_opt->'values', '[]'::jsonb)) val
    where length(btrim(coalesce(val->>'value', ''))) > 0;
    if v_count = 0 then
      continue;
    end if;
    v_pos := v_pos + 1;
    v_combo_count := v_combo_count * v_count;
    v_expr := case when v_expr = '' then v_count::text else v_expr || ' × ' || v_count::text end;
  end loop;
  if v_pos = 0 then
    v_combo_count := 0;
    v_expr := '0';
  end if;

  if v_combo_count > v_hard_max then
    return jsonb_build_object(
      'ok', false,
      'error', 'LIMIT_EXCEEDED',
      'expression', v_expr,
      'count', v_combo_count,
      'maximum', v_hard_max,
      'message', format(
        '%s = %s combinations%sMaximum allowed: %s',
        v_expr, v_combo_count, E'\n\n', v_hard_max
      )
    );
  end if;

  -- Upsert options and values. Reuse archived rows with the same name so IDs
  -- (and therefore option_key) stay stable if a merchant removes then re-adds.
  v_pos := -1;
  for v_opt in
    select elem from jsonb_array_elements(coalesce(p_payload->'options', '[]'::jsonb)) as elem
  loop
    v_name := btrim(coalesce(v_opt->>'name', ''));
    if v_name = '' then
      continue;
    end if;
    v_pos := v_pos + 1;
    v_client_id := coalesce(nullif(v_opt->>'client_id', ''), gen_random_uuid()::text);
    v_id := null;

    if v_opt->>'id' is not null and v_opt->>'id' ~ '^[0-9a-fA-F-]{36}$' then
      select id into v_id
      from public.product_options
      where id = (v_opt->>'id')::uuid
        and product_id = p_product_id;
      if v_id is null then
        return jsonb_build_object('ok', false, 'error', 'INVALID_OPTION', 'message', 'Option does not belong to this product');
      end if;
    end if;

    if v_id is null then
      select id into v_id
      from public.product_options
      where product_id = p_product_id
        and lower(btrim(name)) = lower(v_name)
      limit 1;
    end if;

    if v_id is not null then
      update public.product_options
      set name = v_name, position = v_pos, archived = false, updated_at = now()
      where id = v_id;
    else
      insert into public.product_options (product_id, name, position, archived)
      values (p_product_id, v_name, v_pos, false)
      returning id into v_id;
    end if;

    v_opt_map := v_opt_map || jsonb_build_object(v_client_id, v_id);
    v_keep_options := array_append(v_keep_options, v_id);
    v_option_id := v_id;

    for v_val in
      select elem from jsonb_array_elements(coalesce(v_opt->'values', '[]'::jsonb)) as elem
    loop
      v_value := btrim(coalesce(v_val->>'value', ''));
      if v_value = '' then
        continue;
      end if;
      v_client_id := coalesce(nullif(v_val->>'client_id', ''), gen_random_uuid()::text);
      v_id := null;

      if v_val->>'id' is not null and v_val->>'id' ~ '^[0-9a-fA-F-]{36}$' then
        select ov.id into v_id
        from public.product_option_values ov
        where ov.id = (v_val->>'id')::uuid
          and ov.option_id = v_option_id;
        if v_id is null then
          return jsonb_build_object('ok', false, 'error', 'INVALID_VALUE', 'message', 'Option value does not belong to this option');
        end if;
      end if;

      if v_id is null then
        select ov.id into v_id
        from public.product_option_values ov
        where ov.option_id = v_option_id
          and lower(btrim(ov.value)) = lower(v_value)
        limit 1;
      end if;

      if v_id is not null then
        update public.product_option_values
        set value = v_value,
            position = coalesce((v_val->>'position')::integer, 0),
            swatch_hex = nullif(v_val->>'swatch_hex', ''),
            archived = false
        where id = v_id;
      else
        insert into public.product_option_values (option_id, value, position, swatch_hex, archived)
        values (
          v_option_id,
          v_value,
          coalesce((v_val->>'position')::integer, 0),
          nullif(v_val->>'swatch_hex', ''),
          false
        )
        returning id into v_id;
      end if;

      v_val_map := v_val_map || jsonb_build_object(v_client_id, v_id);
      v_keep_values := array_append(v_keep_values, v_id);
    end loop;
  end loop;

  -- Permanent deletes first, so the cartesian no longer includes those values.
  if coalesce(array_length(v_delete_value_ids, 1), 0) > 0 then
    delete from public.product_variants v
    where v.product_id = p_product_id
      and exists (
        select 1
        from public.product_variant_values vv
        where vv.variant_id = v.id
          and vv.option_value_id = any (v_delete_value_ids)
      );
    get diagnostics v_deleted = row_count;

    delete from public.product_option_values ov
    using public.product_options o
    where ov.id = any (v_delete_value_ids)
      and ov.option_id = o.id
      and o.product_id = p_product_id;
  end if;

  if v_missing_action = 'delete' then
    delete from public.product_variants v
    where v.product_id = p_product_id
      and exists (
        select 1
        from public.product_variant_values vv
        join public.product_option_values ov on ov.id = vv.option_value_id
        where vv.variant_id = v.id
          and (
            (coalesce(array_length(v_keep_values, 1), 0) = 0)
            or ov.id <> all (v_keep_values)
          )
      );
    get diagnostics v_i = row_count;
    v_deleted := v_deleted + v_i;

    delete from public.product_option_values ov
    using public.product_options o
    where ov.option_id = o.id
      and o.product_id = p_product_id
      and (
        coalesce(array_length(v_keep_values, 1), 0) = 0
        or ov.id <> all (v_keep_values)
      );

    delete from public.product_options o
    where o.product_id = p_product_id
      and (
        coalesce(array_length(v_keep_options, 1), 0) = 0
        or o.id <> all (v_keep_options)
      );
  else
    update public.product_option_values ov
    set archived = true
    from public.product_options o
    where ov.option_id = o.id
      and o.product_id = p_product_id
      and not ov.archived
      and (
        coalesce(array_length(v_keep_values, 1), 0) = 0
        or ov.id <> all (v_keep_values)
      );

    update public.product_options o
    set archived = true, updated_at = now()
    where o.product_id = p_product_id
      and not o.archived
      and (
        coalesce(array_length(v_keep_options, 1), 0) = 0
        or o.id <> all (v_keep_options)
      );
  end if;

  -- Insert missing combinations. Existing rows keep their id / stock / sku / flags.
  for v_combo in
    select * from public.expand_product_variant_combinations(p_product_id)
  loop
    insert into public.product_variants (product_id, option_key, stock, active, position)
    values (p_product_id, v_combo.option_key, 0, true, v_combo.sort_position)
    on conflict (product_id, option_key) do update
      set position = excluded.position
    returning id into v_variant_id;

    insert into public.product_variant_values (variant_id, option_id, option_value_id)
    select v_variant_id, v_combo.option_ids[i], v_combo.value_ids[i]
    from generate_subscripts(v_combo.value_ids, 1) as i
    on conflict (variant_id, option_id) do update
      set option_value_id = excluded.option_value_id;
  end loop;

  select count(*)::integer into v_created
  from public.product_variants v
  where v.product_id = p_product_id
    and v.created_at > now() - interval '2 seconds'
    and v.option_key in (
      select e.option_key from public.expand_product_variant_combinations(p_product_id) e
    );

  -- Deactivate (default) or delete combinations that are no longer in the cartesian.
  if v_missing_action = 'delete' then
    delete from public.product_variants v
    where v.product_id = p_product_id
      and v.option_key not in (
        select e.option_key from public.expand_product_variant_combinations(p_product_id) e
      );
    get diagnostics v_i = row_count;
    v_deleted := v_deleted + v_i;
  else
    update public.product_variants v
    set active = false, updated_at = now()
    where v.product_id = p_product_id
      and v.active
      and v.option_key not in (
        select e.option_key from public.expand_product_variant_combinations(p_product_id) e
      );
    get diagnostics v_deactivated = row_count;
  end if;

  -- Apply edited fields from the payload, matched after mapping client value ids.
  for v_payload_variant in
    select elem from jsonb_array_elements(coalesce(p_payload->'variants', '[]'::jsonb)) as elem
  loop
    select coalesce(array_agg(x), '{}') into v_client_ids
    from jsonb_array_elements_text(coalesce(v_payload_variant->'client_value_ids', '[]'::jsonb)) as x;

    if coalesce(array_length(v_client_ids, 1), 0) = 0 then
      continue;
    end if;

    v_mapped := '{}';
    begin
      select array_agg((v_val_map->>cid)::uuid) into v_mapped
      from unnest(v_client_ids) as cid;
    exception when others then
      continue;
    end;

    if v_mapped is null or exists (select 1 from unnest(v_mapped) x where x is null) then
      continue;
    end if;

    select string_agg(p.option_id::text || ':' || p.value_id::text, '|' order by p.option_id::text)
      into v_key
    from (
      select ov.option_id, ov.id as value_id
      from public.product_option_values ov
      where ov.id = any (v_mapped)
    ) p;

    if v_key is null then
      continue;
    end if;

    v_stock := coalesce((v_payload_variant->>'stock')::integer, 0);
    if v_stock < 0 then v_stock := 0; end if;

    if v_payload_variant->'price_override' is null
       or v_payload_variant->'price_override' = 'null'::jsonb
       or coalesce(v_payload_variant->>'price_override', '') = '' then
      v_price := null;
    else
      v_price := (v_payload_variant->>'price_override')::numeric;
      if v_price < 0 then v_price := 0; end if;
    end if;

    v_sku := nullif(btrim(coalesce(v_payload_variant->>'sku', '')), '');
    v_active := coalesce((v_payload_variant->>'active')::boolean, true);

    update public.product_variants
    set sku = v_sku,
        price_override = v_price,
        stock = v_stock,
        active = v_active,
        updated_at = now()
    where product_id = p_product_id
      and option_key = v_key;
  end loop;

  -- Re-number live combinations in cartesian order.
  update public.product_variants v
  set position = e.sort_position
  from public.expand_product_variant_combinations(p_product_id) e
  where v.product_id = p_product_id
    and v.option_key = e.option_key;

  select coalesce(sum(v.stock) filter (where v.active), 0)::integer
    into v_parent_stock
  from public.product_variants v
  where v.product_id = p_product_id;

  update public.products
  set has_variants = true,
      stock = v_parent_stock,
      updated_at = now()
  where id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'has_variants', true,
    'parent_stock', v_parent_stock,
    'created_count', v_created,
    'deactivated_count', v_deactivated,
    'deleted_count', v_deleted
  );
end;
$function$;

comment on function public.save_product_variants(uuid, jsonb) is
  'Transactional option/value upsert + cartesian diff. Existing option_key rows keep their IDs.';

revoke all on function public.save_product_variants(uuid, jsonb) from public, anon;
grant execute on function public.save_product_variants(uuid, jsonb) to authenticated, service_role;

revoke all on function public.product_variant_limits() from public, anon;
grant execute on function public.product_variant_limits() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. RLS helpers + policies
-- ---------------------------------------------------------------------------
create or replace function public.merchant_owns_product(p_product_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and (p.user_id = auth.uid() or public.is_superadmin())
  );
$$;

create or replace function public.merchant_owns_product_option(p_option_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.product_options o
    join public.products p on p.id = o.product_id
    where o.id = p_option_id
      and (p.user_id = auth.uid() or public.is_superadmin())
  );
$$;

create or replace function public.merchant_owns_product_variant(p_variant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = p_variant_id
      and (p.user_id = auth.uid() or public.is_superadmin())
  );
$$;

revoke all on function public.merchant_owns_product(uuid) from public, anon;
revoke all on function public.merchant_owns_product_option(uuid) from public, anon;
revoke all on function public.merchant_owns_product_variant(uuid) from public, anon;
grant execute on function public.merchant_owns_product(uuid) to authenticated;
grant execute on function public.merchant_owns_product_option(uuid) to authenticated;
grant execute on function public.merchant_owns_product_variant(uuid) to authenticated;

alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_values enable row level security;

drop policy if exists product_options_merchant_all on public.product_options;
create policy product_options_merchant_all
  on public.product_options for all to authenticated
  using (public.merchant_owns_product(product_id))
  with check (public.merchant_owns_product(product_id));

drop policy if exists product_option_values_merchant_all on public.product_option_values;
create policy product_option_values_merchant_all
  on public.product_option_values for all to authenticated
  using (public.merchant_owns_product_option(option_id))
  with check (public.merchant_owns_product_option(option_id));

drop policy if exists product_variants_merchant_all on public.product_variants;
create policy product_variants_merchant_all
  on public.product_variants for all to authenticated
  using (public.merchant_owns_product(product_id))
  with check (public.merchant_owns_product(product_id));

drop policy if exists product_variant_values_merchant_all on public.product_variant_values;
create policy product_variant_values_merchant_all
  on public.product_variant_values for all to authenticated
  using (public.merchant_owns_product_variant(variant_id))
  with check (public.merchant_owns_product_variant(variant_id));

revoke all on table public.product_options from anon, public;
revoke all on table public.product_option_values from anon, public;
revoke all on table public.product_variants from anon, public;
revoke all on table public.product_variant_values from anon, public;

grant select, insert, update, delete on table public.product_options to authenticated;
grant select, insert, update, delete on table public.product_option_values to authenticated;
grant select, insert, update, delete on table public.product_variants to authenticated;
grant select, insert, update, delete on table public.product_variant_values to authenticated;

revoke truncate, trigger, references on table public.product_options from authenticated, anon, public;
revoke truncate, trigger, references on table public.product_option_values from authenticated, anon, public;
revoke truncate, trigger, references on table public.product_variants from authenticated, anon, public;
revoke truncate, trigger, references on table public.product_variant_values from authenticated, anon, public;

grant select, insert, update, delete on table public.product_options to service_role;
grant select, insert, update, delete on table public.product_option_values to service_role;
grant select, insert, update, delete on table public.product_variants to service_role;
grant select, insert, update, delete on table public.product_variant_values to service_role;

-- ---------------------------------------------------------------------------
-- 8. Stats view (list price range + variant count)
-- ---------------------------------------------------------------------------
create or replace view public.product_variant_stats
with (security_invoker = true) as
select
  p.id as product_id,
  p.has_variants,
  count(v.id)::integer as variant_count,
  count(v.id) filter (where v.active)::integer as active_variant_count,
  coalesce(sum(v.stock) filter (where v.active), 0)::integer as active_stock,
  min(coalesce(v.price_override, p.price)) filter (where v.active) as min_price,
  max(coalesce(v.price_override, p.price)) filter (where v.active) as max_price
from public.products p
left join public.product_variants v on v.product_id = p.id
group by p.id, p.has_variants;

revoke all on public.product_variant_stats from anon, public;
grant select on public.product_variant_stats to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. bulk_update_stock — do not clobber the variant mirror
-- ---------------------------------------------------------------------------
create or replace function public.bulk_update_stock(updates jsonb)
returns table(
  product_id uuid,
  old_stock integer,
  new_stock integer,
  success boolean,
  error_message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_record jsonb;
  current_stock integer;
  new_stock_value integer;
  product_uuid uuid;
  v_has_variants boolean;
begin
  for update_record in select * from jsonb_array_elements(updates)
  loop
    begin
      product_uuid := (update_record->>'product_id')::uuid;
      new_stock_value := (update_record->>'stock')::integer;

      select stock, has_variants into current_stock, v_has_variants
      from public.products
      where id = product_uuid;

      if current_stock is null then
        return query select
          product_uuid, null::integer, null::integer, false, 'Product not found'::text;
        continue;
      end if;

      if coalesce(v_has_variants, false) then
        return query select
          product_uuid,
          current_stock,
          current_stock,
          false,
          'Stock for variant products is managed per variant'::text;
        continue;
      end if;

      update public.products
      set stock = new_stock_value, updated_at = now()
      where id = product_uuid;

      return query select
        product_uuid, current_stock, new_stock_value, true, null::text;

    exception when others then
      return query select
        product_uuid, current_stock, null::integer, false, sqlerrm::text;
    end;
  end loop;
end;
$$;
