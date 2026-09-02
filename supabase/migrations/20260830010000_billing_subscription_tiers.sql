-- SpeedVendors START / GROWTH / SCALE tiers.
-- billing_subscriptions.plan remains monthly | yearly (interval).
-- billing_subscriptions.tier is start | growth | scale.

alter table public.billing_subscriptions
  add column if not exists tier text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'billing_subscriptions_tier_check'
       and conrelid = 'public.billing_subscriptions'::regclass
  ) then
    alter table public.billing_subscriptions
      add constraint billing_subscriptions_tier_check
      check (tier is null or tier in ('start', 'growth', 'scale'));
  end if;
end $$;

comment on column public.billing_subscriptions.plan is
  'Billing interval: monthly | yearly. Not the START/GROWTH/SCALE tier.';
comment on column public.billing_subscriptions.tier is
  'SpeedVendors plan tier: start | growth | scale.';

-- Legacy sandbox two-price catalogue maps to START.
update public.billing_subscriptions
   set tier = 'start'
 where tier is null
   and stripe_price_id in (
     'price_1U9PYVCSbF3ugaFYdcxkRX1e',
     'price_1U9PZJCSbF3ugaFYLfZNuZvO'
   );

update public.entitlements e
   set metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
     'tier', 'start',
     'media_quota_bytes', 2147483648,
     'billing_interval', case
       when e.metadata->>'price_id' = 'price_1U9PZJCSbF3ugaFYLfZNuZvO' then 'yearly'
       else 'monthly'
     end,
     'stripe_price_id', e.metadata->>'price_id',
     'stripe_subscription_id', e.source_ref
   )
 where e.source = 'stripe'
   and e.status = 'active'
   and (e.metadata->>'tier' is null);

drop function if exists public.sync_billing_subscription_from_stripe(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text, boolean, text, timestamptz, jsonb
);

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
  p_entitlement_metadata jsonb,
  p_tier text default null,
  p_subscription_metadata jsonb default '{}'::jsonb
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
  v_meta jsonb;
begin
  if p_user_id is null or p_billing_customer_id is null or p_stripe_subscription_id is null then
    raise exception 'SYNC_ARGS_REQUIRED';
  end if;

  if p_tier is not null and p_tier not in ('start', 'growth', 'scale') then
    raise exception 'INVALID_TIER';
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
      tier,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      canceled_at,
      grace_until,
      latest_invoice_id,
      livemode,
      metadata,
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
      p_tier,
      p_status,
      p_current_period_start,
      p_current_period_end,
      coalesce(p_cancel_at_period_end, false),
      p_canceled_at,
      p_grace_until,
      p_latest_invoice_id,
      coalesce(p_livemode, false),
      coalesce(p_subscription_metadata, '{}'::jsonb),
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
        tier = excluded.tier,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = excluded.canceled_at,
        grace_until = excluded.grace_until,
        latest_invoice_id = excluded.latest_invoice_id,
        livemode = excluded.livemode,
        metadata = case
          when coalesce(p_subscription_metadata, '{}'::jsonb) = '{}'::jsonb then
            (coalesce(public.billing_subscriptions.metadata, '{}'::jsonb)
              - 'pending_tier' - 'pending_interval' - 'pending_effective_at')
          else coalesce(public.billing_subscriptions.metadata, '{}'::jsonb)
               || coalesce(p_subscription_metadata, '{}'::jsonb)
        end,
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
    when p_entitlement_status = 'active' then coalesce(v_ent.valid_from, v_now)
    else coalesce(v_ent.valid_from, v_now)
  end;

  v_meta := coalesce(p_entitlement_metadata, '{}'::jsonb);

  if v_ent.id is not null then
    update public.entitlements
       set user_id = p_user_id,
           status = p_entitlement_status,
           valid_from = v_valid_from,
           valid_until = p_entitlement_valid_until,
           metadata = v_meta,
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
      v_meta,
      v_now
    );
  end if;

  return jsonb_build_object('ok', true, 'code', 'SYNCED');
end;
$$;

revoke all on function public.sync_billing_subscription_from_stripe(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text, boolean, text, timestamptz, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.sync_billing_subscription_from_stripe(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  boolean, timestamptz, timestamptz, text, boolean, text, timestamptz, jsonb, text, jsonb
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
    'billing_warning', v_warning
  );
end;
$$;

revoke all on function public.get_my_entitlement_status() from public, anon;
grant execute on function public.get_my_entitlement_status() to authenticated;
grant execute on function public.get_my_entitlement_status() to service_role;
