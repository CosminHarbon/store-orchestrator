-- Superadmin-only media storage analytics (original/quota vs physical/compressed).
-- Canonical API field: quota_size_bytes (returned by these RPCs).
-- Does NOT introduce charged_bytes.
--
-- Storage-column compatibility:
--   - Local Track A schema uses media_assets.quota_size_bytes
--   - Production currently has media_assets.charged_bytes (from an earlier remote migration)
--   Reading via to_jsonb lets one migration work on either column without dual-migrating.

-- Return-type change vs existing charged_bytes-based RPCs requires DROP first.
drop function if exists public.admin_media_storage_overview();
drop function if exists public.admin_media_product_storage(uuid);

create or replace function public.admin_media_storage_overview()
returns table (
  store_user_id uuid,
  store_name text,
  email text,
  asset_count bigint,
  quota_size_bytes bigint,
  stored_bytes bigint,
  saved_bytes bigint,
  measured_quota_bytes bigint,
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
    coalesce(agg.quota_sum, 0)::bigint,
    coalesce(agg.stored, 0)::bigint,
    greatest(0, coalesce(agg.quota_sum, 0) - coalesce(agg.stored, 0))::bigint,
    coalesce(agg.m_quota, 0)::bigint,
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
      sum(
        coalesce(
          nullif(to_jsonb(a)->>'quota_size_bytes', '')::bigint,
          nullif(to_jsonb(a)->>'charged_bytes', '')::bigint,
          a.size_bytes
        )
      ) as quota_sum,
      sum(a.size_bytes) as stored,
      sum(
        coalesce(
          nullif(to_jsonb(a)->>'quota_size_bytes', '')::bigint,
          nullif(to_jsonb(a)->>'charged_bytes', '')::bigint,
          a.size_bytes
        )
      ) filter (where a.original_size_bytes is not null) as m_quota,
      sum(a.size_bytes) filter (where a.original_size_bytes is not null) as m_stored,
      count(*) filter (where a.original_size_bytes is null) as legacy_count,
      sum(a.size_bytes) filter (where a.original_size_bytes is null) as legacy_stored
    from public.media_assets a
    where a.status in ('active', 'pending_delete', 'delete_failed')
    group by a.user_id
  ) agg on agg.user_id = p.user_id
  order by coalesce(agg.quota_sum, 0) desc, p.created_at desc;
end;
$$;

revoke all on function public.admin_media_storage_overview() from public, anon;
grant execute on function public.admin_media_storage_overview() to authenticated;

comment on function public.admin_media_storage_overview() is
  'Superadmin (aal2) only. Per-store quota charge (quota_size_bytes API; reads quota_size_bytes or charged_bytes column) vs size_bytes (physical) and compression savings.';

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
  quota_size_bytes bigint,
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
    coalesce(
      nullif(to_jsonb(a)->>'quota_size_bytes', '')::bigint,
      nullif(to_jsonb(a)->>'charged_bytes', '')::bigint,
      a.size_bytes
    )::bigint,
    greatest(
      0,
      coalesce(
        nullif(to_jsonb(a)->>'quota_size_bytes', '')::bigint,
        nullif(to_jsonb(a)->>'charged_bytes', '')::bigint,
        a.size_bytes
      ) - a.size_bytes
    )::bigint,
    a.status,
    a.created_at
  from public.media_assets a
  left join public.products pr
    on pr.id = a.related_entity_id and pr.user_id = a.user_id
  left join public.product_images pi
    on pi.product_id = a.related_entity_id and pi.image_url = a.public_url
  where a.user_id = p_store_user_id
    and a.related_entity_type = 'product'
    and a.status in ('active', 'pending_delete', 'delete_failed')
  order by pr.title nulls last, a.related_entity_id, pi.display_order nulls last, a.created_at;
end;
$$;

revoke all on function public.admin_media_product_storage(uuid) from public, anon;
grant execute on function public.admin_media_product_storage(uuid) to authenticated;

comment on function public.admin_media_product_storage(uuid) is
  'Superadmin (aal2) only. Product-linked media with original/quota vs stored bytes for one store. Returns quota_size_bytes (reads quota_size_bytes or charged_bytes column).';
