-- Free trial: explicit start (forward correction of 20260920120000).
--
-- PRODUCT RULE: creating an account must NOT start a trial. The flow is
--     sign up -> plan-selection screen -> user chooses a paid plan OR presses "Start Free Trial".
-- Only that explicit action (start_free_trial()) creates the trial, using server time.
--
-- Trial states (all derived from server data, nothing client-provided):
--     not_started : no user_trials row      (a row means "consumed", it is never deleted by the app)
--     active      : row exists and now() < trial_ends_at
--     expired     : row exists and now() >= trial_ends_at
-- Plan states returned to the client (trial_status_json.plan_state):
--     no_plan | trial_active | trial_expired | paid | past_due | cancelled | legacy
--
-- Forward-only: nothing is dropped from migration history; the tables/functions created by the earlier
-- migration are kept and corrected.

-- =============================================================================
-- 1. Stop creating trials at signup
-- =============================================================================

drop trigger if exists on_auth_user_created_trial on auth.users;
drop function if exists public.handle_new_user_trial();

-- =============================================================================
-- 2. Provenance of a trial row
-- =============================================================================
-- self          : the user pressed "Start Free Trial" (start_free_trial())
-- admin         : a superadmin granted/extended it (admin_extend_trial())
-- grandfathered : auto-created by the earlier (faulty) signup trigger for an account that had already
--                 signed in and been using the app; access preserved until its original end date.

alter table public.user_trials drop constraint if exists user_trials_source_check;

-- Transition of rows created by the signup trigger (source = 'signup'):
--   * signed in at least once  -> keep the trial exactly as it is, mark it consumed ('grandfathered')
--   * never signed in          -> the account never saw the app: remove the row so the user is back to
--                                 "no plan selected" and still eligible for an explicit trial.
update public.user_trials t
   set source = 'grandfathered'
  from auth.users u
 where u.id = t.user_id
   and t.source = 'signup'
   and u.last_sign_in_at is not null;

with gone as (
  delete from public.user_trials t
   using auth.users u
   where u.id = t.user_id
     and t.source = 'signup'
     and u.last_sign_in_at is null
  returning t.user_id
)
delete from public.trial_reminders r
 using gone
 where r.user_id = gone.user_id;

alter table public.user_trials
  add constraint user_trials_source_check check (source in ('self', 'admin', 'grandfathered'));
alter table public.user_trials alter column source set default 'self';

-- =============================================================================
-- 3. Access rule: a NEW account with no plan has no access
-- =============================================================================
-- Order:  superadmin -> paid entitlement -> active trial -> expired trial (locked)
--         -> account created on/after the trial-program cutover with no plan (locked)
--         -> legacy account (created before the cutover): unchanged, follows enforcement_enabled.

create or replace function public.user_has_speedvendors_access(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_enforcement boolean;
  v_created timestamptz;
  v_cutover timestamptz;
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

  -- Trial consumed and over.
  if exists (select 1 from public.user_trials t where t.user_id = p_user_id) then
    return false;
  end if;

  select trial_program_started_at, coalesce(enforcement_enabled, false)
    into v_cutover, v_enforcement
  from public.billing_settings
  where id = 1;

  -- New-flow account that has not chosen a plan yet: no access, regardless of the global flag.
  select u.created_at into v_created from auth.users u where u.id = p_user_id;
  if v_cutover is not null and v_created is not null and v_created >= v_cutover then
    return false;
  end if;

  -- Legacy account: unchanged behaviour.
  return not v_enforcement;
end;
$$;

revoke all on function public.user_has_speedvendors_access(uuid) from public, anon, authenticated;
grant execute on function public.user_has_speedvendors_access(uuid) to service_role;

-- =============================================================================
-- 4. Status JSON (adds trial_state / plan_state / eligibility)
-- =============================================================================

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
  v_created timestamptz;
  v_cutover timestamptz;
  v_new_account boolean;
  v_eligible boolean;
  v_plan_state text;
  v_trial_state text;
begin
  v_status := public.compute_subscription_status(p_user_id);
  select * into t from public.user_trials where user_id = p_user_id;
  select u.created_at into v_created from auth.users u where u.id = p_user_id;
  select trial_program_started_at into v_cutover from public.billing_settings where id = 1;

  v_new_account := v_cutover is not null and v_created is not null and v_created >= v_cutover;
  v_eligible := t.user_id is null
    and v_new_account
    and not public.user_has_paid_entitlement(p_user_id)
    and not exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'superadmin');

  v_plan_state := case
    when v_status = 'active' then 'paid'
    when v_status = 'past_due' then 'past_due'
    when v_status = 'trialing' then 'trial_active'
    when v_status = 'trial_expired' then 'trial_expired'
    when v_status = 'cancelled' then 'cancelled'
    when v_new_account then 'no_plan'
    else 'legacy'
  end;

  v_trial_state := case
    when t.user_id is null then 'not_started'
    when t.trial_started_at <= now() and t.trial_ends_at > now() then 'active'
    else 'expired'
  end;

  if t.user_id is null then
    return jsonb_build_object(
      'has_trial', false,
      'trial_state', v_trial_state,
      'plan_state', v_plan_state,
      'trial_eligible', v_eligible,
      'subscription_status', v_status,
      'server_now', now()
    );
  end if;

  v_secs := extract(epoch from (t.trial_ends_at - now()));

  return jsonb_build_object(
    'has_trial', true,
    'trial_state', v_trial_state,
    'plan_state', v_plan_state,
    'trial_eligible', false,
    'subscription_status', v_status,
    'is_trial_active', (v_trial_state = 'active'),
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

-- Own status. READ-ONLY with respect to the trial: it never creates a trial (the old lazy "heal" is gone).
create or replace function public.get_my_trial_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform public.refresh_user_trial_status(v_uid);
  return public.trial_status_json(v_uid);
end;
$$;

revoke all on function public.get_my_trial_status() from public, anon;
grant execute on function public.get_my_trial_status() to authenticated;

-- =============================================================================
-- 5. The ONLY way a trial starts for a user
-- =============================================================================
-- Called exclusively by the "Start Free Trial" button on the plan-selection screen.
-- * takes no arguments: start/end always come from server time and billing_settings.trial_duration_days
-- * one trial per account, ever: the primary key plus a per-user advisory lock make concurrent
--   double-clicks / parallel API calls safe (exactly one row, the loser sees "already_started")
-- * creates NO subscription and NO entitlement
-- Expected refusals are returned as { ok: false, code } (HTTP 200) so the client can show a message:
--   already_started | already_subscribed | not_eligible | email_not_verified | not_applicable

create or replace function public.start_free_trial()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_created timestamptz;
  v_confirmed timestamptz;
  v_cutover timestamptz;
  v_days integer;
  v_inserted public.user_trials;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Serialise concurrent calls for the same user.
  perform pg_advisory_xact_lock(hashtextextended('start_free_trial:' || v_uid::text, 0));

  if exists (select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'superadmin') then
    return jsonb_build_object('ok', false, 'code', 'not_applicable', 'trial', public.trial_status_json(v_uid));
  end if;

  if exists (select 1 from public.user_trials t where t.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'code', 'already_started', 'trial', public.trial_status_json(v_uid));
  end if;

  if public.user_has_paid_entitlement(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'already_subscribed', 'trial', public.trial_status_json(v_uid));
  end if;

  select u.created_at, u.email_confirmed_at into v_created, v_confirmed from auth.users u where u.id = v_uid;
  select trial_program_started_at, trial_duration_days into v_cutover, v_days from public.billing_settings where id = 1;

  -- Accounts that existed before the trial program are not eligible (a superadmin can grant one explicitly).
  if v_cutover is null or v_created is null or v_created < v_cutover then
    return jsonb_build_object('ok', false, 'code', 'not_eligible', 'trial', public.trial_status_json(v_uid));
  end if;

  if v_confirmed is null then
    return jsonb_build_object('ok', false, 'code', 'email_not_verified', 'trial', public.trial_status_json(v_uid));
  end if;

  insert into public.user_trials (
    user_id, trial_started_at, trial_ends_at, original_trial_ends_at, source
  ) values (
    v_uid, now(), now() + make_interval(days => coalesce(v_days, 7)), now() + make_interval(days => coalesce(v_days, 7)), 'self'
  )
  on conflict (user_id) do nothing
  returning * into v_inserted;

  if v_inserted.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'already_started', 'trial', public.trial_status_json(v_uid));
  end if;

  perform public.refresh_user_trial_status(v_uid);
  return jsonb_build_object('ok', true, 'code', 'started', 'trial', public.trial_status_json(v_uid));
end;
$$;

revoke all on function public.start_free_trial() from public, anon;
grant execute on function public.start_free_trial() to authenticated;

comment on function public.start_free_trial() is
  'The only path that starts a self-service free trial. No arguments; server time only; one per account; no subscription/entitlement created.';
