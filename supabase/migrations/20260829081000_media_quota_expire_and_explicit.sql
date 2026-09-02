-- Prefer explicit media_quota_bytes (including values below START) over the default 2 GiB.
-- Expire stale upload reservations when reading usage so reserved bytes cannot stick forever.

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
  v_explicit_found boolean := false;
  v_best_tier_quota bigint := 2147483648;
  v_best_tier text := 'start';
  v_mapped bigint;
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

    if v_explicit is not null and v_explicit > 0 and not v_explicit_found then
      v_quota := v_explicit;
      v_tier := coalesce(v_row_tier, 'custom');
      v_explicit_found := true;
    end if;

    if v_row_tier in ('growth', 'scale', 'start') then
      v_mapped := public.media_quota_bytes_for_tier(v_row_tier);
      if v_mapped > v_best_tier_quota then
        v_best_tier_quota := v_mapped;
        v_best_tier := v_row_tier;
      elsif v_row_tier = 'start' and v_best_tier_quota = 2147483648 then
        v_best_tier := 'start';
      end if;
    end if;
  end loop;

  if not v_explicit_found then
    v_quota := v_best_tier_quota;
    v_tier := v_best_tier;
  end if;

  return query select v_quota, v_tier;
end;
$$;

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
