-- SpeedVendors SaaS billing (merchant → platform), separate from Netopia / Stripe Connect.
-- BILLING ENFORCEMENT remains OFF (billing_settings.enforcement_enabled = false).
--
-- Stripe API note (Basil 2025-03-31+): current_period_start/end live on subscription
-- items, not the Subscription object. Edge sync code must normalize from items.
-- This migration stores the normalized period columns only.

-- =============================================================================
-- billing_settings — singleton feature flags / policy
-- =============================================================================

create table public.billing_settings (
  id integer primary key default 1 check (id = 1),
  enforcement_enabled boolean not null default false,
  grace_period_days integer not null default 7 check (grace_period_days >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.billing_settings is
  'Platform SaaS billing flags. enforcement_enabled must stay false until Stripe test matrix passes.';

insert into public.billing_settings (id, enforcement_enabled, grace_period_days)
values (1, false, 7);

alter table public.billing_settings enable row level security;

-- Authenticated users may read the flag (needed for client gate UX).
create policy billing_settings_select_authenticated
  on public.billing_settings
  for select
  to authenticated
  using (true);

revoke all on table public.billing_settings from public, anon;
grant select on table public.billing_settings to authenticated;
grant all on table public.billing_settings to service_role;

-- =============================================================================
-- billing_customers — one Stripe Customer per SpeedVendors user
-- =============================================================================

create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_customers_user_id_idx on public.billing_customers (user_id);

comment on table public.billing_customers is
  'Stripe Customer mapping for SpeedVendors SaaS billing. Written only by Edge (service_role).';

alter table public.billing_customers enable row level security;

create policy billing_customers_select_own
  on public.billing_customers
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

revoke all on table public.billing_customers from public, anon;
grant select on table public.billing_customers to authenticated;
grant all on table public.billing_customers to service_role;

create trigger billing_customers_updated_at
  before update on public.billing_customers
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- billing_subscriptions — full history; at most one open sub per user
-- =============================================================================

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  billing_customer_id uuid not null references public.billing_customers (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  stripe_product_id text,
  plan text check (plan is null or plan in ('monthly', 'yearly')),
  billing_interval text check (billing_interval is null or billing_interval in ('month', 'year')),
  status text not null
    check (status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  -- Deterministic 7-day grace after failed renewal (not indefinite past_due access).
  grace_until timestamptz,
  latest_invoice_id text,
  livemode boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);

create index billing_subscriptions_status_idx
  on public.billing_subscriptions (status);

-- Prevent two simultaneous open subscriptions for the same merchant while
-- retaining canceled / incomplete_expired history rows.
create unique index billing_subscriptions_one_open_per_user_uidx
  on public.billing_subscriptions (user_id)
  where status not in ('canceled', 'incomplete_expired');

create index billing_subscriptions_grace_until_idx
  on public.billing_subscriptions (grace_until)
  where grace_until is not null;

comment on table public.billing_subscriptions is
  'Synced Stripe Billing subscriptions for SpeedVendors SaaS. History retained; open statuses unique per user.';

alter table public.billing_subscriptions enable row level security;

create policy billing_subscriptions_select_own
  on public.billing_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

revoke all on table public.billing_subscriptions from public, anon;
grant select on table public.billing_subscriptions to authenticated;
grant all on table public.billing_subscriptions to service_role;

create trigger billing_subscriptions_updated_at
  before update on public.billing_subscriptions
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- entitlements — provider-agnostic access layer (history allowed)
-- =============================================================================

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null
    check (source in ('stripe', 'access_code', 'manual', 'superadmin', 'apple_iap', 'google_play')),
  status text not null
    check (status in ('active', 'expired', 'revoked')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  -- Links to stripe_subscription_id, access_code_redemption id, etc. Null only for rare cases.
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_valid_range check (
    valid_until is null or valid_until > valid_from
  )
);

create index entitlements_user_id_idx on public.entitlements (user_id);
create index entitlements_user_active_idx
  on public.entitlements (user_id)
  where status = 'active';

-- One logical entitlement row per source object (idempotent webhook / redemption upserts).
-- Historical status changes update the same row; different source_ref values keep history.
create unique index entitlements_source_ref_uidx
  on public.entitlements (source, source_ref)
  where source_ref is not null;

comment on table public.entitlements is
  'SpeedVendors access grants. Access = any active, in-window entitlement OR superadmin role.';

alter table public.entitlements enable row level security;

create policy entitlements_select_own
  on public.entitlements
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

revoke all on table public.entitlements from public, anon;
grant select on table public.entitlements to authenticated;
grant all on table public.entitlements to service_role;

create trigger entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- access_codes / redemptions
-- =============================================================================

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_prefix text not null,
  label text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  -- null = permanent access after redemption
  access_duration_days integer check (access_duration_days is null or access_duration_days > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint access_codes_redemption_bounds check (
    max_redemptions is null or redemption_count <= max_redemptions
  )
);

create index access_codes_active_idx on public.access_codes (active);

comment on table public.access_codes is
  'Hashed SpeedVendors access codes. Plaintext shown once at generation; never stored.';

alter table public.access_codes enable row level security;

-- No authenticated SELECT of hashes. Superadmin lists via SECURITY DEFINER RPC / Edge.
revoke all on table public.access_codes from public, anon, authenticated;
grant all on table public.access_codes to service_role;

create trigger access_codes_updated_at
  before update on public.access_codes
  for each row execute function public.update_updated_at_column();

create table public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.access_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  entitlement_id uuid references public.entitlements (id) on delete set null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (code_id, user_id)
);

create index access_code_redemptions_user_id_idx
  on public.access_code_redemptions (user_id);

create index access_code_redemptions_code_id_idx
  on public.access_code_redemptions (code_id);

comment on table public.access_code_redemptions is
  'Audit log of access-code redemptions. One redemption per user per code.';

alter table public.access_code_redemptions enable row level security;

create policy access_code_redemptions_select_own
  on public.access_code_redemptions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

revoke all on table public.access_code_redemptions from public, anon;
grant select on table public.access_code_redemptions to authenticated;
grant all on table public.access_code_redemptions to service_role;

-- =============================================================================
-- stripe_billing_webhook_events — Billing-only idempotency (not Connect)
-- Status flow: received → processing → processed | failed
-- Do NOT mark processed before DB work completes.
-- =============================================================================

create table public.stripe_billing_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  payload_digest text,
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stripe_billing_webhook_events_status_idx
  on public.stripe_billing_webhook_events (status);

comment on table public.stripe_billing_webhook_events is
  'Idempotency + processing state for SpeedVendors SaaS Stripe Billing webhooks only.';

alter table public.stripe_billing_webhook_events enable row level security;

revoke all on table public.stripe_billing_webhook_events from public, anon, authenticated;
grant all on table public.stripe_billing_webhook_events to service_role;

create trigger stripe_billing_webhook_events_updated_at
  before update on public.stripe_billing_webhook_events
  for each row execute function public.update_updated_at_column();

-- Claim or re-claim a webhook event for processing. Safe under Stripe retries.
-- Already-processed events return status processed without claiming.
create or replace function public.claim_stripe_billing_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload_digest text default null,
  p_stale_after_seconds integer default 300
)
returns public.stripe_billing_webhook_events
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.stripe_billing_webhook_events;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id required';
  end if;

  insert into public.stripe_billing_webhook_events as e (
    stripe_event_id,
    event_type,
    status,
    attempt_count,
    payload_digest,
    processing_started_at,
    updated_at
  )
  values (
    p_event_id,
    coalesce(p_event_type, 'unknown'),
    'processing',
    1,
    p_payload_digest,
    now(),
    now()
  )
  on conflict (stripe_event_id) do update
    set
      status = case
        when e.status = 'processed' then e.status
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - make_interval(secs => greatest(p_stale_after_seconds, 30))
          then e.status
        else 'processing'
      end,
      attempt_count = case
        when e.status = 'processed' then e.attempt_count
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - make_interval(secs => greatest(p_stale_after_seconds, 30))
          then e.attempt_count
        else e.attempt_count + 1
      end,
      processing_started_at = case
        when e.status = 'processed' then e.processing_started_at
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - make_interval(secs => greatest(p_stale_after_seconds, 30))
          then e.processing_started_at
        else now()
      end,
      event_type = coalesce(nullif(p_event_type, ''), e.event_type),
      payload_digest = coalesce(p_payload_digest, e.payload_digest),
      last_error = case
        when e.status = 'processed' then e.last_error
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - make_interval(secs => greatest(p_stale_after_seconds, 30))
          then e.last_error
        else null
      end,
      updated_at = now()
  returning * into r;

  return r;
end;
$$;

revoke all on function public.claim_stripe_billing_webhook_event(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_billing_webhook_event(text, text, text, integer)
  to service_role;

create or replace function public.complete_stripe_billing_webhook_event(
  p_event_id text,
  p_ok boolean,
  p_error text default null
)
returns public.stripe_billing_webhook_events
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.stripe_billing_webhook_events;
begin
  update public.stripe_billing_webhook_events
     set status = case when p_ok then 'processed' else 'failed' end,
         processed_at = case when p_ok then now() else processed_at end,
         last_error = case when p_ok then null else left(coalesce(p_error, 'error'), 500) end,
         updated_at = now()
   where stripe_event_id = p_event_id
  returning * into r;

  return r;
end;
$$;

revoke all on function public.complete_stripe_billing_webhook_event(text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_stripe_billing_webhook_event(text, boolean, text)
  to service_role;

-- =============================================================================
-- Atomic access-code redemption (race-safe max_redemptions)
-- Edge hashes plaintext with pepper, then calls this with the hash.
-- =============================================================================

create or replace function public.redeem_access_code_hash(
  p_code_hash text,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_uid uuid;
  v_code public.access_codes;
  v_entitlement public.entitlements;
  v_redemption public.access_code_redemptions;
  v_valid_until timestamptz;
  v_source_ref text;
  v_is_service boolean := (coalesce(auth.jwt() ->> 'role', auth.role()) = 'service_role');
begin
  if v_is_service then
    v_uid := coalesce(p_user_id, v_caller);
  else
    if v_caller is null then
      raise exception 'not authenticated';
    end if;
    if p_user_id is not null and p_user_id <> v_caller then
      raise exception 'not authorized';
    end if;
    v_uid := v_caller;
  end if;

  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_code_hash is null or length(trim(p_code_hash)) < 32 then
    raise exception 'invalid_code';
  end if;

  -- Atomically claim a redemption slot (prevents concurrent double-redeem).
  update public.access_codes
     set redemption_count = redemption_count + 1,
         updated_at = now()
   where code_hash = p_code_hash
     and active = true
     and (expires_at is null or expires_at > now())
     and (max_redemptions is null or redemption_count < max_redemptions)
  returning * into v_code;

  if not found then
    if exists (
      select 1
      from public.access_codes c
      join public.access_code_redemptions r on r.code_id = c.id
      where c.code_hash = p_code_hash
        and r.user_id = v_uid
        and r.revoked_at is null
    ) then
      raise exception 'already_redeemed';
    end if;
    raise exception 'invalid_or_exhausted_code';
  end if;

  if exists (
    select 1
    from public.access_code_redemptions r
    where r.code_id = v_code.id
      and r.user_id = v_uid
  ) then
    update public.access_codes
       set redemption_count = greatest(redemption_count - 1, 0),
           updated_at = now()
     where id = v_code.id;
    raise exception 'already_redeemed';
  end if;

  if v_code.access_duration_days is null then
    v_valid_until := null;
  else
    v_valid_until := now() + make_interval(days => v_code.access_duration_days);
  end if;

  v_source_ref := 'code:' || v_code.id::text || ':user:' || v_uid::text;

  select * into v_entitlement
  from public.entitlements
  where source = 'access_code'
    and source_ref = v_source_ref
  for update;

  if found then
    update public.entitlements
       set status = 'active',
           valid_from = now(),
           valid_until = v_valid_until,
           metadata = jsonb_build_object(
             'code_id', v_code.id,
             'label', v_code.label,
             'code_prefix', v_code.code_prefix
           ),
           updated_at = now()
     where id = v_entitlement.id
    returning * into v_entitlement;
  else
    insert into public.entitlements (
      user_id, source, status, valid_from, valid_until, source_ref, metadata
    ) values (
      v_uid,
      'access_code',
      'active',
      now(),
      v_valid_until,
      v_source_ref,
      jsonb_build_object(
        'code_id', v_code.id,
        'label', v_code.label,
        'code_prefix', v_code.code_prefix
      )
    )
    returning * into v_entitlement;
  end if;

  begin
    insert into public.access_code_redemptions (
      code_id, user_id, entitlement_id, metadata
    ) values (
      v_code.id,
      v_uid,
      v_entitlement.id,
      jsonb_build_object('label', v_code.label)
    )
    returning * into v_redemption;
  exception
    when unique_violation then
      update public.access_codes
         set redemption_count = greatest(redemption_count - 1, 0),
             updated_at = now()
       where id = v_code.id;
      raise exception 'already_redeemed';
  end;

  return jsonb_build_object(
    'ok', true,
    'entitlement_id', v_entitlement.id,
    'redemption_id', v_redemption.id,
    'valid_until', v_valid_until,
    'label', v_code.label
  );
end;
$$;

revoke all on function public.redeem_access_code_hash(text, uuid) from public, anon;
grant execute on function public.redeem_access_code_hash(text, uuid) to authenticated, service_role;

-- =============================================================================
-- Access / status RPCs (own user only — no arbitrary user_id parameter)
-- =============================================================================

create or replace function public.user_has_active_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.user_id = p_user_id
      and e.status = 'active'
      and e.valid_from <= now()
      and (e.valid_until is null or e.valid_until > now())
  );
$$;

revoke all on function public.user_has_active_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.user_has_active_entitlement(uuid) to service_role;

create or replace function public.has_speedvendors_access()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_enforcement boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select coalesce(enforcement_enabled, false)
    into v_enforcement
  from public.billing_settings
  where id = 1;

  if not coalesce(v_enforcement, false) then
    return true;
  end if;

  if public.is_superadmin_user() then
    return true;
  end if;

  return public.user_has_active_entitlement(v_uid);
end;
$$;

revoke all on function public.has_speedvendors_access() from public, anon;
grant execute on function public.has_speedvendors_access() to authenticated, service_role;

create or replace function public.get_my_entitlement_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_enforcement boolean;
  v_superadmin boolean;
  v_has_entitlement boolean;
  v_sources text[];
  v_sub public.billing_subscriptions;
  v_grace timestamptz;
  v_warning text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(enforcement_enabled, false)
    into v_enforcement
  from public.billing_settings
  where id = 1;

  v_superadmin := public.is_superadmin_user();
  v_has_entitlement := public.user_has_active_entitlement(v_uid);

  select coalesce(array_agg(distinct e.source order by e.source), '{}'::text[])
    into v_sources
  from public.entitlements e
  where e.user_id = v_uid
    and e.status = 'active'
    and e.valid_from <= now()
    and (e.valid_until is null or e.valid_until > now());

  select *
    into v_sub
  from public.billing_subscriptions s
  where s.user_id = v_uid
    and s.status not in ('canceled', 'incomplete_expired')
  order by s.updated_at desc
  limit 1;

  if v_sub.id is not null and v_sub.grace_until is not null and v_sub.grace_until > now() then
    v_grace := v_sub.grace_until;
    v_warning := 'payment_failed_grace';
  elsif v_sub.id is not null and v_sub.status = 'past_due' then
    v_grace := v_sub.grace_until;
    v_warning := 'payment_failed';
  else
    v_grace := null;
    v_warning := null;
  end if;

  return jsonb_build_object(
    'user_id', v_uid,
    'enforcement_enabled', coalesce(v_enforcement, false),
    'is_superadmin', v_superadmin,
    'has_entitlement', v_has_entitlement,
    'has_access',
      case
        when not coalesce(v_enforcement, false) then true
        when v_superadmin then true
        else v_has_entitlement
      end,
    'active_sources', to_jsonb(v_sources),
    'subscription', case
      when v_sub.id is null then null
      else jsonb_build_object(
        'status', v_sub.status,
        'plan', v_sub.plan,
        'billing_interval', v_sub.billing_interval,
        'current_period_end', v_sub.current_period_end,
        'cancel_at_period_end', v_sub.cancel_at_period_end,
        'grace_until', v_sub.grace_until
      )
    end,
    'grace_until', v_grace,
    'billing_warning', v_warning
  );
end;
$$;

revoke all on function public.get_my_entitlement_status() from public, anon;
grant execute on function public.get_my_entitlement_status() to authenticated;

-- Expire stripe entitlements whose grace_until has passed (service_role / cron).
create or replace function public.expire_lapsed_stripe_grace()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer := 0;
begin
  update public.entitlements e
     set status = 'expired',
         updated_at = now(),
         metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object('expired_reason', 'grace_elapsed')
    from public.billing_subscriptions s
   where e.source = 'stripe'
     and e.source_ref = s.stripe_subscription_id
     and e.status = 'active'
     and s.grace_until is not null
     and s.grace_until <= now()
     and s.status in ('past_due', 'unpaid');

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_lapsed_stripe_grace() from public, anon, authenticated;
grant execute on function public.expire_lapsed_stripe_grace() to service_role;
