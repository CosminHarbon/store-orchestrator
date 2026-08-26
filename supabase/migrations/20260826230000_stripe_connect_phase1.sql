-- Phase 1: Stripe Connect Standard (OAuth) + locked-down payment_integrations.
-- Does not change Netopia, checkout, convert_checkout_session_to_order, or cash-force.
--
-- PHASE 3 (do not create in this migration): stripe_webhook_events must include
-- processing_started_at timestamptz, set whenever a claim enters or re-enters
-- status = 'processing'. Stale in-flight detection MUST use processing_started_at,
-- never created_at. created_at is first-seen; processed_at is set only on succeeded.

-- =============================================================================
-- payment_integrations — server-owned connection state
-- Tenant is user_id (there is no store_id). Authenticated clients: SELECT only.
-- =============================================================================

create table public.payment_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('stripe')),
  enabled boolean not null default true,
  status text not null default 'disconnected'
    check (status in (
      'disconnected', 'pending_onboarding', 'restricted', 'connected'
    )),
  provider_account_id text,
  livemode boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  disabled_reason text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create unique index payment_integrations_stripe_account_uidx
  on public.payment_integrations (provider_account_id)
  where provider_account_id is not null;

create index payment_integrations_user_id_idx
  on public.payment_integrations (user_id);

comment on table public.payment_integrations is
  'Merchant payment-provider connections. Stripe rows are written only by Edge Functions using service_role after auth.uid() checks. Authenticated clients may SELECT their own row.';

alter table public.payment_integrations enable row level security;

create policy payment_integrations_select_own
  on public.payment_integrations
  for select
  using (user_id = auth.uid() or public.is_superadmin());

-- No INSERT / UPDATE / DELETE policies for authenticated or anon.

revoke all on table public.payment_integrations from public, anon, authenticated;
grant select on table public.payment_integrations to authenticated;
grant all on table public.payment_integrations to service_role;

-- =============================================================================
-- stripe_connect_states — one-time OAuth CSRF nonce. service_role only.
-- return_to is an allowlisted KEY, never an arbitrary URL.
-- =============================================================================

create table public.stripe_connect_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null unique,
  return_to text not null default 'app_payments'
    check (return_to in ('app_payments', 'native_ios', 'native_android')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index stripe_connect_states_user_id_idx
  on public.stripe_connect_states (user_id);

comment on table public.stripe_connect_states is
  'Single-use Stripe Connect OAuth state. Consumed atomically via consume_stripe_connect_state. No client access.';

alter table public.stripe_connect_states enable row level security;

revoke all on table public.stripe_connect_states from public, anon, authenticated;
grant all on table public.stripe_connect_states to service_role;

-- Atomic consume: matching state, unused, unexpired. One statement; no SELECT-then-UPDATE.
create or replace function public.consume_stripe_connect_state(p_state text)
returns public.stripe_connect_states
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.stripe_connect_states;
begin
  if p_state is null or length(trim(p_state)) = 0 then
    return null;
  end if;

  update public.stripe_connect_states
     set consumed_at = now()
   where state = p_state
     and consumed_at is null
     and expires_at > now()
  returning * into r;

  if not found then
    return null;
  end if;

  return r;
end;
$$;

revoke all on function public.consume_stripe_connect_state(text) from public, anon, authenticated;
grant execute on function public.consume_stripe_connect_state(text) to service_role;
