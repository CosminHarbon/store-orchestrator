-- Phase 4 — option-value → existing product_images mappings.
-- Production must record this file as version 20260826105200.
--
-- Contract:
--   * Mappings are relationships only. Storage objects stay on product_images.
--   * variant_count / price range / parent stock are unchanged.
--   * Archive of an option value keeps mappings (stable IDs).
--   * Deleting a product_images row CASCADE-removes mappings.
--   * Assigned order (position) is independent of product_images.display_order.

-- ---------------------------------------------------------------------------
-- 1. Mapping table
-- ---------------------------------------------------------------------------
create table if not exists public.product_option_value_images (
  option_value_id uuid not null
    references public.product_option_values(id) on delete cascade,
  image_id uuid not null
    references public.product_images(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (option_value_id, image_id),
  constraint product_option_value_images_position_nonneg check (position >= 0)
);

create index if not exists product_option_value_images_image_id_idx
  on public.product_option_value_images (image_id);

create index if not exists product_option_value_images_value_pos_idx
  on public.product_option_value_images (option_value_id, position);

comment on table public.product_option_value_images is
  'Maps an option value (Colour=Black, Material=Leather, …) to existing product_images. Same image may be linked to multiple values. Does not duplicate storage objects.';

create unique index if not exists product_images_id_product_uidx
  on public.product_images (id, product_id);

-- ---------------------------------------------------------------------------
-- 2. Same-product guard (service_role / raw SQL / buggy RPC)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_option_value_image_same_product()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product uuid;
  i_product uuid;
begin
  select o.product_id into v_product
    from public.product_option_values ov
    join public.product_options o on o.id = ov.option_id
   where ov.id = new.option_value_id;

  select product_id into i_product
    from public.product_images
   where id = new.image_id;

  if v_product is null or i_product is null or v_product is distinct from i_product then
    raise exception 'OPTION_VALUE_IMAGE_CROSS_PRODUCT'
      using errcode = '23514',
            hint = 'product_option_value_images cannot map an option value to an image from another product';
  end if;

  return new;
end;
$$;

drop trigger if exists product_option_value_images_same_product
  on public.product_option_value_images;
create trigger product_option_value_images_same_product
before insert or update on public.product_option_value_images
for each row
execute function public.enforce_option_value_image_same_product();

comment on function public.enforce_option_value_image_same_product() is
  'Rejects mappings whose option value and product image belong to different products.';

-- ---------------------------------------------------------------------------
-- 3. Apply mappings from save_product_variants payload (client_id → value id)
-- ---------------------------------------------------------------------------
create or replace function public.apply_option_value_images_from_payload(
  p_product_id uuid,
  p_payload jsonb,
  p_val_map jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opt jsonb;
  v_val jsonb;
  v_client_id text;
  v_value_id uuid;
  v_image_id uuid;
  v_pos integer;
  v_ids uuid[];
  v_owned integer;
begin
  if p_payload is null or p_val_map is null then
    return;
  end if;

  for v_opt in
    select elem from jsonb_array_elements(coalesce(p_payload->'options', '[]'::jsonb)) as elem
  loop
    for v_val in
      select elem from jsonb_array_elements(coalesce(v_opt->'values', '[]'::jsonb)) as elem
    loop
      if not (v_val ? 'image_ids') then
        continue;
      end if;

      v_client_id := coalesce(nullif(v_val->>'client_id', ''), '');
      v_value_id := null;
      if v_client_id <> '' and p_val_map ? v_client_id then
        v_value_id := (p_val_map->>v_client_id)::uuid;
      elsif v_val->>'id' is not null and v_val->>'id' ~ '^[0-9a-fA-F-]{36}$' then
        v_value_id := (v_val->>'id')::uuid;
      end if;

      if v_value_id is null then
        continue;
      end if;

      if not exists (
        select 1
          from public.product_option_values ov
          join public.product_options o on o.id = ov.option_id
         where ov.id = v_value_id
           and o.product_id = p_product_id
      ) then
        raise exception 'OPTION_VALUE_IMAGE_CROSS_PRODUCT'
          using errcode = '23514',
                hint = 'option value does not belong to this product';
      end if;

      v_ids := '{}';
      if coalesce(jsonb_typeof(v_val->'image_ids'), 'null') = 'array' then
        -- First-seen order; duplicate IDs in the payload are ignored.
        select coalesce(array_agg(x::uuid order by ordinality), '{}')
          into v_ids
          from (
            select x, min(ordinality) as ordinality
              from jsonb_array_elements_text(v_val->'image_ids') with ordinality as t(x, ordinality)
             where x ~ '^[0-9a-fA-F-]{36}$'
             group by x
          ) d;
      end if;

      if coalesce(array_length(v_ids, 1), 0) > 0 then
        select count(*)::integer into v_owned
          from public.product_images pi
         where pi.product_id = p_product_id
           and pi.id = any (v_ids);
        if v_owned <> array_length(v_ids, 1) then
          raise exception 'OPTION_VALUE_IMAGE_CROSS_PRODUCT'
            using errcode = '23514',
                  hint = 'every mapped image must belong to the same product';
        end if;
      end if;

      delete from public.product_option_value_images
       where option_value_id = v_value_id;

      v_pos := 0;
      if coalesce(array_length(v_ids, 1), 0) > 0 then
        foreach v_image_id in array v_ids
        loop
          insert into public.product_option_value_images (option_value_id, image_id, position)
          values (v_value_id, v_image_id, v_pos);
          v_pos := v_pos + 1;
        end loop;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.apply_option_value_images_from_payload(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_option_value_images_from_payload(uuid, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.product_option_value_images enable row level security;

drop policy if exists product_option_value_images_merchant_all
  on public.product_option_value_images;
create policy product_option_value_images_merchant_all
  on public.product_option_value_images for all to authenticated
  using (
    exists (
      select 1
        from public.product_option_values ov
        join public.product_options o on o.id = ov.option_id
        join public.products p on p.id = o.product_id
       where ov.id = option_value_id
         and (p.user_id = auth.uid() or public.is_superadmin())
    )
  )
  with check (
    exists (
      select 1
        from public.product_option_values ov
        join public.product_options o on o.id = ov.option_id
        join public.products p on p.id = o.product_id
        join public.product_images pi on pi.id = image_id
       where ov.id = option_value_id
         and pi.product_id = o.product_id
         and (p.user_id = auth.uid() or public.is_superadmin())
    )
  );

revoke all on table public.product_option_value_images from anon, public;
grant select, insert, update, delete on table public.product_option_value_images to authenticated;
revoke truncate, trigger, references on table public.product_option_value_images
  from authenticated, anon, public;
grant select, insert, update, delete on table public.product_option_value_images to service_role;

-- ---------------------------------------------------------------------------
-- 5. Historical order snapshot (optional for current UI; stored for later)
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists image_url text;

comment on column public.order_items.image_url is
  'Display image URL the customer saw for this line. Historical; not re-resolved from today''s mappings.';

-- ---------------------------------------------------------------------------
-- 6. save_product_variants — apply image mappings in the same transaction
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

  perform public.apply_option_value_images_from_payload(p_product_id, p_payload, v_val_map);

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
  'Transactional option/value upsert + cartesian diff + option-value image mappings. Existing option_key rows keep their IDs.';

-- ---------------------------------------------------------------------------
-- 7. Persist display image URL on order lines (historical snapshot)
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
      variant_id, variant_title, variant_sku, variant_options, image_url
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
      end,
      nullif(v_item->>'image_url', '')
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
  p_netopia_payment_id text default null,
  p_provider_response jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.checkout_sessions%rowtype;
  new_order_id uuid;
  existing_tx_id uuid;
  item jsonb;
  v_payment_id text;
  v_stock jsonb;
begin
  perform public.expire_checkout_sessions();

  select * into s
    from public.checkout_sessions
   where id = p_session_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  end if;

  if s.order_id is not null or s.status = 'converted' then
    return jsonb_build_object(
      'success', true,
      'already_converted', true,
      'order_id', s.order_id,
      'checkout_session_id', s.id
    );
  end if;

  if s.status = 'expired' or s.expires_at < now() then
    update public.checkout_sessions
       set status = 'expired', updated_at = now()
     where id = s.id and status = 'pending';

    return jsonb_build_object('success', false, 'error', 'SESSION_EXPIRED');
  end if;

  if s.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'SESSION_CANCELLED');
  end if;

  v_payment_id := coalesce(p_netopia_payment_id, s.netopia_payment_id);

  insert into public.orders (
    user_id, customer_name, customer_email, customer_phone,
    customer_address, customer_city, customer_county, customer_street,
    customer_street_number, customer_block, customer_apartment,
    billing_same_as_delivery, billing_address, billing_city, billing_county,
    billing_street, billing_street_number, billing_block, billing_apartment,
    delivery_type, selected_carrier_code, locker_id, locker_name, locker_address,
    total, payment_status, order_status, shipping_status, checkout_session_id,
    customer_notes, delivery_fee, delivery_distance_km, delivery_pricing_snapshot
  ) values (
    s.user_id, s.customer_name, s.customer_email, s.customer_phone,
    s.customer_address, s.customer_city, s.customer_county, s.customer_street,
    s.customer_street_number, s.customer_block, s.customer_apartment,
    coalesce(s.billing_same_as_delivery, true),
    coalesce(s.billing_address, s.customer_address),
    coalesce(s.billing_city, s.customer_city),
    coalesce(s.billing_county, s.customer_county),
    coalesce(s.billing_street, s.customer_street),
    coalesce(s.billing_street_number, s.customer_street_number),
    coalesce(s.billing_block, s.customer_block),
    coalesce(s.billing_apartment, s.customer_apartment),
    s.delivery_type, s.selected_carrier_code, s.locker_id, s.locker_name, s.locker_address,
    s.total, 'paid', 'paid', 'pending', s.id,
    s.customer_notes, s.shipping_amount, s.delivery_distance_km, s.delivery_pricing_snapshot
  )
  returning id into new_order_id;

  perform public.lock_products_for_items(s.items, s.user_id);

  for item in select * from jsonb_array_elements(coalesce(s.items, '[]'::jsonb))
  loop
    insert into public.order_items (
      order_id, product_id, product_title, product_price, quantity,
      variant_id, variant_title, variant_sku, variant_options, image_url
    ) values (
      new_order_id,
      nullif(item->>'product_id', '')::uuid,
      coalesce(item->>'title', item->>'product_title', 'Item'),
      coalesce((item->>'price')::numeric, (item->>'product_price')::numeric, 0),
      coalesce((item->>'quantity')::integer, 1),
      nullif(item->>'variant_id', '')::uuid,
      nullif(item->>'variant_title', ''),
      nullif(item->>'variant_sku', ''),
      case
        when item->'variant_options' is null
          or item->'variant_options' = 'null'::jsonb
        then null
        else item->'variant_options'
      end,
      nullif(item->>'image_url', '')
    );
  end loop;

  v_stock := public.apply_order_stock(new_order_id, 'lenient');

  select id into existing_tx_id
    from public.payment_transactions
   where checkout_session_id = s.id
   order by created_at desc
   limit 1
   for update;

  if existing_tx_id is not null then
    update public.payment_transactions
       set order_id = new_order_id,
           payment_status = 'completed',
           netopia_payment_id = coalesce(v_payment_id, netopia_payment_id),
           netopia_order_id = coalesce(netopia_order_id, s.id::text),
           provider_response = coalesce(p_provider_response, provider_response),
           updated_at = now()
     where id = existing_tx_id;
  else
    insert into public.payment_transactions (
      user_id, order_id, checkout_session_id, payment_provider, payment_status,
      amount, currency, payment_method, netopia_payment_id, netopia_order_id, provider_response
    ) values (
      s.user_id, new_order_id, s.id, 'netopia', 'completed',
      s.total, 'RON', 'card', v_payment_id, s.id::text, p_provider_response
    );
  end if;

  update public.checkout_sessions
     set status = 'converted',
         payment_status = 'paid',
         order_id = new_order_id,
         netopia_payment_id = coalesce(v_payment_id, netopia_payment_id),
         provider_response = coalesce(p_provider_response, provider_response),
         updated_at = now()
   where id = s.id;

  return jsonb_build_object(
    'success', true, 'already_converted', false,
    'order_id', new_order_id, 'checkout_session_id', s.id,
    'user_id', s.user_id, 'customer_name', s.customer_name, 'total', s.total,
    'stock', v_stock
  );
exception
  when unique_violation then
    select order_id into new_order_id from public.checkout_sessions where id = p_session_id;
    return jsonb_build_object(
      'success', true, 'already_converted', true,
      'order_id', new_order_id, 'checkout_session_id', p_session_id
    );
end;
$function$;
