-- SpeedVendors 7-day free trial.
--
-- Design (reuses existing billing architecture, no second subscription system):
--   * billing_settings (singleton)  -> trial_duration_days + trial_program_started_at (cutover).
--   * user_trials                   -> one server-side trial window per user.
--   * A trial is NOT a paid entitlement: public.entitlements / billing_subscriptions rows are
--     never created for it, and "is subscribed" decisions (/subscribe, checkout,
--     get_my_entitlement_status.has_entitlement) use the new user_has_paid_entitlement().
--   * user_has_active_entitlement() (the "may use the app" check that ALREADY-DEPLOYED Edge
--     Functions call) now also honours an active trial, so those functions need no redeploy.
--   * merchant write RPCs that bypass RLS (SECURITY DEFINER) get an entitlement guard.
--   * Existing users are never granted a trial: only auth.users created at/after the cutover
--     (or an explicit superadmin action) get a user_trials row.
--   * Trial-tracked users are enforced even while billing_settings.enforcement_enabled = false,
--     so an expired trial locks writes without flipping the global flag for legacy users.
--
-- Deploy order: apply this migration BEFORE deploying the updated Edge Functions.

-- =============================================================================
-- billing_settings: trial configuration + cutover
-- =============================================================================

alter table public.billing_settings
  add column if not exists trial_duration_days integer not null default 7
    check (trial_duration_days between 1 and 90),
  add column if not exists trial_program_started_at timestamptz;

update public.billing_settings
   set trial_program_started_at = now()
 where id = 1
   and trial_program_started_at is null;

comment on column public.billing_settings.trial_program_started_at is
  'Cutover: only auth.users created at/after this instant are eligible for an automatic free trial. Never backdate.';

-- =============================================================================
-- user_trials
-- =============================================================================

create table if not exists public.user_trials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  original_trial_ends_at timestamptz not null,
  -- Materialised status. Authoritative access never reads this column: access is
  -- derived live from trial_ends_at / entitlements. See compute_subscription_status().
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'trial_expired', 'active', 'past_due', 'cancelled')),
  status_updated_at timestamptz not null default now(),
  -- Set once, the first time a Stripe subscription is seen for this user (trial -> paid).
  converted_at timestamptz,
  extended_count integer not null default 0 check (extended_count >= 0),
  source text not null default 'signup' check (source in ('signup', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_trials_window_check check (trial_ends_at > trial_started_at)
);

create index if not exists user_trials_status_ends_idx
  on public.user_trials (subscription_status, trial_ends_at);
create index if not exists user_trials_ends_at_idx
  on public.user_trials (trial_ends_at);
create index if not exists user_trials_created_at_idx
  on public.user_trials (created_at desc);

comment on table public.user_trials is
  'Server-authoritative free-trial window per user. Written only by SECURITY DEFINER functions / service_role.';

alter table public.user_trials enable row level security;

drop policy if exists user_trials_select_own on public.user_trials;
create policy user_trials_select_own
  on public.user_trials
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

revoke all on table public.user_trials from public, anon;
grant select on table public.user_trials to authenticated;
grant all on table public.user_trials to service_role;

drop trigger if exists user_trials_updated_at on public.user_trials;
create trigger user_trials_updated_at
  before update on public.user_trials
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- trial_reminders: persisted once-only reminder state
-- =============================================================================

create table if not exists public.trial_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  milestone text not null check (milestone in ('3d', '1d', 'final', 'expired')),
  -- The trial end this reminder applies to. An extension changes trial_ends_at, which
  -- legitimately re-arms the milestones for the new end date.
  trial_ends_at timestamptz not null,
  trigger_source text not null default 'cron' check (trigger_source in ('cron', 'manual')),
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'partial', 'failed')),
  channels jsonb not null default '{}'::jsonb,
  sent_by uuid,
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz
);

-- The duplicate guard: one automatic reminder per (user, milestone, trial end).
create unique index if not exists trial_reminders_once_uidx
  on public.trial_reminders (user_id, milestone, trial_ends_at)
  where trigger_source = 'cron';

create index if not exists trial_reminders_user_idx
  on public.trial_reminders (user_id, claimed_at desc);

alter table public.trial_reminders enable row level security;

drop policy if exists trial_reminders_select_own on public.trial_reminders;
create policy trial_reminders_select_own
  on public.trial_reminders
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

revoke all on table public.trial_reminders from public, anon;
grant select on table public.trial_reminders to authenticated;
grant all on table public.trial_reminders to service_role;

-- =============================================================================
-- admin_audit_log (append-only)
-- =============================================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NOT foreign keys: the log must outlive deleted users/admins.
  admin_user_id uuid not null,
  admin_email text,
  action text not null,
  target_user_id uuid,
  target_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);
create index if not exists admin_audit_log_admin_idx on public.admin_audit_log (admin_user_id, created_at desc);
create index if not exists admin_audit_log_action_idx on public.admin_audit_log (action);

comment on table public.admin_audit_log is
  'Append-only record of platform-admin actions (trial extension, manual reminders, account deletion).';

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_select_superadmin on public.admin_audit_log;
create policy admin_audit_log_select_superadmin
  on public.admin_audit_log
  for select
  to authenticated
  using (public.is_superadmin());

revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select on table public.admin_audit_log to authenticated;
grant all on table public.admin_audit_log to service_role;

create or replace function public.admin_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists admin_audit_log_no_update on public.admin_audit_log;
create trigger admin_audit_log_no_update
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

-- =============================================================================
-- deleted_account_archive: retained financial records of hard-deleted accounts
-- =============================================================================
-- orders / order_items / payment_transactions cascade from auth.users. Orders carry invoice
-- numbers and customer billing data that must be retained, so they are snapshotted here
-- (service_role only) before the auth user is deleted.

create table if not exists public.deleted_account_archive (
  id uuid primary key default gen_random_uuid(),
  deleted_user_id uuid not null unique,
  deleted_email text,
  store_name text,
  deleted_by uuid not null,
  archived_at timestamptz not null default now(),
  orders jsonb not null default '[]'::jsonb,
  order_items jsonb not null default '[]'::jsonb,
  payment_transactions jsonb not null default '[]'::jsonb,
  billing_records jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  order_returns jsonb not null default '[]'::jsonb
);

comment on table public.deleted_account_archive is
  'Legal-retention snapshot of invoiced/paid orders, items, payments and billing history for hard-deleted accounts. service_role only.';

-- Idempotent for re-runs against a database that already has the table from a partial run.
alter table public.deleted_account_archive add column if not exists order_returns jsonb not null default '[]'::jsonb;
alter table public.deleted_account_archive enable row level security;
revoke all on table public.deleted_account_archive from public, anon, authenticated;
grant all on table public.deleted_account_archive to service_role;

-- =============================================================================
-- Status + access logic
-- =============================================================================

-- Original paid-only check (Stripe / access code / manual...). "Is this user a subscriber?".
create or replace function public.user_has_paid_entitlement(p_user_id uuid)
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

revoke all on function public.user_has_paid_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.user_has_paid_entitlement(uuid) to service_role;

create or replace function public.user_has_active_trial(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.user_trials t
    where t.user_id = p_user_id
      and t.trial_started_at <= now()
      and t.trial_ends_at > now()
  );
$$;

revoke all on function public.user_has_active_trial(uuid) from public, anon, authenticated;
grant execute on function public.user_has_active_trial(uuid) to service_role;

-- Access check consumed by already-deployed Edge Functions (billingEntitlement.ts) and by
-- has_speedvendors_access(): paid entitlement OR active trial. NOT "is a subscriber".
create or replace function public.user_has_active_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.user_has_paid_entitlement(p_user_id)
      or public.user_has_active_trial(p_user_id);
$$;

revoke all on function public.user_has_active_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.user_has_active_entitlement(uuid) to service_role;

-- Canonical access decision (paid entitlement OR active trial OR superadmin OR legacy+flag off).
-- Trial-tracked users are enforced regardless of billing_settings.enforcement_enabled.
create or replace function public.user_has_speedvendors_access(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_enforcement boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.user_roles r
    where r.user_id = p_user_id and r.role = 'superadmin'
  ) then
    return true;
  end if;

  if public.user_has_paid_entitlement(p_user_id) then
    return true;
  end if;

  if public.user_has_active_trial(p_user_id) then
    return true;
  end if;

  -- A user with a trial row whose trial is over (and who has no paid entitlement) is locked
  -- even while the global enforcement flag is still off.
  if exists (select 1 from public.user_trials t where t.user_id = p_user_id) then
    return false;
  end if;

  select coalesce(enforcement_enabled, false)
    into v_enforcement
  from public.billing_settings
  where id = 1;

  return not coalesce(v_enforcement, false);
end;
$$;

revoke all on function public.user_has_speedvendors_access(uuid) from public, anon, authenticated;
grant execute on function public.user_has_speedvendors_access(uuid) to service_role;

-- Signature and grants unchanged: used by every restrictive write policy.
create or replace function public.has_speedvendors_access()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return public.user_has_speedvendors_access(auth.uid());
end;
$$;

revoke all on function public.has_speedvendors_access() from public, anon;
grant execute on function public.has_speedvendors_access() to authenticated, service_role;

-- Live subscription status. Returns null for legacy users with no trial and no billing history.
create or replace function public.compute_subscription_status(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sub_status text;
  v_ends timestamptz;
  v_has_trial boolean;
  v_canceled boolean;
begin
  select s.status
    into v_sub_status
  from public.billing_subscriptions s
  where s.user_id = p_user_id
    and s.status in ('active', 'trialing', 'past_due', 'unpaid')
  order by
    case s.status when 'active' then 0 when 'trialing' then 1 when 'past_due' then 2 else 3 end,
    s.updated_at desc
  limit 1;

  if v_sub_status in ('active', 'trialing') then
    return 'active';
  end if;
  if v_sub_status in ('past_due', 'unpaid') then
    return 'past_due';
  end if;

  -- Non-Stripe paid access (access codes, manual / superadmin grants).
  if public.user_has_paid_entitlement(p_user_id) then
    return 'active';
  end if;

  select t.trial_ends_at into v_ends from public.user_trials t where t.user_id = p_user_id;
  v_has_trial := found;

  if v_has_trial and v_ends > now() then
    return 'trialing';
  end if;

  select exists (
    select 1 from public.billing_subscriptions s
    where s.user_id = p_user_id and s.status = 'canceled'
  ) into v_canceled;

  if v_canceled then
    return 'cancelled';
  end if;
  if v_has_trial then
    return 'trial_expired';
  end if;
  return null;
end;
$$;

revoke all on function public.compute_subscription_status(uuid) from public, anon, authenticated;
grant execute on function public.compute_subscription_status(uuid) to service_role;

create or replace function public.refresh_user_trial_status(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_paid boolean;
begin
  v_status := public.compute_subscription_status(p_user_id);
  if v_status is null then
    return null;
  end if;

  select exists (
    select 1 from public.billing_subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trialing', 'past_due', 'unpaid')
  ) into v_paid;

  update public.user_trials t
     set subscription_status = v_status,
         status_updated_at = case
           when t.subscription_status is distinct from v_status then now()
           else t.status_updated_at
         end,
         converted_at = case
           when t.converted_at is null and v_paid then now()
           else t.converted_at
         end
   where t.user_id = p_user_id
     and (
       t.subscription_status is distinct from v_status
       or (t.converted_at is null and v_paid)
     );

  return v_status;
end;
$$;

revoke all on function public.refresh_user_trial_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_user_trial_status(uuid) to service_role;

-- Time-driven transitions (trial end, entitlement expiry). Cheap; called by the cron sweeper
-- and before admin reads. Event-driven transitions are handled by the triggers below.
create or replace function public.sync_trial_statuses(p_full boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  n integer := 0;
  v_before text;
  v_after text;
begin
  -- Quick mode (admin reads): only the time-driven trialing -> ended transition.
  -- Full mode (cron): also re-checks converted users whose entitlement may have lapsed by time.
  for r in
    select t.user_id, t.subscription_status
    from public.user_trials t
    where (t.subscription_status = 'trialing' and t.trial_ends_at <= now())
       or (p_full and t.subscription_status in ('active', 'past_due'))
  loop
    v_before := r.subscription_status;
    v_after := public.refresh_user_trial_status(r.user_id);
    if v_after is distinct from v_before then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.sync_trial_statuses(boolean) from public, anon, authenticated;
grant execute on function public.sync_trial_statuses(boolean) to service_role;

-- Keep the materialised status current when billing rows change. Never allowed to break the
-- Stripe webhook transaction: any failure is downgraded to a WARNING.
create or replace function public.trg_refresh_trial_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform public.refresh_user_trial_status(new.user_id);
  exception when others then
    raise warning 'trial status refresh failed for %: %', new.user_id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.trg_refresh_trial_status() from public, anon, authenticated;

drop trigger if exists billing_subscriptions_refresh_trial on public.billing_subscriptions;
create trigger billing_subscriptions_refresh_trial
  after insert or update on public.billing_subscriptions
  for each row execute function public.trg_refresh_trial_status();

drop trigger if exists entitlements_refresh_trial on public.entitlements;
create trigger entitlements_refresh_trial
  after insert or update on public.entitlements
  for each row execute function public.trg_refresh_trial_status();

-- JSON view of a user's trial (stable; no lazy creation).
create or replace function public.trial_status_json(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  t public.user_trials;
  v_status text;
  v_secs numeric;
begin
  v_status := public.compute_subscription_status(p_user_id);
  select * into t from public.user_trials where user_id = p_user_id;

  if t.user_id is null then
    return jsonb_build_object(
      'has_trial', false,
      'subscription_status', v_status,
      'server_now', now()
    );
  end if;

  v_secs := extract(epoch from (t.trial_ends_at - now()));

  return jsonb_build_object(
    'has_trial', true,
    'subscription_status', v_status,
    'is_trial_active', (t.trial_started_at <= now() and t.trial_ends_at > now()),
    'trial_started_at', t.trial_started_at,
    'trial_ends_at', t.trial_ends_at,
    'seconds_remaining', greatest(floor(v_secs), 0)::bigint,
    'days_remaining', case when v_secs > 0 then ceil(v_secs / 86400.0)::integer else 0 end,
    'extended', t.extended_count > 0,
    'server_now', now()
  );
end;
$$;

revoke all on function public.trial_status_json(uuid) from public, anon, authenticated;
grant execute on function public.trial_status_json(uuid) to service_role;

-- Own trial status. Volatile: heals a missing row for users created after the cutover
-- (e.g. trigger warning) but NEVER for users created before it.
create or replace function public.get_my_trial_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_created timestamptz;
  v_cutover timestamptz;
  v_days integer;
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.user_trials where user_id = v_uid) then
    select trial_program_started_at, trial_duration_days
      into v_cutover, v_days
    from public.billing_settings
    where id = 1;

    select u.created_at into v_created from auth.users u where u.id = v_uid;

    if v_cutover is not null
       and v_created is not null
       and v_created >= v_cutover
       and not exists (
         select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'superadmin'
       )
    then
      v_end := v_created + make_interval(days => coalesce(v_days, 7));
      insert into public.user_trials (
        user_id, trial_started_at, trial_ends_at, original_trial_ends_at, source
      ) values (v_uid, v_created, v_end, v_end, 'signup')
      on conflict (user_id) do nothing;
    end if;
  end if;

  perform public.refresh_user_trial_status(v_uid);
  return public.trial_status_json(v_uid);
end;
$$;

revoke all on function public.get_my_trial_status() from public, anon;
grant execute on function public.get_my_trial_status() to authenticated;

-- New-user trigger. Trial creation must never block signup.
create or replace function public.handle_new_user_trial()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_days integer;
  v_end timestamptz;
begin
  begin
    select coalesce(trial_duration_days, 7)
      into v_days
    from public.billing_settings
    where id = 1;

    v_end := new.created_at + make_interval(days => coalesce(v_days, 7));

    insert into public.user_trials (
      user_id, trial_started_at, trial_ends_at, original_trial_ends_at, source
    ) values (new.id, new.created_at, v_end, v_end, 'signup')
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_user_trial failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.handle_new_user_trial() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_trial on auth.users;
create trigger on_auth_user_created_trial
  after insert on auth.users
  for each row execute function public.handle_new_user_trial();

-- Extend the existing status RPC: has_access now includes the trial; has_entitlement stays
-- paid-only so /subscribe and checkout keep treating trial users as "not subscribed".
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
  v_active_trial boolean;
  v_sources text[];
  v_sub public.billing_subscriptions;
  v_grace timestamptz;
  v_warning text;
  v_trial jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(enforcement_enabled, false)
    into v_enforcement
  from public.billing_settings
  where id = 1;

  v_superadmin := public.is_superadmin_user();
  v_has_entitlement := public.user_has_paid_entitlement(v_uid);
  v_active_trial := public.user_has_active_trial(v_uid);

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
  order by
    case s.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      when 'unpaid' then 3
      when 'paused' then 4
      when 'incomplete' then 5
      else 6
    end,
    s.updated_at desc
  limit 1;

  if v_sub.id is not null
     and v_sub.metadata ? 'duplicate_open_subscription_id' then
    v_warning := 'duplicate_open_subscription';
    v_grace := v_sub.grace_until;
  elsif v_sub.id is not null and v_sub.grace_until is not null and v_sub.grace_until > now() then
    v_grace := v_sub.grace_until;
    v_warning := 'payment_failed_grace';
  elsif v_sub.id is not null and v_sub.status = 'past_due' then
    v_grace := v_sub.grace_until;
    v_warning := 'payment_failed';
  else
    v_grace := null;
    v_warning := null;
  end if;

  v_trial := public.trial_status_json(v_uid);

  return jsonb_build_object(
    'user_id', v_uid,
    'enforcement_enabled', coalesce(v_enforcement, false),
    'is_superadmin', v_superadmin,
    'has_entitlement', v_has_entitlement,
    'has_access', public.user_has_speedvendors_access(v_uid),
    'active_sources',
      to_jsonb(
        case when v_active_trial then array_append(v_sources, 'trial') else v_sources end
      ),
    'subscription', case
      when v_sub.id is null then null
      else jsonb_build_object(
        'status', v_sub.status,
        'plan', v_sub.plan,
        'tier', v_sub.tier,
        'billing_interval', v_sub.billing_interval,
        'stripe_price_id', v_sub.stripe_price_id,
        'current_period_end', v_sub.current_period_end,
        'cancel_at_period_end', v_sub.cancel_at_period_end,
        'grace_until', v_sub.grace_until,
        'pending_tier', v_sub.metadata->>'pending_tier',
        'pending_interval', v_sub.metadata->>'pending_interval',
        'pending_effective_at', v_sub.metadata->>'pending_effective_at'
      )
    end,
    'grace_until', v_grace,
    'billing_warning', v_warning,
    'subscription_status', v_trial->>'subscription_status',
    'trial', v_trial
  );
end;
$$;

revoke all on function public.get_my_entitlement_status() from public, anon;
grant execute on function public.get_my_entitlement_status() to authenticated;
grant execute on function public.get_my_entitlement_status() to service_role;

-- =============================================================================
-- Reminder claiming (at-most-once per user / milestone / trial end)
-- =============================================================================
-- Windows are 24h wide so an hourly cron cannot skip one:
--   3d    : 72h >= remaining > 48h     (only if trial is longer than 72h)
--   1d    : 48h >= remaining > 24h     (only if trial is longer than 48h)
--   final : 24h >= remaining > 0
--   expired: ended within the last 72h and still not converted
-- The insert itself is the lock: a unique-index conflict means someone already claimed it.

create or replace function public.claim_due_trial_reminders(p_limit integer default 500)
returns table (
  reminder_id uuid,
  target_user_id uuid,
  milestone_key text,
  ends_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.sync_trial_statuses(true);

  return query
  with due as (
    select
      t.user_id as uid,
      t.trial_ends_at as ends,
      case
        when t.subscription_status = 'trialing' and t.trial_ends_at > now() then
          case
            when t.trial_ends_at - now() <= interval '24 hours' then 'final'
            when t.trial_ends_at - now() <= interval '48 hours'
              and t.trial_ends_at - t.trial_started_at > interval '48 hours' then '1d'
            when t.trial_ends_at - now() <= interval '72 hours'
              and t.trial_ends_at - t.trial_started_at > interval '72 hours' then '3d'
            else null
          end
        when t.subscription_status = 'trial_expired'
          and t.trial_ends_at <= now()
          and t.trial_ends_at > now() - interval '72 hours' then 'expired'
        else null
      end as m
    from public.user_trials t
    where t.subscription_status in ('trialing', 'trial_expired')
      and t.trial_ends_at > now() - interval '72 hours'
      and t.trial_ends_at <= now() + interval '72 hours'
    order by t.trial_ends_at
    limit greatest(p_limit, 1)
  ),
  ins as (
    insert into public.trial_reminders as tr (user_id, milestone, trial_ends_at, trigger_source)
    select d.uid, d.m, d.ends, 'cron'
    from due d
    where d.m is not null
    on conflict (user_id, milestone, trial_ends_at) where trigger_source = 'cron'
    do nothing
    returning tr.id, tr.user_id, tr.milestone, tr.trial_ends_at
  )
  select ins.id, ins.user_id, ins.milestone, ins.trial_ends_at from ins;
end;
$$;

revoke all on function public.claim_due_trial_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_trial_reminders(integer) to service_role;

create or replace function public.complete_trial_reminder(
  p_reminder_id uuid,
  p_status text,
  p_channels jsonb
)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.trial_reminders
     set status = case when p_status in ('sent', 'partial', 'failed') then p_status else 'failed' end,
         channels = coalesce(p_channels, '{}'::jsonb),
         delivered_at = now()
   where id = p_reminder_id;
$$;

revoke all on function public.complete_trial_reminder(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_trial_reminder(uuid, text, jsonb) to service_role;

-- =============================================================================
-- Superadmin RPCs (each re-checks role + AAL2 via is_superadmin())
-- =============================================================================

create or replace function public.assert_platform_superadmin()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_platform_superadmin() from public, anon;
grant execute on function public.assert_platform_superadmin() to authenticated, service_role;

create or replace function public.admin_list_trials(
  p_filter text default 'all',
  p_search text default null,
  p_sort text default 'newest',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  user_name text,
  merchant_id uuid,
  store_name text,
  signed_up_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  days_remaining integer,
  subscription_status text,
  current_plan text,
  last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like text;
begin
  perform public.assert_platform_superadmin();
  perform public.sync_trial_statuses();

  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select
    t.user_id,
    u.email::text,
    nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
    p.id,
    p.store_name,
    u.created_at,
    t.trial_started_at,
    t.trial_ends_at,
    case
      when t.trial_ends_at > now()
        then ceil(extract(epoch from (t.trial_ends_at - now())) / 86400.0)::integer
      else 0
    end,
    t.subscription_status,
    coalesce(
      case when s.tier is not null
        then s.tier || coalesce(' (' || s.plan || ')', '')
      end,
      e.source
    ),
    u.last_sign_in_at,
    count(*) over ()
  from public.user_trials t
  join auth.users u on u.id = t.user_id
  left join lateral (
    select pr.id, pr.store_name
    from public.profiles pr
    where pr.user_id = t.user_id
    order by pr.created_at
    limit 1
  ) p on true
  left join lateral (
    select bs.tier, bs.plan
    from public.billing_subscriptions bs
    where bs.user_id = t.user_id
      and bs.status in ('active', 'trialing', 'past_due', 'unpaid')
    order by bs.updated_at desc
    limit 1
  ) s on true
  left join lateral (
    select en.source
    from public.entitlements en
    where en.user_id = t.user_id
      and en.status = 'active'
      and en.valid_from <= now()
      and (en.valid_until is null or en.valid_until > now())
    order by en.created_at desc
    limit 1
  ) e on true
  where not exists (
      select 1 from public.user_roles r
      where r.user_id = t.user_id and r.role = 'superadmin'
    )
    and (
      case coalesce(p_filter, 'all')
        when 'active' then t.subscription_status = 'trialing'
        when 'ending_soon' then t.subscription_status = 'trialing'
          and t.trial_ends_at <= now() + interval '72 hours'
        when 'expired' then t.subscription_status = 'trial_expired'
        when 'converted' then t.subscription_status in ('active', 'past_due')
        when 'cancelled' then t.subscription_status = 'cancelled'
        else true
      end
    )
    and (
      v_like is null
      or u.email ilike v_like
      or coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') ilike v_like
      or coalesce(p.store_name, '') ilike v_like
    )
  order by
    case when coalesce(p_sort, 'newest') = 'ending_soon'
      then case when t.subscription_status = 'trialing' then 0 else 1 end
    end asc nulls last,
    case when coalesce(p_sort, 'newest') = 'ending_soon' then t.trial_ends_at end asc nulls last,
    case when coalesce(p_sort, 'newest') = 'oldest' then u.created_at end asc nulls last,
    u.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_trials(text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_trials(text, text, text, integer, integer) to authenticated;

create or replace function public.admin_trial_summary()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active integer;
  v_expiring integer;
  v_expired integer;
  v_converted integer;
  v_concluded integer;
begin
  perform public.assert_platform_superadmin();
  perform public.sync_trial_statuses();

  select
    count(*) filter (where t.subscription_status = 'trialing'),
    count(*) filter (
      where t.subscription_status = 'trialing' and t.trial_ends_at <= now() + interval '24 hours'
    ),
    count(*) filter (where t.subscription_status = 'trial_expired'),
    count(*) filter (where t.converted_at is not null),
    count(*) filter (where t.converted_at is not null or t.trial_ends_at <= now())
  into v_active, v_expiring, v_expired, v_converted, v_concluded
  from public.user_trials t
  where not exists (
    select 1 from public.user_roles r where r.user_id = t.user_id and r.role = 'superadmin'
  );

  return jsonb_build_object(
    'active_trials', v_active,
    'expiring_24h', v_expiring,
    'expired_trials', v_expired,
    'converted_to_paid', v_converted,
    'concluded_trials', v_concluded,
    -- Percent of trials that have concluded (ended or converted) which converted to a Stripe subscription.
    'conversion_rate', case when v_concluded = 0 then null else round(100.0 * v_converted / v_concluded, 1) end
  );
end;
$$;

revoke all on function public.admin_trial_summary() from public, anon;
grant execute on function public.admin_trial_summary() to authenticated;

create or replace function public.admin_get_user_overview(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user auth.users;
  v_profile record;
  v_trial public.user_trials;
  v_sub record;
begin
  perform public.assert_platform_superadmin();

  select * into v_user from auth.users where id = p_user_id;
  if v_user.id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  perform public.refresh_user_trial_status(p_user_id);

  select pr.id, pr.store_name, pr.setup_completed
    into v_profile
  from public.profiles pr
  where pr.user_id = p_user_id
  order by pr.created_at
  limit 1;

  select * into v_trial from public.user_trials where user_id = p_user_id;

  select bs.status, bs.tier, bs.plan, bs.current_period_end, bs.cancel_at_period_end
    into v_sub
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
  order by bs.updated_at desc
  limit 1;

  return jsonb_build_object(
    'account', jsonb_build_object(
      'user_id', v_user.id,
      'email', v_user.email,
      'name', nullif(btrim(coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name', '')), ''),
      'created_at', v_user.created_at,
      'last_sign_in_at', v_user.last_sign_in_at,
      'email_confirmed_at', v_user.email_confirmed_at,
      'is_superadmin', exists (
        select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'superadmin'
      )
    ),
    'merchant', jsonb_build_object(
      'merchant_id', v_profile.id,
      'store_name', v_profile.store_name,
      'setup_completed', v_profile.setup_completed
    ),
    'trial', public.trial_status_json(p_user_id) || jsonb_build_object(
      'original_trial_ends_at', v_trial.original_trial_ends_at,
      'extended_count', v_trial.extended_count,
      'converted_at', v_trial.converted_at,
      'source', v_trial.source
    ),
    'subscription', case
      when v_sub.status is null then null
      else jsonb_build_object(
        'status', v_sub.status,
        'tier', v_sub.tier,
        'plan', v_sub.plan,
        'current_period_end', v_sub.current_period_end,
        'cancel_at_period_end', v_sub.cancel_at_period_end
      )
    end,
    'has_access', public.user_has_speedvendors_access(p_user_id),
    'reminders', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.claimed_at desc)
      from (
        select tr.milestone, tr.trigger_source, tr.status, tr.channels, tr.claimed_at, tr.trial_ends_at
        from public.trial_reminders tr
        where tr.user_id = p_user_id
        order by tr.claimed_at desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select a.action, a.admin_email, a.metadata, a.created_at
        from public.admin_audit_log a
        where a.target_user_id = p_user_id
        order by a.created_at desc
        limit 10
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_user_overview(uuid) from public, anon;
grant execute on function public.admin_get_user_overview(uuid) to authenticated;

-- +N days (from the later of current end / now) or an explicit new end date. Also the explicit,
-- audited way to give a legacy (pre-trial) user a trial. Writes the audit row in the same txn.
create or replace function public.admin_extend_trial(
  p_user_id uuid,
  p_days integer default null,
  p_new_end timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin uuid := auth.uid();
  v_admin_email text;
  v_target_email text;
  v_trial public.user_trials;
  v_created boolean := false;
  v_previous_end timestamptz;
  v_new_end timestamptz;
begin
  perform public.assert_platform_superadmin();

  if (p_days is null) = (p_new_end is null) then
    raise exception 'provide exactly one of p_days or p_new_end' using errcode = '22023';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 365) then
    raise exception 'p_days must be between 1 and 365' using errcode = '22023';
  end if;

  select u.email into v_target_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  select u.email into v_admin_email from auth.users u where u.id = v_admin;

  if exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'superadmin') then
    raise exception 'cannot_extend_superadmin' using errcode = '22023';
  end if;

  select * into v_trial from public.user_trials where user_id = p_user_id for update;

  if v_trial.user_id is null then
    v_created := true;
    v_previous_end := null;
    v_new_end := coalesce(p_new_end, now() + make_interval(days => p_days));
    if v_new_end <= now() then
      raise exception 'new trial end must be in the future' using errcode = '22023';
    end if;
    if v_new_end > now() + interval '365 days' then
      raise exception 'new trial end too far in the future' using errcode = '22023';
    end if;
    insert into public.user_trials (
      user_id, trial_started_at, trial_ends_at, original_trial_ends_at, source, extended_count
    ) values (p_user_id, now(), v_new_end, v_new_end, 'admin', 1)
    returning * into v_trial;
  else
    v_previous_end := v_trial.trial_ends_at;
    v_new_end := coalesce(
      p_new_end,
      greatest(v_trial.trial_ends_at, now()) + make_interval(days => p_days)
    );
    if v_new_end <= now() then
      raise exception 'new trial end must be in the future' using errcode = '22023';
    end if;
    if v_new_end <= v_trial.trial_ends_at then
      raise exception 'new trial end must be later than the current trial end' using errcode = '22023';
    end if;
    if v_new_end > now() + interval '365 days' then
      raise exception 'new trial end too far in the future' using errcode = '22023';
    end if;
    update public.user_trials
       set trial_ends_at = v_new_end,
           extended_count = extended_count + 1
     where user_id = p_user_id
    returning * into v_trial;
  end if;

  perform public.refresh_user_trial_status(p_user_id);

  insert into public.admin_audit_log (admin_user_id, admin_email, action, target_user_id, target_email, metadata)
  values (
    v_admin,
    v_admin_email,
    'trial_extended',
    p_user_id,
    v_target_email,
    jsonb_build_object(
      'previous_trial_ends_at', v_previous_end,
      'new_trial_ends_at', v_new_end,
      'days', p_days,
      'custom_date', p_new_end is not null,
      'created_trial', v_created,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  return public.trial_status_json(p_user_id);
end;
$$;

revoke all on function public.admin_extend_trial(uuid, integer, timestamptz, text) from public, anon;
grant execute on function public.admin_extend_trial(uuid, integer, timestamptz, text) to authenticated;

-- =============================================================================
-- Account deletion helpers (service_role only; called by the admin-delete-user Edge Function)
-- =============================================================================

-- Per-table row counts for a user across public tables that have a user_id column.
create or replace function public.count_user_rows(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r record;
  n bigint;
  out jsonb := '{}'::jsonb;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    begin
      execute format('select count(*) from public.%I where user_id::text = $1::text', r.table_name)
        into n using p_user_id;
      if n > 0 then
        out := out || jsonb_build_object(r.table_name, n);
      end if;
    exception when others then
      out := out || jsonb_build_object(r.table_name, 'error');
    end;
  end loop;
  return out;
end;
$$;

revoke all on function public.count_user_rows(uuid) from public, anon, authenticated;
grant execute on function public.count_user_rows(uuid) to service_role;

-- Snapshot financial / legally retained records BEFORE the auth user is deleted (the FKs cascade).
-- Retained: every order that was paid, invoiced, cash-on-delivery, refunded, or has an invoice
-- number, plus its items and payment transactions, plus SaaS billing history.
-- Idempotent per user (re-running after a failed delete refreshes the snapshot).
create or replace function public.admin_archive_account_for_deletion(
  p_user_id uuid,
  p_deleted_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_store text;
  v_orders jsonb;
  v_items jsonb;
  v_payments jsonb;
  v_billing jsonb;
  v_returns jsonb := '[]'::jsonb;
begin
  select u.email into v_email from auth.users u where u.id = p_user_id;
  select pr.store_name into v_store from public.profiles pr where pr.user_id = p_user_id limit 1;

  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
    into v_orders
  from public.orders o
  where o.user_id = p_user_id
    and (
      o.invoice_number is not null
      or o.payment_status in ('paid', 'invoiced', 'cash', 'refunded')
    );

  select coalesce(jsonb_agg(to_jsonb(oi)), '[]'::jsonb)
    into v_items
  from public.order_items oi
  where oi.order_id in (
    select o.id from public.orders o
    where o.user_id = p_user_id
      and (o.invoice_number is not null or o.payment_status in ('paid', 'invoiced', 'cash', 'refunded'))
  );

  select coalesce(jsonb_agg(to_jsonb(pt)), '[]'::jsonb)
    into v_payments
  from public.payment_transactions pt
  where pt.order_id in (
    select o.id from public.orders o
    where o.user_id = p_user_id
      and (o.invoice_number is not null or o.payment_status in ('paid', 'invoiced', 'cash', 'refunded'))
  );

  -- order_returns (partial returns of retained orders) exists in production; guard for older schemas.
  if to_regclass('public.order_returns') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.order_returns r where r.user_id = $1'
      into v_returns using p_user_id;
  end if;

  select jsonb_build_object(
    'customers', coalesce((select jsonb_agg(to_jsonb(c)) from public.billing_customers c where c.user_id = p_user_id), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(s)) from public.billing_subscriptions s where s.user_id = p_user_id), '[]'::jsonb)
  ) into v_billing;

  insert into public.deleted_account_archive (
    deleted_user_id, deleted_email, store_name, deleted_by,
    orders, order_items, payment_transactions, billing_records, order_returns, counts
  ) values (
    p_user_id, v_email, v_store, p_deleted_by,
    v_orders, v_items, v_payments, v_billing, v_returns,
    jsonb_build_object(
      'orders', jsonb_array_length(v_orders),
      'order_items', jsonb_array_length(v_items),
      'payment_transactions', jsonb_array_length(v_payments),
      'order_returns', jsonb_array_length(v_returns)
    )
  )
  on conflict (deleted_user_id) do update
    set deleted_email = excluded.deleted_email,
        store_name = excluded.store_name,
        deleted_by = excluded.deleted_by,
        archived_at = now(),
        orders = excluded.orders,
        order_items = excluded.order_items,
        payment_transactions = excluded.payment_transactions,
        billing_records = excluded.billing_records,
        order_returns = excluded.order_returns,
        counts = excluded.counts;

  return jsonb_build_object(
    'orders', jsonb_array_length(v_orders),
    'order_items', jsonb_array_length(v_items),
    'payment_transactions', jsonb_array_length(v_payments),
    'order_returns', jsonb_array_length(v_returns)
  );
end;
$$;

revoke all on function public.admin_archive_account_for_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_archive_account_for_deletion(uuid, uuid) to service_role;

-- =============================================================================
-- Server-side guard for merchant write RPCs
-- =============================================================================
-- bulk_update_stock, save_product_variants, return_order_items and restore_order_stock are
-- SECURITY DEFINER and executable by any signed-in user, so they bypass the table write
-- guards. Without this, a merchant whose trial ended could still change stock / variants /
-- returns by calling the API directly. The guard only applies to signed-in end users:
-- service_role callers (store-api, webhooks) and anonymous callers are unaffected.

create or replace function public.assert_entitlement_if_end_user()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if coalesce(auth.jwt() ->> 'role', auth.role()) = 'service_role' then
    return;
  end if;
  if not public.user_has_speedvendors_access(auth.uid()) then
    raise exception 'entitlement_required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_entitlement_if_end_user() from public, anon;
grant execute on function public.assert_entitlement_if_end_user() to authenticated, service_role;

-- Inject the guard as the first statement of each function body, preserving everything else
-- (signature, owner, SECURITY DEFINER, search_path, grants) by re-issuing pg_get_functiondef.
-- Idempotent, and fails the whole migration (rolling it back) if the injection point is not found.
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_call constant text := 'perform public.assert_entitlement_if_end_user();';
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('bulk_update_stock', 'save_product_variants', 'return_order_items', 'restore_order_stock')
      and p.prokind = 'f'
  loop
    v_def := pg_get_functiondef(r.oid);
    if position(v_call in v_def) > 0 then
      continue;
    end if;
    -- first top-level BEGIN (after any DECLARE section)
    v_new := regexp_replace(v_def, '(\mbegin\M)', E'\\1\n  ' || v_call, 'i');
    if v_new = v_def or position(v_call in v_new) = 0 then
      raise exception 'could not inject entitlement guard into public.%', r.proname;
    end if;
    execute v_new;
  end loop;
end $$;
