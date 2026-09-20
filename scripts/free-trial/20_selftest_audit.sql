-- Production-readiness audit additions. Runs after 10_selftest.sql (shares its fixtures/helpers).

-- ---------------------------------------------------------------- 12. paid vs "may use the app" semantics
do $$
declare n uuid := '00000000-0000-0000-0000-00000000b001';
begin
  perform test.check(not public.user_has_paid_entitlement(n), 'trial user is NOT a paid entitlement holder (subscriber checks stay false)');
  perform test.check(public.user_has_active_entitlement(n), 'user_has_active_entitlement (used by already-deployed Edge code) honours an active trial');
  perform test.check(public.user_has_paid_entitlement('00000000-0000-0000-0000-00000000c001'), 'paid user is a paid entitlement holder');
end $$;

-- ---------------------------------------------------------------- 13. exact expiration boundary
do $$
declare b uuid := '00000000-0000-0000-0000-00000000b101';
begin
  insert into auth.users (id, email) values (b, 'boundary@sv.test');
  update public.user_trials set trial_started_at = now() - interval '7 days', trial_ends_at = now() + interval '1 microsecond' where user_id = b;
  perform test.check(public.user_has_speedvendors_access(b), 'access 1 microsecond BEFORE trial_ends_at');
  update public.user_trials set trial_ends_at = now() where user_id = b;
  perform test.check(not public.user_has_speedvendors_access(b), 'no access AT trial_ends_at (end is exclusive)');
  perform test.check(public.compute_subscription_status(b) = 'trial_expired', 'status at the boundary is trial_expired');
  perform test.check((public.trial_status_json(b)->>'days_remaining')::int = 0
    and (public.trial_status_json(b)->>'seconds_remaining')::int = 0
    and not (public.trial_status_json(b)->>'is_trial_active')::boolean,
    'days/seconds remaining are 0 and not active at the boundary');
  update public.user_trials set trial_started_at = now() - interval '1 second', trial_ends_at = now() + interval '6 days 23 hours 59 minutes 59 seconds' where user_id = b;
  perform test.check((public.trial_status_json(b)->>'days_remaining')::int = 7, '6d23h59m59s remaining reports 7 days (ceil), never 0 while access is live');
  update public.user_trials set trial_ends_at = now() + interval '1 second' where user_id = b;
  perform test.check((public.trial_status_json(b)->>'days_remaining')::int = 1, '1 second remaining reports 1 day, not 0');
  -- leave b expired for the RPC-guard tests below
  update public.user_trials set trial_started_at = now() - interval '8 days', trial_ends_at = now() - interval '1 day' where user_id = b;
end $$;

-- ---------------------------------------------------------------- 14. no reset / no second trial
do $$
declare
  n uuid := '00000000-0000-0000-0000-00000000b001'; e1 timestamptz; e2 timestamptz; s1 timestamptz;
begin
  select trial_ends_at, trial_started_at into e1, s1 from public.user_trials where user_id = n;
  -- "logout / login / reinstall / new device" = fresh sessions calling the same server function
  perform test.as_user(n); perform public.get_my_trial_status(); perform test.as_superuser();
  perform test.as_user(n); perform public.get_my_trial_status(); perform public.get_my_trial_status(); perform test.as_superuser();
  select trial_ends_at into e2 from public.user_trials where user_id = n;
  perform test.check(e1 = e2 and (select trial_started_at from public.user_trials where user_id = n) = s1, 'repeated sessions/logins never move the trial window');
  begin
    insert into public.user_trials (user_id, trial_started_at, trial_ends_at, original_trial_ends_at) values (n, now(), now() + interval '7 days', now() + interval '7 days');
    raise exception 'second trial row accepted';
  exception when unique_violation then perform test.check(true, 'a user can never hold two trial rows (PK)'); end;
  update auth.users set email = 'newbie2@sv.test' where id = n;
  perform test.check((select trial_ends_at from public.user_trials where user_id = n) = e1, 'email change does not touch the trial');
  -- the user cannot reset it themselves
  perform test.as_user(n);
  begin
    delete from public.user_trials where user_id = n;
    raise exception 'merchant delete succeeded';
  exception when insufficient_privilege then perform test.check(true, 'merchant cannot delete their own trial'); end;
  perform test.as_superuser();
end $$;

-- ---------------------------------------------------------------- 15. healing never grants time back
do $$
declare h uuid := '00000000-0000-0000-0000-00000000b201'; res jsonb; old_cutover timestamptz;
begin
  select trial_program_started_at into old_cutover from public.billing_settings where id = 1;
  update public.billing_settings set trial_program_started_at = now() - interval '30 days' where id = 1;
  insert into auth.users (id, email, created_at) values (h, 'healme@sv.test', now() - interval '10 days');
  delete from public.user_trials where user_id = h;      -- simulate a missed trigger
  perform test.as_user(h);
  res := public.get_my_trial_status();
  perform test.as_superuser();
  perform test.check((res->>'has_trial')::boolean and (res->>'subscription_status') = 'trial_expired',
    'healed trial is anchored to account creation: a 10-day-old account is expired, not given a fresh 7 days');
  perform test.check(not public.user_has_speedvendors_access(h), 'healed expired user is locked');
  update public.billing_settings set trial_program_started_at = old_cutover where id = 1;
end $$;

-- ---------------------------------------------------------------- 16. malformed / missing state
do $$
declare bad boolean;
begin
  bad := false;
  begin insert into public.user_trials (user_id, trial_started_at, trial_ends_at, original_trial_ends_at)
    values ('00000000-0000-0000-0000-00000000b001', now(), now() - interval '1 day', now());
  exception when others then bad := true; end;
  perform test.check(bad, 'constraints reject a trial that ends before it starts');
  bad := false;
  begin update public.user_trials set subscription_status = 'bogus' where user_id = '00000000-0000-0000-0000-00000000b001';
  exception when check_violation then bad := true; end;
  perform test.check(bad, 'constraint rejects an unknown subscription_status');
  bad := false;
  begin update public.user_trials set trial_ends_at = null where user_id = '00000000-0000-0000-0000-00000000b001';
  exception when not_null_violation then bad := true; end;
  perform test.check(bad, 'NULL trial_ends_at is impossible');
  perform test.check(public.compute_subscription_status('00000000-0000-0000-0000-0000000000ff') is null, 'unknown user has null status (no exception)');
  perform test.check(not public.user_has_speedvendors_access(null), 'NULL user id has no access');
  update public.billing_settings set enforcement_enabled = true where id = 1;
  perform test.check(not public.user_has_speedvendors_access('00000000-0000-0000-0000-0000000000ff'), 'unknown user is locked when enforcement is on');
  update public.billing_settings set enforcement_enabled = false where id = 1;
end $$;

-- ---------------------------------------------------------------- 17. signup must survive a broken trial table
do $$
declare s uuid := '00000000-0000-0000-0000-00000000b301';
begin
  alter table public.user_trials rename to user_trials_broken;
  insert into auth.users (id, email) values (s, 'signup-survives@sv.test');
  perform test.check(exists (select 1 from auth.users where id = s), 'signup still succeeds when trial creation fails (warning only)');
  alter table public.user_trials_broken rename to user_trials;
end $$;

-- ---------------------------------------------------------------- 18. privileges
do $$
declare fn text; denied boolean;
begin
  foreach fn in array array[
    'public.user_has_speedvendors_access(uuid)', 'public.user_has_paid_entitlement(uuid)', 'public.user_has_active_entitlement(uuid)',
    'public.user_has_active_trial(uuid)', 'public.compute_subscription_status(uuid)', 'public.refresh_user_trial_status(uuid)',
    'public.sync_trial_statuses(boolean)', 'public.claim_due_trial_reminders(integer)', 'public.complete_trial_reminder(uuid,text,jsonb)',
    'public.trial_status_json(uuid)', 'public.count_user_rows(uuid)', 'public.admin_archive_account_for_deletion(uuid,uuid)']
  loop
    perform test.check(not has_function_privilege('authenticated', fn, 'execute') and not has_function_privilege('anon', fn, 'execute'), 'not executable by authenticated/anon: ' || fn);
    perform test.check(has_function_privilege('service_role', fn, 'execute'), 'executable by service_role: ' || fn);
  end loop;
  perform test.check(not has_function_privilege('anon', 'public.get_my_trial_status()', 'execute'), 'anon cannot call get_my_trial_status');
  perform test.check(not has_function_privilege('anon', 'public.admin_list_trials(text,text,text,integer,integer)', 'execute'), 'anon cannot call admin_list_trials');
  perform test.check(not has_function_privilege('anon', 'public.admin_extend_trial(uuid,integer,timestamptz,text)', 'execute'), 'anon cannot call admin_extend_trial');
  perform test.check(has_function_privilege('authenticated', 'public.get_my_trial_status()', 'execute'), 'authenticated can call get_my_trial_status');
  perform test.as_user('00000000-0000-0000-0000-00000000a002');
  denied := false; begin perform public.user_has_speedvendors_access('00000000-0000-0000-0000-00000000b001'); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot probe another user''s access via user_has_speedvendors_access');
  denied := false; begin perform public.trial_status_json('00000000-0000-0000-0000-00000000b001'); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot read another user''s trial via trial_status_json');
  perform test.check((select count(*) from public.user_trials where user_id <> auth.uid()) = 0, 'merchant cannot see other users'' trial rows (RLS)');
  perform test.as_superuser();
end $$;

-- ---------------------------------------------------------------- 19. Stripe webhook path (service_role) drives status
do $$
declare w uuid := '00000000-0000-0000-0000-00000000b401'; cust uuid;
begin
  insert into auth.users (id, email) values (w, 'webhook@sv.test');
  update public.user_trials set trial_started_at = now() - interval '9 days', trial_ends_at = now() - interval '2 days' where user_id = w;
  perform public.refresh_user_trial_status(w);
  perform test.check((select subscription_status from public.user_trials where user_id = w) = 'trial_expired', 'precondition: expired trial user');
  perform set_config('role', 'service_role', true);
  insert into public.billing_customers (user_id, stripe_customer_id) values (w, 'cus_wh') returning id into cust;
  insert into public.billing_subscriptions (user_id, billing_customer_id, stripe_subscription_id, plan, tier, status) values (w, cust, 'sub_wh', 'yearly', 'growth', 'active');
  insert into public.entitlements (user_id, source, status, source_ref) values (w, 'stripe', 'active', 'sub_wh');
  perform test.as_superuser();
  perform test.check((select subscription_status from public.user_trials where user_id = w) = 'active', 'service_role webhook writes flip the status (trigger fires without EXECUTE grants)');
  perform test.check(public.user_has_speedvendors_access(w), 'expired trial user regains access the instant the subscription is written');
  update public.billing_subscriptions set status = 'canceled' where stripe_subscription_id = 'sub_wh';
  update public.entitlements set status = 'expired' where source_ref = 'sub_wh';
  perform test.check((select subscription_status from public.user_trials where user_id = w) = 'cancelled' and not public.user_has_speedvendors_access(w),
    'cancelling after the trial is over locks again and reports cancelled');
end $$;

-- ---------------------------------------------------------------- 20. write RPCs that bypass RLS are guarded
do $$
declare denied boolean; ex uuid := '00000000-0000-0000-0000-00000000b101'; tr uuid := '00000000-0000-0000-0000-00000000b001';
begin
  perform test.check(position('assert_entitlement_if_end_user' in pg_get_functiondef('public.bulk_update_stock(jsonb)'::regprocedure)) > 0
    and position('assert_entitlement_if_end_user' in pg_get_functiondef('public.save_product_variants(uuid,jsonb)'::regprocedure)) > 0
    and position('assert_entitlement_if_end_user' in pg_get_functiondef('public.return_order_items(uuid,jsonb,boolean,boolean,text)'::regprocedure)) > 0
    and position('assert_entitlement_if_end_user' in pg_get_functiondef('public.restore_order_stock(uuid,boolean)'::regprocedure)) > 0,
    'guard injected into all four write RPCs');
  perform test.check((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.bulk_update_stock(jsonb)'::regprocedure),
    'bulk_update_stock keeps SECURITY DEFINER and empty search_path');
  perform test.check((select prosecdef and proconfig = array['search_path=public'] from pg_proc where oid = 'public.save_product_variants(uuid,jsonb)'::regprocedure),
    'save_product_variants keeps SECURITY DEFINER and search_path');
  perform test.check(has_function_privilege('anon', 'public.bulk_update_stock(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.save_product_variants(uuid,jsonb)', 'execute'), 'existing grants are preserved by the rewrite');

  perform test.as_user(ex);
  denied := false; begin perform public.bulk_update_stock('[]'::jsonb); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'expired user blocked: bulk_update_stock');
  denied := false; begin perform public.save_product_variants(gen_random_uuid(), '{}'::jsonb); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'expired user blocked: save_product_variants');
  denied := false; begin perform public.return_order_items(gen_random_uuid(), '[]'::jsonb, false, false, null); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'expired user blocked: return_order_items');
  denied := false; begin perform public.restore_order_stock(gen_random_uuid(), false); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'expired user blocked: restore_order_stock');
  perform test.as_superuser();

  perform test.as_user(tr);
  perform public.bulk_update_stock('[]'::jsonb);
  perform public.save_product_variants(gen_random_uuid(), '{}'::jsonb);
  perform public.return_order_items(gen_random_uuid(), '[]'::jsonb, false, false, null);
  perform public.restore_order_stock(gen_random_uuid(), false);
  perform test.check(true, 'active-trial user can call all four write RPCs');
  perform test.as_superuser();

  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  perform public.restore_order_stock(gen_random_uuid(), false);
  perform test.check(true, 'service_role (store-api / webhooks) is unaffected by the guard');
  perform test.as_superuser();

  perform set_config('role', 'anon', true);
  perform public.bulk_update_stock('[]'::jsonb);
  perform test.check(true, 'anonymous caller behaviour unchanged (no regression for existing callers)');
  perform test.as_superuser();

  perform test.as_user('00000000-0000-0000-0000-00000000a001', 'aal2');
  perform public.save_product_variants(gen_random_uuid(), '{}'::jsonb);
  perform test.check(true, 'superadmin bypasses the guard');
  perform test.as_superuser();
end $$;

-- ---------------------------------------------------------------- 21. archive covers order_returns
do $$
declare d uuid := '00000000-0000-0000-0000-00000000f101'; o uuid; res jsonb;
begin
  insert into auth.users (id, email) values (d, 'gone2@sv.test');
  insert into public.orders (user_id, customer_name, payment_status, invoice_number) values (d, 'X', 'paid', 'SV-9') returning id into o;
  insert into public.order_returns (order_id, user_id, notes) values (o, d, 'partial return');
  res := public.admin_archive_account_for_deletion(d, '00000000-0000-0000-0000-00000000a001');
  perform test.check((res->>'order_returns')::int = 1, 'order_returns are archived before deletion');
  delete from auth.users where id = d;
  perform test.check((select order_returns->0->>'notes' from public.deleted_account_archive where deleted_user_id = d) = 'partial return', 'archived return survives the cascade');
end $$;

-- ---------------------------------------------------------------- 22. full lifecycle in one place
do $$
declare u uuid := '00000000-0000-0000-0000-00000000e501'; cust uuid; s jsonb;
begin
  insert into auth.users (id, email) values (u, 'lifecycle@sv.test');
  insert into public.profiles (user_id, store_name) values (u, 'Lifecycle Store');
  perform test.as_user(u);
  s := public.get_my_trial_status();
  perform test.check(s->>'subscription_status' = 'trialing' and public.has_speedvendors_access(), 'day 0: trialing with access');
  insert into public.products (user_id, name) values (u, 'first product');
  perform test.as_superuser();
  update public.user_trials set trial_started_at = now() - interval '7 days 1 second', trial_ends_at = now() - interval '1 second' where user_id = u;
  perform test.as_user(u);
  s := public.get_my_trial_status();
  perform test.check(s->>'subscription_status' = 'trial_expired' and not public.has_speedvendors_access(), 'day 7: expired and locked');
  perform test.check((select count(*) from public.products where user_id = u) = 1, 'day 7: existing data still readable');
  perform test.as_superuser();
  insert into public.billing_customers (user_id, stripe_customer_id) values (u, 'cus_life') returning id into cust;
  insert into public.billing_subscriptions (user_id, billing_customer_id, stripe_subscription_id, plan, tier, status) values (u, cust, 'sub_life', 'monthly', 'start', 'active');
  insert into public.entitlements (user_id, source, status, source_ref) values (u, 'stripe', 'active', 'sub_life');
  perform test.as_user(u);
  s := public.get_my_trial_status();
  perform test.check(s->>'subscription_status' = 'active' and public.has_speedvendors_access(), 'after paying: active and unlocked');
  perform test.check((public.get_my_entitlement_status()->>'has_entitlement')::boolean, 'after paying: has_entitlement true');
  insert into public.products (user_id, name) values (u, 'second product');
  perform test.check(true, 'after paying: writes work again');
  perform test.as_superuser();
end $$;
