-- Canonical enforcement remains billing_settings.enforcement_enabled (DB).
-- Edge env BILLING_ENFORCEMENT_ENABLED may only force OFF.
-- has_speedvendors_access() already no-ops when the DB flag is false.

create or replace function public.assert_speedvendors_entitlement()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.has_speedvendors_access() then
    raise exception 'entitlement_required' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_speedvendors_entitlement() is
  'No-op while billing_settings.enforcement_enabled is false. Raises entitlement_required when enforcement is on and the caller is not entitled (superadmin bypasses).';

revoke all on function public.assert_speedvendors_entitlement() from public, anon;
grant execute on function public.assert_speedvendors_entitlement() to authenticated, service_role;

comment on column public.billing_settings.enforcement_enabled is
  'Canonical runtime switch for SpeedVendors billing enforcement. Edge env BILLING_ENFORCEMENT_ENABLED can only force this OFF, never independently ON.';

-- Restrictive write policies: AND with existing permissive owner policies.
-- service_role (store-api, webhooks, Connect) bypasses RLS.
do $$
declare
  t text;
  tables text[] := array[
    'products',
    'collections',
    'discounts',
    'reviews',
    'orders',
    'delivery_pricing_settings',
    'delivery_pricing_rules',
    'delivery_order_value_rules',
    'template_customization',
    'template_blocks',
    'ai_storefronts',
    'ai_conversations',
    'ai_messages',
    'payment_integrations'
  ];
begin
  foreach t in array tables
  loop
    execute format('drop policy if exists entitlement_required_insert on public.%I', t);
    execute format('drop policy if exists entitlement_required_update on public.%I', t);
    execute format('drop policy if exists entitlement_required_delete on public.%I', t);

    execute format(
      'create policy entitlement_required_insert on public.%I as restrictive for insert to authenticated with check (public.has_speedvendors_access())',
      t
    );
    execute format(
      'create policy entitlement_required_update on public.%I as restrictive for update to authenticated using (public.has_speedvendors_access()) with check (public.has_speedvendors_access())',
      t
    );
    execute format(
      'create policy entitlement_required_delete on public.%I as restrictive for delete to authenticated using (public.has_speedvendors_access())',
      t
    );
  end loop;
end;
$$;
