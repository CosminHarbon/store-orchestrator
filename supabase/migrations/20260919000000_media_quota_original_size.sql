-- Merchant media quota is charged on the ORIGINAL file size the merchant selected
-- (captured in the browser before compression). Only the compressed file is stored.
--
--   media_assets.size_bytes           = physical bytes in Storage (compressed)   [PRIVATE]
--   media_assets.original_size_bytes = size of the picked File pre-compression  [NULL = unknown/legacy]
--   media_assets.charged_bytes       = quota charge = greatest(coalesce(original, size), size)
--
-- charged_bytes never drops below the stored size, so a client that under-reports
-- original_size_bytes can at worst be charged what it physically stores (the previous behaviour).
-- Legacy rows without a known original are charged their stored size (documented fallback).
-- media_usage.bytes_used / bytes_reserved are now sums of charged_bytes.

-- =============================================================================
-- Columns
-- =============================================================================

alter table public.media_upload_reservations
  add column if not exists charged_bytes bigint;

update public.media_upload_reservations
set charged_bytes = greatest(coalesce(original_size_bytes, expected_size_bytes), expected_size_bytes)
where charged_bytes is null;

alter table public.media_upload_reservations
  alter column charged_bytes set not null;

alter table public.media_upload_reservations
  drop constraint if exists media_upload_reservations_charged_check;
alter table public.media_upload_reservations
  add constraint media_upload_reservations_charged_check check (charged_bytes >= 0);

alter table public.media_assets
  add column if not exists charged_bytes bigint
  generated always as (greatest(coalesce(original_size_bytes, size_bytes), size_bytes)) stored;

comment on column public.media_assets.size_bytes is
  'PRIVATE (superadmin only). Physical bytes of the compressed object in Storage.';
comment on column public.media_assets.original_size_bytes is
  'Size of the file the merchant selected, captured client-side before compression. NULL = unknown (legacy backfill).';
comment on column public.media_assets.charged_bytes is
  'Merchant quota charge: greatest(coalesce(original_size_bytes, size_bytes), size_bytes).';
comment on column public.media_upload_reservations.charged_bytes is
  'Quota bytes held for this reservation (original-size based). expected_size_bytes stays the physical size limit.';
comment on column public.media_usage.bytes_used is
  'Sum of media_assets.charged_bytes (original-size based). Recomputable via media_recompute_usage().';

-- The initial backfill copied the stored size into original_size_bytes for rows it created
-- (uploaded_by IS NULL). That original was never known; clear it so analytics do not report
-- fabricated 0% savings. Quota is unchanged (charged_bytes falls back to size_bytes).
update public.media_assets
set original_size_bytes = null
where uploaded_by is null
  and original_size_bytes is not distinct from size_bytes;

-- =============================================================================
-- Private columns: merchants must not read physical/compression data via PostgREST
-- =============================================================================

-- Supabase default ACLs give `authenticated` ALL privileges on every new public table, which the
-- original media migration never revoked. Every media_assets write goes through the Edge Function
-- (service_role) or SECURITY DEFINER RPCs, so merchants keep only column-level SELECT (RLS still
-- limits rows to their own). The only client read is VisualEditor's template-image library:
-- select id, public_url, storage_path, media_type, created_at, status
-- where user_id = ? and bucket = ? and status = ?  (filter columns need SELECT too).
revoke all on table public.media_assets from authenticated;
revoke all on table public.media_assets from anon;
grant select (
  id, user_id, bucket, storage_path, public_url, media_type, status, created_at
) on table public.media_assets to authenticated;

-- media_usage is only read through get_media_usage() (SECURITY DEFINER) and media_upload_reservations
-- is only touched by the Edge Function (service_role) and definer RPCs, so neither needs any direct
-- anon/authenticated access. RLS (and the dormant media_usage_select_own policy) stays as is.
revoke all on table public.media_usage from authenticated, anon;
revoke all on table public.media_upload_reservations from authenticated, anon;

-- =============================================================================
-- Reservation / finalize / release / delete: charge original size
-- =============================================================================

create or replace function public.media_expire_reservations_for_user(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released bigint := 0;
begin
  with expired as (
    delete from public.media_upload_reservations
    where user_id = p_user_id and expires_at < now()
    returning charged_bytes
  )
  select coalesce(sum(charged_bytes), 0) into v_released from expired;

  if v_released > 0 then
    update public.media_usage
    set bytes_reserved = greatest(0, bytes_reserved - v_released)
    where user_id = p_user_id;
  end if;

  return v_released;
end;
$$;

create or replace function public.reserve_media_upload(
  p_user_id uuid,
  p_requested_bytes bigint,
  p_bucket text,
  p_storage_path text,
  p_media_type text,
  p_mime_type text,
  p_original_size_bytes bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_uploaded_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota bigint;
  v_tier text;
  v_used bigint;
  v_reserved bigint;
  v_id uuid;
  v_charged bigint;
  v_max_object constant bigint := 2097152;
  v_max_original constant bigint := 10485760;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;
  if p_requested_bytes is null or p_requested_bytes < 1 then
    raise exception 'invalid_size' using errcode = '22023';
  end if;
  if p_requested_bytes > v_max_object then
    raise exception 'object_too_large' using errcode = '22023';
  end if;
  if p_original_size_bytes is not null
     and (p_original_size_bytes < 1 or p_original_size_bytes > v_max_original) then
    raise exception 'invalid_original_size' using errcode = '22023';
  end if;
  if p_bucket not in ('product-images', 'template-images') then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;

  -- Quota is charged on the original size; never less than what is physically stored.
  v_charged := greatest(coalesce(p_original_size_bytes, p_requested_bytes), p_requested_bytes);

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || p_user_id::text, 0));

  perform public.media_expire_reservations_for_user(p_user_id);

  insert into public.media_usage (user_id, bytes_used, bytes_reserved)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select quota_bytes, tier into v_quota, v_tier
  from public.media_quota_for_user(p_user_id);

  select bytes_used, bytes_reserved into v_used, v_reserved
  from public.media_usage
  where user_id = p_user_id
  for update;

  if coalesce(v_used, 0) + coalesce(v_reserved, 0) + v_charged > v_quota then
    return jsonb_build_object(
      'ok', false,
      'error', 'quota_exceeded',
      'quota_bytes', v_quota,
      'tier', v_tier,
      'bytes_used', coalesce(v_used, 0),
      'bytes_reserved', coalesce(v_reserved, 0)
    );
  end if;

  update public.media_usage
  set bytes_reserved = bytes_reserved + v_charged
  where user_id = p_user_id;

  insert into public.media_upload_reservations (
    user_id, expected_size_bytes, charged_bytes, bucket, storage_path, media_type, mime_type,
    original_size_bytes, width, height, related_entity_type, related_entity_id,
    uploaded_by, expires_at
  ) values (
    p_user_id, p_requested_bytes, v_charged, p_bucket, p_storage_path, p_media_type, p_mime_type,
    p_original_size_bytes, p_width, p_height, p_related_entity_type, p_related_entity_id,
    p_uploaded_by, now() + interval '15 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_id,
    'quota_bytes', v_quota,
    'tier', v_tier,
    'bytes_used', coalesce(v_used, 0),
    'bytes_reserved', coalesce(v_reserved, 0) + v_charged,
    'expires_at', (now() + interval '15 minutes')
  );
end;
$$;

create or replace function public.finalize_media_upload(
  p_reservation_id uuid,
  p_actual_size_bytes bigint,
  p_mime_type text default null,
  p_public_url text default null,
  p_width integer default null,
  p_height integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.media_upload_reservations%rowtype;
  v_asset_id uuid;
  v_charged bigint;
  v_used bigint;
  v_reserved bigint;
begin
  if p_reservation_id is null then
    raise exception 'reservation_required' using errcode = '22023';
  end if;
  if p_actual_size_bytes is null or p_actual_size_bytes < 0 then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  select * into r
  from public.media_upload_reservations
  where id = p_reservation_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'reservation_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || r.user_id::text, 0));

  if r.expires_at < now() then
    perform public.media_expire_reservations_for_user(r.user_id);
    return jsonb_build_object('ok', false, 'error', 'reservation_expired');
  end if;

  if p_actual_size_bytes > r.expected_size_bytes then
    return jsonb_build_object(
      'ok', false,
      'error', 'size_exceeds_reservation',
      'expected_size_bytes', r.expected_size_bytes,
      'actual_size_bytes', p_actual_size_bytes
    );
  end if;

  insert into public.media_assets (
    user_id, bucket, storage_path, public_url, media_type, mime_type, size_bytes,
    original_size_bytes, width, height, uploaded_by, related_entity_type, related_entity_id
  ) values (
    r.user_id, r.bucket, r.storage_path, p_public_url, r.media_type,
    coalesce(p_mime_type, r.mime_type), p_actual_size_bytes,
    r.original_size_bytes, coalesce(p_width, r.width), coalesce(p_height, r.height),
    r.uploaded_by, r.related_entity_type, r.related_entity_id
  )
  returning id, charged_bytes into v_asset_id, v_charged;

  delete from public.media_upload_reservations where id = r.id;

  update public.media_usage
  set
    bytes_reserved = greatest(0, bytes_reserved - r.charged_bytes),
    bytes_used = bytes_used + v_charged
  where user_id = r.user_id
  returning bytes_used, bytes_reserved into v_used, v_reserved;

  return jsonb_build_object(
    'ok', true,
    'asset_id', v_asset_id,
    'storage_path', r.storage_path,
    'bucket', r.bucket,
    'size_bytes', p_actual_size_bytes,
    'bytes_used', v_used,
    'bytes_reserved', v_reserved,
    'user_id', r.user_id,
    'media_type', r.media_type,
    'related_entity_type', r.related_entity_type,
    'related_entity_id', r.related_entity_id
  );
end;
$$;

create or replace function public.release_media_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.media_upload_reservations%rowtype;
begin
  select * into r from public.media_upload_reservations where id = p_reservation_id;
  if not found then
    return jsonb_build_object('ok', true, 'released', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || r.user_id::text, 0));

  delete from public.media_upload_reservations where id = r.id;

  update public.media_usage
  set bytes_reserved = greatest(0, bytes_reserved - r.charged_bytes)
  where user_id = r.user_id;

  return jsonb_build_object('ok', true, 'released', true, 'user_id', r.user_id);
end;
$$;

create or replace function public.record_media_deletion(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.media_assets%rowtype;
begin
  select * into a from public.media_assets where id = p_asset_id;
  if not found then
    return jsonb_build_object('ok', true, 'deleted', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || a.user_id::text, 0));

  delete from public.media_assets where id = a.id;

  update public.media_usage
  set bytes_used = greatest(0, bytes_used - a.charged_bytes)
  where user_id = a.user_id;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'user_id', a.user_id,
    'storage_path', a.storage_path,
    'bucket', a.bucket
  );
end;
$$;

-- Same signatures as before, so CREATE OR REPLACE keeps their ACLs. Re-assert them explicitly anyway:
-- these are service-only and must never be executable by PUBLIC, anon or authenticated,
-- whatever Supabase's default function ACLs (anon/authenticated/service_role EXECUTE) say.
revoke all on function public.media_expire_reservations_for_user(uuid) from public, anon, authenticated;
grant execute on function public.media_expire_reservations_for_user(uuid) to service_role;

revoke all on function public.reserve_media_upload(
  uuid, bigint, text, text, text, text, bigint, integer, integer, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.reserve_media_upload(
  uuid, bigint, text, text, text, text, bigint, integer, integer, text, uuid, uuid
) to service_role;

revoke all on function public.finalize_media_upload(uuid, bigint, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_media_upload(uuid, bigint, text, text, integer, integer)
  to service_role;

revoke all on function public.release_media_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_media_reservation(uuid) to service_role;

revoke all on function public.record_media_deletion(uuid) from public, anon, authenticated;
grant execute on function public.record_media_deletion(uuid) to service_role;

-- =============================================================================
-- Derive-and-repair: media_usage counters can always be rebuilt from media_assets
-- =============================================================================

create or replace function public.media_recompute_usage(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_used bigint;
  v_after_used bigint;
  v_after_reserved bigint;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || p_user_id::text, 0));
  perform public.media_expire_reservations_for_user(p_user_id);

  insert into public.media_usage (user_id, bytes_used, bytes_reserved)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select bytes_used into v_before_used from public.media_usage where user_id = p_user_id;

  update public.media_usage
  set
    bytes_used = coalesce((select sum(a.charged_bytes) from public.media_assets a where a.user_id = p_user_id), 0),
    bytes_reserved = coalesce((select sum(r.charged_bytes) from public.media_upload_reservations r where r.user_id = p_user_id), 0)
  where user_id = p_user_id
  returning bytes_used, bytes_reserved into v_after_used, v_after_reserved;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'bytes_used_before', v_before_used,
    'bytes_used', v_after_used,
    'bytes_reserved', v_after_reserved
  );
end;
$$;

revoke all on function public.media_recompute_usage(uuid) from public, anon, authenticated;
grant execute on function public.media_recompute_usage(uuid) to service_role;

-- Re-base every merchant counter on original-size charges.
select public.media_recompute_usage(u.user_id)
from (
  select user_id from public.media_usage
  union
  select user_id from public.media_assets
) u;

-- =============================================================================
-- Superadmin-only analytics (physical storage + compression savings)
-- =============================================================================

create or replace function public.admin_media_storage_overview()
returns table (
  store_user_id uuid,
  store_name text,
  email text,
  asset_count bigint,
  charged_bytes bigint,
  stored_bytes bigint,
  saved_bytes bigint,
  measured_charged_bytes bigint,
  measured_stored_bytes bigint,
  legacy_asset_count bigint,
  legacy_stored_bytes bigint,
  counter_bytes_used bigint,
  quota_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    p.user_id,
    p.store_name,
    u.email::text,
    coalesce(agg.asset_count, 0)::bigint,
    coalesce(agg.charged, 0)::bigint,
    coalesce(agg.stored, 0)::bigint,
    (coalesce(agg.charged, 0) - coalesce(agg.stored, 0))::bigint,
    coalesce(agg.m_charged, 0)::bigint,
    coalesce(agg.m_stored, 0)::bigint,
    coalesce(agg.legacy_count, 0)::bigint,
    coalesce(agg.legacy_stored, 0)::bigint,
    coalesce(mu.bytes_used, 0)::bigint,
    (select q.quota_bytes from public.media_quota_for_user(p.user_id) q)::bigint
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.media_usage mu on mu.user_id = p.user_id
  left join (
    select
      a.user_id,
      count(*) as asset_count,
      sum(a.charged_bytes) as charged,
      sum(a.size_bytes) as stored,
      sum(a.charged_bytes) filter (where a.original_size_bytes is not null) as m_charged,
      sum(a.size_bytes) filter (where a.original_size_bytes is not null) as m_stored,
      count(*) filter (where a.original_size_bytes is null) as legacy_count,
      sum(a.size_bytes) filter (where a.original_size_bytes is null) as legacy_stored
    from public.media_assets a
    group by a.user_id
  ) agg on agg.user_id = p.user_id
  order by coalesce(agg.charged, 0) desc, p.created_at desc;
end;
$$;

revoke all on function public.admin_media_storage_overview() from public, anon;
grant execute on function public.admin_media_storage_overview() to authenticated;

create or replace function public.admin_media_product_storage(p_store_user_id uuid)
returns table (
  product_id uuid,
  product_title text,
  asset_id uuid,
  product_image_id uuid,
  public_url text,
  is_primary boolean,
  display_order integer,
  mime_type text,
  width integer,
  height integer,
  original_size_bytes bigint,
  stored_size_bytes bigint,
  charged_bytes bigint,
  saved_bytes bigint,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_store_user_id is null then
    raise exception 'store_required' using errcode = '22023';
  end if;

  return query
  select
    a.related_entity_id,
    pr.title::text,
    a.id,
    pi.id,
    a.public_url,
    pi.is_primary,
    pi.display_order,
    a.mime_type,
    a.width,
    a.height,
    a.original_size_bytes,
    a.size_bytes,
    a.charged_bytes,
    (a.charged_bytes - a.size_bytes)::bigint,
    a.status,
    a.created_at
  from public.media_assets a
  left join public.products pr
    on pr.id = a.related_entity_id and pr.user_id = a.user_id
  left join public.product_images pi
    on pi.product_id = a.related_entity_id and pi.image_url = a.public_url
  where a.user_id = p_store_user_id
    and a.related_entity_type = 'product'
  order by pr.title nulls last, a.related_entity_id, pi.display_order nulls last, a.created_at;
end;
$$;

revoke all on function public.admin_media_product_storage(uuid) from public, anon;
grant execute on function public.admin_media_product_storage(uuid) to authenticated;
