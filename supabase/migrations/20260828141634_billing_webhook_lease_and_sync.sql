-- Webhook lease hardening + one-open-subscription sync.
-- BILLING ENFORCEMENT remains OFF.

-- Unique index (unchanged) treats these as open — at most one per user:
--   incomplete, trialing, active, past_due, unpaid, paused
-- History (not unique): canceled, incomplete_expired

alter table public.stripe_billing_webhook_events
  add column if not exists lease_id uuid;

comment on column public.stripe_billing_webhook_events.lease_id is
  'Opaque processing lease. Completions must present the current lease; stale reclaim issues a new lease.';

drop function if exists public.claim_stripe_billing_webhook_event(text, text, text, integer);
drop function if exists public.complete_stripe_billing_webhook_event(text, boolean, text);

-- Atomic receive+claim. Returns jsonb:
--   acquired, reason, lease_id, status, attempt_count, processing_started_at, processed_at, last_error, event_type
-- Reasons: new | reclaimed_stale | reclaimed_failed | reclaimed_received | already_processed | lease_held
create or replace function public.claim_stripe_billing_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload_digest text default null,
  p_stale_after_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_stale interval;
  r public.stripe_billing_webhook_events;
  v_acquired boolean := false;
  v_reason text;
  v_new_lease uuid := gen_random_uuid();
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id required';
  end if;

  v_stale := make_interval(secs => greatest(coalesce(p_stale_after_seconds, 90), 30));

  insert into public.stripe_billing_webhook_events as e (
    stripe_event_id,
    event_type,
    status,
    attempt_count,
    payload_digest,
    processing_started_at,
    lease_id,
    updated_at
  )
  values (
    p_event_id,
    coalesce(p_event_type, 'unknown'),
    'processing',
    1,
    p_payload_digest,
    now(),
    v_new_lease,
    now()
  )
  on conflict (stripe_event_id) do update
    set
      status = case
        when e.status = 'processed' then e.status
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - v_stale
          then e.status
        else 'processing'
      end,
      attempt_count = case
        when e.status = 'processed' then e.attempt_count
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - v_stale
          then e.attempt_count
        else e.attempt_count + 1
      end,
      processing_started_at = case
        when e.status = 'processed' then e.processing_started_at
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - v_stale
          then e.processing_started_at
        else now()
      end,
      lease_id = case
        when e.status = 'processed' then e.lease_id
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - v_stale
          then e.lease_id
        else v_new_lease
      end,
      event_type = coalesce(nullif(p_event_type, ''), e.event_type),
      payload_digest = coalesce(p_payload_digest, e.payload_digest),
      last_error = case
        when e.status = 'processed' then e.last_error
        when e.status = 'processing'
          and e.processing_started_at is not null
          and e.processing_started_at > now() - v_stale
          then e.last_error
        when e.status = 'failed' then e.last_error
        else null
      end,
      updated_at = now()
  returning * into r;

  if r.status = 'processed' then
    v_acquired := false;
    v_reason := 'already_processed';
  elsif r.lease_id = v_new_lease then
    v_acquired := true;
    if r.attempt_count = 1 then
      v_reason := 'new';
    elsif r.last_error is not null then
      v_reason := 'reclaimed_failed';
    else
      v_reason := 'reclaimed_stale';
    end if;
  else
    v_acquired := false;
    v_reason := 'lease_held';
  end if;

  return jsonb_build_object(
    'acquired', v_acquired,
    'reason', v_reason,
    'lease_id', r.lease_id,
    'status', r.status,
    'attempt_count', r.attempt_count,
    'processing_started_at', r.processing_started_at,
    'processed_at', r.processed_at,
    'last_error', r.last_error,
    'event_type', r.event_type,
    'stripe_event_id', r.stripe_event_id
  );
end;
$$;

revoke all on function public.claim_stripe_billing_webhook_event(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_billing_webhook_event(text, text, text, integer)
  to service_role;

-- Complete only the current lease owner. Safe if a later worker reclaimed.
-- last_error stores allowlisted codes only (no payloads / secrets).
create or replace function public.complete_stripe_billing_webhook_event(
  p_event_id text,
  p_ok boolean,
  p_error text default null,
  p_lease_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.stripe_billing_webhook_events;
  v_error text;
begin
  if p_ok then
    v_error := null;
  elsif p_error is not null and p_error ~ '^[A-Z][A-Z0-9_]{1,79}$' then
    v_error := p_error;
  else
    v_error := 'HANDLER_ERROR';
  end if;

  update public.stripe_billing_webhook_events
     set status = case when p_ok then 'processed' else 'failed' end,
         processed_at = case when p_ok then now() else processed_at end,
         last_error = v_error,
         updated_at = now()
   where stripe_event_id = p_event_id
     and status = 'processing'
     and (p_lease_id is null or lease_id = p_lease_id)
  returning * into r;

  if r.stripe_event_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'LEASE_NOT_HELD',
      'stripe_event_id', p_event_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', r.status,
    'attempt_count', r.attempt_count,
    'lease_id', r.lease_id,
    'processed_at', r.processed_at,
    'last_error', r.last_error,
    'stripe_event_id', r.stripe_event_id
  );
end;
$$;

revoke all on function public.complete_stripe_billing_webhook_event(text, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_stripe_billing_webhook_event(text, boolean, text, uuid)
  to service_role;

-- Transactional subscription + entitlement upsert.
-- Duplicate open rows are NOT inserted. Conflict is recorded on the existing row.
-- Webhook should treat DUPLICATE_OPEN_SUBSCRIPTION as a retryable failure (do not
-- auto-cancel Stripe subscriptions).
create or replace function public.sync_billing_subscription_from_stripe(
  p_user_id uuid,
  p_billing_customer_id uuid,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_stripe_product_id text,
  p_plan text,
  p_billing_interval text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz,
  p_grace_until timestamptz,
  p_latest_invoice_id text,
  p_livemode boolean,
  p_entitlement_status text,
  p_entitlement_valid_until timestamptz,
  p_entitlement_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_open public.billing_subscriptions;
  v_ent public.entitlements;
  v_now timestamptz := now();
  v_valid_from timestamptz;
begin
  if p_user_id is null or p_billing_customer_id is null or p_stripe_subscription_id is null then
    raise exception 'SYNC_ARGS_REQUIRED';
  end if;

  begin
    insert into public.billing_subscriptions (
      user_id,
      billing_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      stripe_product_id,
      plan,
      billing_interval,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      canceled_at,
      grace_until,
      latest_invoice_id,
      livemode,
      updated_at
    )
    values (
      p_user_id,
      p_billing_customer_id,
      p_stripe_subscription_id,
      p_stripe_price_id,
      p_stripe_product_id,
      p_plan,
      p_billing_interval,
      p_status,
      p_current_period_start,
      p_current_period_end,
      coalesce(p_cancel_at_period_end, false),
      p_canceled_at,
      p_grace_until,
      p_latest_invoice_id,
      coalesce(p_livemode, false),
      v_now
    )
    on conflict (stripe_subscription_id) do update
      set
        user_id = excluded.user_id,
        billing_customer_id = excluded.billing_customer_id,
        stripe_price_id = excluded.stripe_price_id,
        stripe_product_id = excluded.stripe_product_id,
        plan = excluded.plan,
        billing_interval = excluded.billing_interval,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = excluded.canceled_at,
        grace_until = excluded.grace_until,
        latest_invoice_id = excluded.latest_invoice_id,
        livemode = excluded.livemode,
        updated_at = v_now;
  exception
    when unique_violation then
      select * into v_open
        from public.billing_subscriptions s
       where s.user_id = p_user_id
         and s.status not in ('canceled', 'incomplete_expired')
         and s.stripe_subscription_id <> p_stripe_subscription_id
       order by s.created_at
       limit 1;

      if v_open.id is null then
        raise;
      end if;

      update public.billing_subscriptions
         set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
               'duplicate_open_subscription_id', p_stripe_subscription_id,
               'duplicate_detected_at', v_now
             ),
             updated_at = v_now
       where id = v_open.id;

      return jsonb_build_object(
        'ok', false,
        'code', 'DUPLICATE_OPEN_SUBSCRIPTION',
        'existing_stripe_subscription_id', v_open.stripe_subscription_id,
        'incoming_stripe_subscription_id', p_stripe_subscription_id
      );
  end;

  select * into v_ent
    from public.entitlements e
   where e.source = 'stripe'
     and e.source_ref = p_stripe_subscription_id
   limit 1;

  v_valid_from := case
    when p_entitlement_status = 'active' then v_now
    else coalesce(v_ent.valid_from, v_now)
  end;

  if v_ent.id is not null then
    update public.entitlements
       set user_id = p_user_id,
           status = p_entitlement_status,
           valid_from = v_valid_from,
           valid_until = p_entitlement_valid_until,
           metadata = coalesce(p_entitlement_metadata, '{}'::jsonb),
           updated_at = v_now
     where id = v_ent.id;
  else
    insert into public.entitlements (
      user_id, source, status, valid_from, valid_until, source_ref, metadata, updated_at
    ) values (
      p_user_id,
      'stripe',
      p_entitlement_status,
      v_valid_from,
      p_entitlement_valid_until,
      p_stripe_subscription_id,
      coalesce(p_entitlement_metadata, '{}'::jsonb),
      v_now
    );
  end if;

  return jsonb_build_object('ok', true, 'code', 'SYNCED');
end;
$$;

revoke all on function public.sync_billing_subscription_from_stripe(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text, boolean, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.sync_billing_subscription_from_stripe(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text, boolean, text, timestamptz, jsonb
) to service_role;

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
grant execute on function public.get_my_entitlement_status() to service_role;
