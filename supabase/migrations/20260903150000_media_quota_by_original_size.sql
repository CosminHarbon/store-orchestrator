-- Switch media quota accounting from compressed/stored size to original/quota size.
-- New column: quota_size_bytes  = the bytes charged against the merchant's allowance.
-- For normal uploads: quota_size_bytes = original_size_bytes (pre-compression).
-- For AI-generated or legacy files with no original: quota_size_bytes = size_bytes.
-- bytes_used in media_usage now tracks SUM(quota_size_bytes).

-- 1. Add quota_size_bytes to media_assets
alter table public.media_assets
  add column if not exists quota_size_bytes bigint;

-- 2. Backfill: existing rows use COALESCE(original_size_bytes, size_bytes)
--    For legacy files where original_size_bytes is NULL, we use stored size (conservative).
update public.media_assets
set quota_size_bytes = coalesce(original_size_bytes, size_bytes)
where quota_size_bytes is null;

-- 3. Make it NOT NULL with a safe default going forward
alter table public.media_assets
  alter column quota_size_bytes set not null,
  alter column quota_size_bytes set default 0;

alter table public.media_assets
  add constraint media_assets_quota_size_bytes_gte0 check (quota_size_bytes >= 0);

-- 4. Add quota_size_bytes and replacing_asset_id to reservations
alter table public.media_upload_reservations
  add column if not exists quota_size_bytes bigint;

alter table public.media_upload_reservations
  add column if not exists replacing_asset_id uuid;

-- Snapshot of the old asset's quota at reserve time. Used for release/expiry so we
-- never re-read a possibly-changed old row to compute the net reserved amount.
alter table public.media_upload_reservations
  add column if not exists replacement_credit_bytes bigint not null default 0;

-- Exact amount added to media_usage.bytes_reserved for this reservation.
alter table public.media_upload_reservations
  add column if not exists reserved_net_bytes bigint not null default 0;

-- Partial unique index: at most one active reservation can claim a given asset for replacement.
create unique index if not exists media_reservations_replacing_asset_uniq
  on public.media_upload_reservations (replacing_asset_id)
  where replacing_asset_id is not null;

-- 5. Rebuild media_usage.bytes_used from quota_size_bytes
update public.media_usage mu
set bytes_used = coalesce(sub.total, 0)
from (
  select user_id, sum(quota_size_bytes) as total
  from public.media_assets
  where status = 'active'
  group by user_id
) sub
where mu.user_id = sub.user_id;

-- Also zero out any users with no active assets
update public.media_usage
set bytes_used = 0
where user_id not in (select distinct user_id from public.media_assets where status = 'active');

-- ============================================================
-- 6. Rewrite reserve_media_upload to reserve by quota_size_bytes
--    with optional net-quota replacement accounting
-- ============================================================
drop function if exists public.reserve_media_upload(
  uuid, bigint, text, text, text, text, bigint, integer, integer, text, uuid, uuid
);

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
  p_uploaded_by uuid default null,
  p_replacing_asset_id uuid default null
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
  v_quota_size bigint;
  v_replace_credit bigint := 0;
  v_net_reserved bigint;
  v_old_asset public.media_assets%rowtype;
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

  -- Defense-in-depth: reject non-positive or non-integer original_size_bytes at the RPC layer
  if p_original_size_bytes is not null and (p_original_size_bytes < 1 or p_original_size_bytes <> trunc(p_original_size_bytes)) then
    raise exception 'invalid_original_size' using errcode = '22023';
  end if;

  -- quota_size_bytes = the larger of original and compressed, never below what we store.
  v_quota_size := greatest(coalesce(p_original_size_bytes, p_requested_bytes), p_requested_bytes);
  if v_quota_size < 1 then
    v_quota_size := p_requested_bytes;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || p_user_id::text, 0));

  perform public.media_expire_reservations_for_user(p_user_id);

  -- Validate replacement asset if provided
  if p_replacing_asset_id is not null then
    select * into v_old_asset
    from public.media_assets
    where id = p_replacing_asset_id
    for update;  -- row-level lock prevents concurrent replacement claims

    if not found then
      return jsonb_build_object('ok', false, 'error', 'replacing_asset_not_found');
    end if;
    if v_old_asset.user_id <> p_user_id then
      return jsonb_build_object('ok', false, 'error', 'replacing_asset_forbidden');
    end if;
    if v_old_asset.status <> 'active' then
      return jsonb_build_object('ok', false, 'error', 'replacing_asset_not_active');
    end if;
    if v_old_asset.media_type is distinct from p_media_type then
      return jsonb_build_object('ok', false, 'error', 'replacing_asset_type_mismatch');
    end if;

    -- Check that no other reservation is already replacing this asset.
    -- The unique index enforces this, but check explicitly for a clear error.
    if exists (
      select 1 from public.media_upload_reservations
      where replacing_asset_id = p_replacing_asset_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'replacing_asset_already_claimed');
    end if;

    v_replace_credit := v_old_asset.quota_size_bytes;
  end if;

  insert into public.media_usage (user_id, bytes_used, bytes_reserved)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select quota_bytes, tier into v_quota, v_tier
  from public.media_quota_for_user(p_user_id);

  select bytes_used, bytes_reserved into v_used, v_reserved
  from public.media_usage
  where user_id = p_user_id
  for update;

  -- Net quota check: effective_usage = used - replace_credit + reserved + new_quota
  if (coalesce(v_used, 0) - v_replace_credit) + coalesce(v_reserved, 0) + v_quota_size > v_quota then
    return jsonb_build_object(
      'ok', false,
      'error', 'quota_exceeded',
      'quota_bytes', v_quota,
      'tier', v_tier,
      'bytes_used', coalesce(v_used, 0),
      'bytes_reserved', coalesce(v_reserved, 0)
    );
  end if;

  -- Reserve only the net delta (new - old credit), but never negative.
  -- Old asset stays in bytes_used until successful finalize.
  v_net_reserved := greatest(0, v_quota_size - v_replace_credit);

  update public.media_usage
  set bytes_reserved = bytes_reserved + v_net_reserved
  where user_id = p_user_id;

  insert into public.media_upload_reservations (
    user_id, expected_size_bytes, bucket, storage_path, media_type, mime_type,
    original_size_bytes, quota_size_bytes, width, height,
    related_entity_type, related_entity_id,
    uploaded_by, replacing_asset_id, replacement_credit_bytes, reserved_net_bytes,
    expires_at
  ) values (
    p_user_id, p_requested_bytes, p_bucket, p_storage_path, p_media_type, p_mime_type,
    p_original_size_bytes, v_quota_size, p_width, p_height,
    p_related_entity_type, p_related_entity_id,
    p_uploaded_by, p_replacing_asset_id, v_replace_credit, v_net_reserved,
    now() + interval '15 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_id,
    'quota_bytes', v_quota,
    'tier', v_tier,
    'bytes_used', coalesce(v_used, 0),
    'bytes_reserved', coalesce(v_reserved, 0) + v_net_reserved,
    'replacing_asset_id', p_replacing_asset_id,
    'replace_credit', v_replace_credit,
    'expires_at', (now() + interval '15 minutes')
  );
end;
$$;

revoke all on function public.reserve_media_upload(
  uuid, bigint, text, text, text, text, bigint, integer, integer, text, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.reserve_media_upload(
  uuid, bigint, text, text, text, text, bigint, integer, integer, text, uuid, uuid, uuid
) to service_role;

-- ============================================================
-- 7. Rewrite finalize_media_upload to use quota_size_bytes
-- ============================================================
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
  v_quota_size bigint;
  v_reserved_quota bigint;
  v_net_reserved bigint;
  v_additional bigint;
  v_plan_quota bigint;
  v_plan_tier text;
  v_replace_credit bigint := 0;
  v_old_asset public.media_assets%rowtype;
  v_replaced_asset_id uuid;
  v_replaced_bucket text;
  v_replaced_path text;
  v_lock_user uuid;
begin
  if p_reservation_id is null then
    raise exception 'reservation_required' using errcode = '22023';
  end if;
  if p_actual_size_bytes is null or p_actual_size_bytes < 0 then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  select user_id into v_lock_user
  from public.media_upload_reservations
  where id = p_reservation_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_finalized');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || v_lock_user::text, 0));

  select * into r
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found then
    -- Consumed by a concurrent successful finalize. Do not mutate quota again.
    return jsonb_build_object('ok', false, 'error', 'already_finalized');
  end if;

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

  -- 1. Read the reserved quota_size_bytes
  v_reserved_quota := coalesce(r.quota_size_bytes, r.expected_size_bytes);

  -- 2. Final quota must never be less than what is physically stored
  v_quota_size := greatest(v_reserved_quota, p_actual_size_bytes);

  -- Use the credit snapshotted at reserve time for releasing bytes_reserved.
  -- Re-read the live old asset only to deactivate it and compute final bytes_used.
  v_replace_credit := coalesce(r.replacement_credit_bytes, 0);
  v_net_reserved := coalesce(r.reserved_net_bytes, greatest(0, v_reserved_quota - v_replace_credit));

  if r.replacing_asset_id is not null then
    select * into v_old_asset
    from public.media_assets
    where id = r.replacing_asset_id and user_id = r.user_id and status = 'active'
    for update;

    if found then
      -- Live old quota is authoritative for the bytes_used transition.
      v_replace_credit := v_old_asset.quota_size_bytes;
    else
      -- Old asset already gone; do not credit it again. Still release the snapshotted net reserve.
      v_replace_credit := 0;
    end if;
  end if;

  -- 4. Calculate any additional quota needed beyond what was reserved
  v_additional := v_quota_size - v_reserved_quota;

  -- 5. If actual stored size pushed quota above reservation, re-check the plan
  if v_additional > 0 then
    select quota_bytes, tier into v_plan_quota, v_plan_tier
    from public.media_quota_for_user(r.user_id);

    select coalesce(bytes_used, 0), coalesce(bytes_reserved, 0)
      into v_used, v_reserved
    from public.media_usage
    where user_id = r.user_id
    for update;

    -- For replacements: the effective used is (used - replace_credit) since the old
    -- asset will be removed. Check if the additional fits.
    if (coalesce(v_used, 0) - v_replace_credit) + coalesce(v_reserved, 0) + v_additional > v_plan_quota then
      return jsonb_build_object(
        'ok', false,
        'error', 'quota_exceeded',
        'quota_bytes', v_plan_quota,
        'bytes_used', coalesce(v_used, 0),
        'bytes_reserved', coalesce(v_reserved, 0),
        'reserved_quota', v_reserved_quota,
        'actual_size_bytes', p_actual_size_bytes
      );
    end if;
  end if;

  -- 6. All checks passed — insert the new asset
  insert into public.media_assets (
    user_id, bucket, storage_path, public_url, media_type, mime_type, size_bytes,
    original_size_bytes, quota_size_bytes, width, height,
    uploaded_by, related_entity_type, related_entity_id
  ) values (
    r.user_id, r.bucket, r.storage_path, p_public_url, r.media_type,
    coalesce(p_mime_type, r.mime_type), p_actual_size_bytes,
    r.original_size_bytes, v_quota_size,
    coalesce(p_width, r.width), coalesce(p_height, r.height),
    r.uploaded_by, r.related_entity_type, r.related_entity_id
  )
  returning id into v_asset_id;

  -- 7. If replacing, mark old asset for deletion and subtract its quota from used
  v_replaced_asset_id := null;
  v_replaced_bucket := null;
  v_replaced_path := null;
  if r.replacing_asset_id is not null and v_old_asset.id is not null then
    v_replaced_asset_id := v_old_asset.id;
    v_replaced_bucket := v_old_asset.bucket;
    v_replaced_path := v_old_asset.storage_path;

    -- Mark pending_delete only. Preserve historical size metadata for audit/debug.
    -- Quota already left bytes_used via the UPDATE below; inactive statuses are
    -- excluded from merchant quota rebuilds. record_media_deletion only subtracts
    -- when status is still 'active', so cleanup cannot double-subtract.
    update public.media_assets
    set status = 'pending_delete',
        delete_attempted_at = now(),
        updated_at = now()
    where id = v_old_asset.id;
  end if;

  delete from public.media_upload_reservations where id = r.id;

  -- 8. Update media_usage atomically:
  --    - Release the net reserved amount
  --    - Add new quota to used
  --    - Subtract old quota from used (if replacement)
  update public.media_usage
  set
    bytes_reserved = greatest(0, bytes_reserved - v_net_reserved),
    bytes_used = greatest(0, bytes_used + v_quota_size - v_replace_credit)
  where user_id = r.user_id
  returning bytes_used, bytes_reserved into v_used, v_reserved;

  return jsonb_build_object(
    'ok', true,
    'asset_id', v_asset_id,
    'storage_path', r.storage_path,
    'bucket', r.bucket,
    'size_bytes', p_actual_size_bytes,
    'quota_size_bytes', v_quota_size,
    'bytes_used', v_used,
    'bytes_reserved', v_reserved,
    'user_id', r.user_id,
    'media_type', r.media_type,
    'related_entity_type', r.related_entity_type,
    'related_entity_id', r.related_entity_id,
    'replaced_asset_id', v_replaced_asset_id,
    'replaced_bucket', v_replaced_bucket,
    'replaced_storage_path', v_replaced_path
  );
end;
$$;

revoke all on function public.finalize_media_upload(uuid, bigint, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_media_upload(uuid, bigint, text, text, integer, integer)
  to service_role;

-- ============================================================
-- 8. Rewrite record_media_deletion to subtract quota_size_bytes
-- ============================================================
create or replace function public.record_media_deletion(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.media_assets%rowtype;
  v_was_active boolean;
begin
  select * into a from public.media_assets where id = p_asset_id;
  if not found then
    return jsonb_build_object('ok', true, 'deleted', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || a.user_id::text, 0));

  -- Only active assets still count toward merchant quota.
  -- pending_delete / delete_failed rows were already removed from bytes_used
  -- (e.g. by replacement finalize) and must not subtract again.
  v_was_active := a.status = 'active';

  delete from public.media_assets where id = a.id;

  if v_was_active then
    update public.media_usage
    set bytes_used = greatest(0, bytes_used - a.quota_size_bytes)
    where user_id = a.user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'user_id', a.user_id,
    'size_bytes', a.size_bytes,
    'quota_size_bytes', a.quota_size_bytes,
    'was_active', v_was_active,
    'storage_path', a.storage_path,
    'bucket', a.bucket
  );
end;
$$;

revoke all on function public.record_media_deletion(uuid) from public, anon, authenticated;
grant execute on function public.record_media_deletion(uuid) to service_role;

-- ============================================================
-- 9. Rewrite release_media_reservation to release quota_size_bytes
-- ============================================================
create or replace function public.release_media_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.media_upload_reservations%rowtype;
  v_lock_user uuid;
  v_net_reserved bigint;
begin
  select user_id into v_lock_user
  from public.media_upload_reservations
  where id = p_reservation_id;

  if not found then
    return jsonb_build_object('ok', true, 'released', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || v_lock_user::text, 0));

  select * into r
  from public.media_upload_reservations
  where id = p_reservation_id
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'released', false);
  end if;

  v_net_reserved := coalesce(
    r.reserved_net_bytes,
    greatest(0, coalesce(r.quota_size_bytes, r.expected_size_bytes) - coalesce(r.replacement_credit_bytes, 0))
  );

  delete from public.media_upload_reservations where id = r.id;

  if v_net_reserved > 0 then
    update public.media_usage
    set bytes_reserved = greatest(0, bytes_reserved - v_net_reserved)
    where user_id = r.user_id;
  end if;

  return jsonb_build_object('ok', true, 'released', true, 'user_id', r.user_id);
end;
$$;

revoke all on function public.release_media_reservation(uuid) from public, anon, authenticated;
grant execute on function public.release_media_reservation(uuid) to service_role;

-- ============================================================
-- 10. Rewrite media_expire_reservations_for_user to use quota_size_bytes
-- ============================================================
create or replace function public.media_expire_reservations_for_user(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released bigint := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_quota:' || p_user_id::text, 0));

  with expired as (
    delete from public.media_upload_reservations
    where user_id = p_user_id and expires_at < now()
    returning coalesce(
      reserved_net_bytes,
      greatest(0, coalesce(quota_size_bytes, expected_size_bytes) - coalesce(replacement_credit_bytes, 0))
    ) as net_bytes
  )
  select coalesce(sum(net_bytes), 0) into v_released from expired;

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

-- ============================================================
-- 11. Rewrite get_media_usage to return bytes_stored for superadmin
-- ============================================================
create or replace function public.get_media_usage(p_acting_as uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_quota bigint;
  v_tier text;
  v_used bigint := 0;
  v_reserved bigint := 0;
  v_stored bigint := 0;
  v_is_super boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_user := public.resolve_acting_user_id(p_acting_as);

  perform public.media_expire_reservations_for_user(v_user);

  select quota_bytes, tier into v_quota, v_tier
  from public.media_quota_for_user(v_user);

  select coalesce(bytes_used, 0), coalesce(bytes_reserved, 0)
    into v_used, v_reserved
  from public.media_usage
  where user_id = v_user;

  -- Compute known physical stored bytes for superadmin visibility.
  -- Include statuses whose Storage object is still expected to exist.
  select coalesce(sum(size_bytes), 0) into v_stored
  from public.media_assets
  where user_id = v_user
    and status in ('active', 'pending_delete', 'delete_failed');

  -- Check if caller is superadmin
  v_is_super := public.is_superadmin();

  return jsonb_build_object(
    'user_id', v_user,
    'bytes_used', v_used,
    'bytes_reserved', v_reserved,
    'quota_bytes', v_quota,
    'tier', v_tier,
    'percent', case when v_quota > 0
      then round((v_used::numeric / v_quota::numeric) * 100, 1)
      else 0 end,
    'bytes_stored', case when v_is_super or p_acting_as is not null then v_stored else null end
  );
end;
$$;

revoke all on function public.get_media_usage(uuid) from public, anon;
grant execute on function public.get_media_usage(uuid) to authenticated, service_role;
