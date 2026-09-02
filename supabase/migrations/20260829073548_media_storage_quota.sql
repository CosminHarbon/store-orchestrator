-- SpeedVendors merchant media tracking, atomic quota reservations, and backfill.
-- Canonical tenant is merchant user_id (auth.users). Do not use billing_subscriptions.plan
-- (that column is monthly/yearly interval, not START/GROWTH/SCALE).

-- =============================================================================
-- Constants / quota resolver
-- =============================================================================

create or replace function public.media_quota_bytes_for_tier(p_tier text)
returns bigint
language sql
immutable
as $$
  select case lower(coalesce(p_tier, 'start'))
    when 'growth' then 16106127360::bigint  -- 15 GiB
    when 'scale' then 53687091200::bigint   -- 50 GiB
    else 2147483648::bigint                 -- START 2 GiB
  end;
$$;

comment on function public.media_quota_bytes_for_tier(text) is
  'START=2GiB, GROWTH=15GiB, SCALE=50GiB. Used by media_quota_for_user.';

revoke all on function public.media_quota_bytes_for_tier(text) from public, anon;
grant execute on function public.media_quota_bytes_for_tier(text) to authenticated, service_role;

create or replace function public.media_quota_for_user(p_user_id uuid)
returns table(quota_bytes bigint, tier text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quota bigint := 2147483648;
  v_tier text := 'start';
  r record;
  v_explicit bigint;
  v_row_tier text;
  v_row_quota bigint;
begin
  if p_user_id is null then
    return query select v_quota, v_tier;
    return;
  end if;

  for r in
    select e.metadata
    from public.entitlements e
    where e.user_id = p_user_id
      and e.status = 'active'
      and (e.valid_until is null or e.valid_until > now())
    order by e.created_at desc
  loop
    v_explicit := null;
    v_row_tier := null;
    v_row_quota := null;

    if jsonb_typeof(r.metadata) = 'object' then
      v_row_tier := nullif(lower(r.metadata->>'tier'), '');
      if (r.metadata ? 'media_quota_bytes')
         and jsonb_typeof(r.metadata->'media_quota_bytes') in ('number', 'string')
      then
        begin
          v_explicit := (r.metadata->>'media_quota_bytes')::bigint;
        exception when others then
          v_explicit := null;
        end;
      end if;
    end if;

    if v_explicit is not null and v_explicit > 0 then
      v_row_quota := v_explicit;
      v_row_tier := coalesce(v_row_tier, 'custom');
    elsif v_row_tier in ('growth', 'scale', 'start') then
      v_row_quota := public.media_quota_bytes_for_tier(v_row_tier);
    else
      v_row_quota := public.media_quota_bytes_for_tier('start');
      v_row_tier := coalesce(v_row_tier, 'start');
    end if;

    if v_row_quota > v_quota then
      v_quota := v_row_quota;
      v_tier := v_row_tier;
    elsif v_quota = 2147483648 and v_row_tier is not null then
      v_tier := v_row_tier;
    end if;
  end loop;

  return query select v_quota, v_tier;
end;
$$;

comment on function public.media_quota_for_user(uuid) is
  'Canonical media quota. Explicit metadata.media_quota_bytes wins; else tier start|growth|scale; else START 2GiB.';

revoke all on function public.media_quota_for_user(uuid) from public, anon;
grant execute on function public.media_quota_for_user(uuid) to authenticated, service_role;

-- =============================================================================
-- Tables
-- =============================================================================

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket in ('product-images', 'template-images')),
  storage_path text not null,
  public_url text,
  media_type text not null check (
    media_type in ('product', 'collection', 'logo', 'hero', 'builder', 'unlinked')
  ),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  original_size_bytes bigint check (original_size_bytes is null or original_size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  uploaded_by uuid references auth.users (id) on delete set null,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create index media_assets_user_id_idx on public.media_assets (user_id);
create index media_assets_related_idx
  on public.media_assets (related_entity_type, related_entity_id)
  where related_entity_id is not null;

comment on table public.media_assets is
  'Canonical merchant media. storage_path is the deletion key; public_url is presentation only.';

create trigger media_assets_updated_at
  before update on public.media_assets
  for each row execute function public.update_updated_at_column();

create table public.media_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bytes_used bigint not null default 0 check (bytes_used >= 0),
  bytes_reserved bigint not null default 0 check (bytes_reserved >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.media_usage is
  'Per-merchant tracked media usage. Updated by reservation/finalize/delete RPCs — never SUM(storage.objects).';

create trigger media_usage_updated_at
  before update on public.media_usage
  for each row execute function public.update_updated_at_column();

create table public.media_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expected_size_bytes bigint not null check (expected_size_bytes >= 0),
  bucket text not null check (bucket in ('product-images', 'template-images')),
  storage_path text not null,
  media_type text not null,
  mime_type text not null,
  original_size_bytes bigint,
  width integer,
  height integer,
  related_entity_type text,
  related_entity_id uuid,
  uploaded_by uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index media_upload_reservations_user_idx
  on public.media_upload_reservations (user_id);
create index media_upload_reservations_expires_idx
  on public.media_upload_reservations (expires_at);

comment on table public.media_upload_reservations is
  'Short-lived quota holds (default 15 minutes) so concurrent uploads cannot overshoot.';

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.media_assets enable row level security;
alter table public.media_usage enable row level security;
alter table public.media_upload_reservations enable row level security;

create policy media_assets_select_own
  on public.media_assets for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

create policy media_usage_select_own
  on public.media_usage for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

-- Reservations are service_role / SECURITY DEFINER only.
revoke all on table public.media_assets from public, anon;
revoke all on table public.media_usage from public, anon;
revoke all on table public.media_upload_reservations from public, anon;
grant select on table public.media_assets to authenticated;
grant select on table public.media_usage to authenticated;
grant all on table public.media_assets to service_role;
grant all on table public.media_usage to service_role;
grant all on table public.media_upload_reservations to service_role;

-- RPCs, FK, and backfill: 20260829073600_media_storage_quota_rpcs.sql
