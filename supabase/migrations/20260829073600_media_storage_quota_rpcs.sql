-- SpeedVendors media quota RPCs, product_images FK, current-project backfill.

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
    returning expected_size_bytes
  )
  select coalesce(sum(expected_size_bytes), 0) into v_released from expired;

  if v_released > 0 then
    update public.media_usage
    set bytes_reserved = greatest(0, bytes_reserved - v_released)
    where user_id = p_user_id;
  end if;

  return v_released;
end;
$$;

revoke all on function public.media_expire_reservations_for_user(uuid) from public, anon, authenticated;
grant execute on function public.media_expire_reservations_for_user(uuid) to service_role;

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
  v_max_object constant bigint := 2097152;
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
  if p_bucket not in ('product-images', 'template-images') then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;

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

  if coalesce(v_used, 0) + coalesce(v_reserved, 0) + p_requested_bytes > v_quota then
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
  set bytes_reserved = bytes_reserved + p_requested_bytes
  where user_id = p_user_id;

  insert into public.media_upload_reservations (
    user_id, expected_size_bytes, bucket, storage_path, media_type, mime_type,
    original_size_bytes, width, height, related_entity_type, related_entity_id,
    uploaded_by, expires_at
  ) values (
    p_user_id, p_requested_bytes, p_bucket, p_storage_path, p_media_type, p_mime_type,
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
    'bytes_reserved', coalesce(v_reserved, 0) + p_requested_bytes,
    'expires_at', (now() + interval '15 minutes')
  );
end;
$$;

revoke all on function public.reserve_media_upload(
  uuid, bigint, text, text, text, text, bigint, integer, integer, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.reserve_media_upload(
  uuid, bigint, text, text, text, text, bigint, integer, integer, text, uuid, uuid
) to service_role;

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
  returning id into v_asset_id;

  delete from public.media_upload_reservations where id = r.id;

  update public.media_usage
  set
    bytes_reserved = greatest(0, bytes_reserved - r.expected_size_bytes),
    bytes_used = bytes_used + p_actual_size_bytes
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

revoke all on function public.finalize_media_upload(uuid, bigint, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_media_upload(uuid, bigint, text, text, integer, integer)
  to service_role;

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
  set bytes_reserved = greatest(0, bytes_reserved - r.expected_size_bytes)
  where user_id = r.user_id;

  return jsonb_build_object('ok', true, 'released', true, 'user_id', r.user_id);
end;
$$;

revoke all on function public.release_media_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_media_reservation(uuid) to service_role;

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
  set bytes_used = greatest(0, bytes_used - a.size_bytes)
  where user_id = a.user_id;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'user_id', a.user_id,
    'size_bytes', a.size_bytes,
    'storage_path', a.storage_path,
    'bucket', a.bucket
  );
end;
$$;

revoke all on function public.record_media_deletion(uuid) from public, anon, authenticated;
grant execute on function public.record_media_deletion(uuid) to service_role;

create or replace function public.get_media_usage(p_acting_as uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_quota bigint;
  v_tier text;
  v_used bigint := 0;
  v_reserved bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_user := public.resolve_acting_user_id(p_acting_as);

  select quota_bytes, tier into v_quota, v_tier
  from public.media_quota_for_user(v_user);

  select coalesce(bytes_used, 0), coalesce(bytes_reserved, 0)
    into v_used, v_reserved
  from public.media_usage
  where user_id = v_user;

  return jsonb_build_object(
    'user_id', v_user,
    'bytes_used', v_used,
    'bytes_reserved', v_reserved,
    'quota_bytes', v_quota,
    'tier', v_tier,
    'percent', case when v_quota > 0
      then round((v_used::numeric / v_quota::numeric) * 100, 1)
      else 0 end
  );
end;
$$;

revoke all on function public.get_media_usage(uuid) from public, anon;
grant execute on function public.get_media_usage(uuid) to authenticated, service_role;

delete from public.product_images pi
where not exists (select 1 from public.products p where p.id = pi.product_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_images_product_id_fkey'
  ) then
    alter table public.product_images
      add constraint product_images_product_id_fkey
      foreign key (product_id) references public.products(id) on delete cascade;
  end if;
end;
$$;

insert into public.media_assets (
  user_id, bucket, storage_path, public_url, media_type, mime_type, size_bytes,
  original_size_bytes, related_entity_type, related_entity_id, created_at, updated_at
)
select
  owner_id,
  bucket_id,
  name,
  'https://mkkqbekhvcnwcheegjpy.supabase.co/storage/v1/object/public/'
    || bucket_id || '/' || name,
  media_type,
  mime_type,
  size_bytes,
  size_bytes,
  related_entity_type,
  related_entity_id,
  created_at,
  updated_at
from (
  select
    o.bucket_id,
    o.name,
    o.created_at,
    o.updated_at,
    coalesce((o.metadata->>'size')::bigint, 0) as size_bytes,
    coalesce(nullif(o.metadata->>'mimetype', ''), 'application/octet-stream') as mime_type,
    case
      when o.bucket_id = 'product-images'
           and (storage.foldername(o.name))[1] = 'collections'
           and (storage.foldername(o.name))[2] ~ '^[0-9a-fA-F-]{36}$'
        then (storage.foldername(o.name))[2]::uuid
      when (storage.foldername(o.name))[1] ~ '^[0-9a-fA-F-]{36}$'
        then (storage.foldername(o.name))[1]::uuid
      else null
    end as owner_id,
    case
      when o.bucket_id = 'product-images'
           and (storage.foldername(o.name))[1] = 'collections'
        then 'collection'
      when o.bucket_id = 'product-images'
        then 'product'
      when o.name like '%/logo-%' or o.name like '%/branding/logo/%'
        then 'logo'
      when o.name like '%/hero-%' or o.name like '%/branding/hero/%'
        then 'hero'
      when o.name like '%/builder-%' or o.name like '%/builder/%'
        then 'builder'
      else 'unlinked'
    end as media_type,
    case
      when o.bucket_id = 'product-images'
           and (storage.foldername(o.name))[1] = 'collections'
        then 'collection'
      when o.bucket_id = 'product-images'
           and (storage.foldername(o.name))[2] is not null
        then 'product'
      when o.name like '%/logo-%' or o.name like '%/branding/logo/%'
        then 'logo'
      when o.name like '%/hero-%' or o.name like '%/branding/hero/%'
        then 'hero'
      when o.name like '%/builder-%' or o.name like '%/builder/%'
        then 'builder'
      else null
    end as related_entity_type,
    case
      when o.bucket_id = 'product-images'
           and (storage.foldername(o.name))[1] = 'collections'
           and exists (
             select 1 from public.collections c
             where c.id::text = (storage.foldername(o.name))[3]
           )
        then (storage.foldername(o.name))[3]::uuid
      when o.bucket_id = 'product-images'
           and (storage.foldername(o.name))[1] <> 'collections'
           and exists (
             select 1 from public.products p
             where p.id::text = (storage.foldername(o.name))[2]
           )
        then (storage.foldername(o.name))[2]::uuid
      else null
    end as related_entity_id
  from storage.objects o
  where o.bucket_id in ('product-images', 'template-images')
    and coalesce(o.is_delete_marker, false) = false
    and (storage.foldername(o.name))[1] is not null
) src
where owner_id is not null
  and exists (select 1 from auth.users u where u.id = src.owner_id)
on conflict (bucket, storage_path) do nothing;

insert into public.media_usage (user_id, bytes_used, bytes_reserved)
select user_id, coalesce(sum(size_bytes), 0), 0
from public.media_assets
group by user_id
on conflict (user_id) do update
set bytes_used = excluded.bytes_used;
