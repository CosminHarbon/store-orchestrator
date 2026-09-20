-- Free-trial SQL self-test. Every check raises on failure (ON_ERROR_STOP aborts the run).
-- Runs after 00_stubs.sql + billing migration + 20260920120000_free_trial_system.sql.

create schema test;
grant usage on schema test to public;

create function test.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'aal', p_aal, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function test.as_superuser() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function test.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'ok   - %', p_msg;
end $$;

-- Merchant write guards, same shape as 20260829070000_billing_enforcement_write_guards.sql
create policy entitlement_required_insert on public.products as restrictive
  for insert to authenticated with check (public.has_speedvendors_access());
create policy entitlement_required_update on public.products as restrictive
  for update to authenticated using (public.has_speedvendors_access()) with check (public.has_speedvendors_access());
create policy entitlement_required_delete on public.products as restrictive
  for delete to authenticated using (public.has_speedvendors_access());

-- Fixed identities
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('00000000-0000-0000-0000-00000000a001', 'admin@sv.test', '{}', now() - interval '90 days'),
  ('00000000-0000-0000-0000-00000000a002', 'merchant@sv.test', '{"full_name":"Mara Merchant"}', now() - interval '90 days');
delete from public.user_trials;   -- the two above pre-date the program: no trial
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000a001', 'superadmin');

-- ---------------------------------------------------------------- 1. new user gets a 7-day trial
do $$
declare n uuid := '00000000-0000-0000-0000-00000000b001'; t public.user_trials;
begin
  insert into auth.users (id, email) values (n, 'newbie@sv.test');
  insert into public.profiles (user_id, store_name) values (n, 'Newbie Boutique');
  select * into t from public.user_trials where user_id = n;
  perform test.check(t.user_id is not null, 'new user receives a trial row via trigger');
  perform test.check(t.trial_ends_at - t.trial_started_at = interval '7 days', 'trial lasts exactly 7 days');
  perform test.check(t.trial_started_at = (select created_at from auth.users where id = n), 'trial starts at account creation');
  perform test.check(t.subscription_status = 'trialing', 'initial status is trialing');
end $$;

-- ---------------------------------------------------------------- 2. trial user has full access
do $$
declare n uuid := '00000000-0000-0000-0000-00000000b001'; rc int;
begin
  perform test.as_user(n);
  perform test.check(public.has_speedvendors_access(), 'trial user has access');
  insert into public.products (user_id, name) values (n, 'Trial product');
  update public.products set name = 'Renamed' where user_id = n;
  perform test.check((select count(*) from public.products where user_id = n) = 1, 'trial user can write merchant data (RLS write guard passes)');
  perform test.check((public.get_my_entitlement_status()->>'has_access')::boolean, 'entitlement status has_access = true');
  perform test.check(not (public.get_my_entitlement_status()->>'has_entitlement')::boolean,
    'trial is NOT a paid entitlement (subscribe page still sees user as unsubscribed)');
  perform test.check(public.get_my_entitlement_status()->'active_sources' ? 'trial', 'active_sources reports trial');
  perform test.check(public.get_my_trial_status()->>'subscription_status' = 'trialing'
    and (public.get_my_trial_status()->>'days_remaining')::int = 7, 'get_my_trial_status: trialing, 7 days');
  perform test.as_superuser();
end $$;

-- ---------------------------------------------------------------- 3. legacy user unchanged
do $$
declare l uuid := '00000000-0000-0000-0000-00000000a002';
begin
  perform test.as_user(l);
  perform test.check(public.get_my_trial_status()->>'has_trial' = 'false', 'legacy user is NOT lazily granted a trial');
  perform test.check(public.has_speedvendors_access(), 'legacy user keeps access while enforcement is off');
  perform test.as_superuser();
  perform test.check(not exists (select 1 from public.user_trials where user_id = l), 'no trial row created for legacy user');
  update public.billing_settings set enforcement_enabled = true where id = 1;
  perform test.as_user(l);
  perform test.check(not public.has_speedvendors_access(), 'legacy behaviour with enforcement ON is unchanged (locked without entitlement)');
  perform test.as_superuser();
  update public.billing_settings set enforcement_enabled = false where id = 1;
end $$;

-- ---------------------------------------------------------------- 4. paid user unchanged / converted
do $$
declare
  p uuid := '00000000-0000-0000-0000-00000000c001'; cust uuid; t public.user_trials;
begin
  insert into auth.users (id, email) values (p, 'payer@sv.test');
  insert into public.billing_customers (user_id, stripe_customer_id) values (p, 'cus_test1') returning id into cust;
  insert into public.billing_subscriptions (user_id, billing_customer_id, stripe_subscription_id, plan, tier, status)
    values (p, cust, 'sub_test1', 'monthly', 'start', 'active');
  insert into public.entitlements (user_id, source, status, source_ref) values (p, 'stripe', 'active', 'sub_test1');
  select * into t from public.user_trials where user_id = p;
  perform test.check(t.subscription_status = 'active', 'billing trigger flips status to active on subscription');
  perform test.check(t.converted_at is not null, 'converted_at recorded on first Stripe subscription');
  perform test.as_user(p);
  perform test.check(public.has_speedvendors_access(), 'paid user has access');
  perform test.check((public.get_my_entitlement_status()->>'has_entitlement')::boolean, 'paid user still reports has_entitlement');
  perform test.as_superuser();
  -- paid user with no trial row at all (legacy payer) is untouched
  insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000c002', 'oldpayer@sv.test', now() - interval '200 days');
  delete from public.user_trials where user_id = '00000000-0000-0000-0000-00000000c002';
  insert into public.entitlements (user_id, source, status) values ('00000000-0000-0000-0000-00000000c002', 'access_code', 'active');
  perform test.check(not exists (select 1 from public.user_trials where user_id = '00000000-0000-0000-0000-00000000c002'),
    'entitlement trigger does not create trials for legacy paid users');
end $$;

-- ---------------------------------------------------------------- 5. reminders: once per milestone
do $$
declare r uuid := '00000000-0000-0000-0000-00000000d001'; c1 int; c2 int; m text;
begin
  insert into auth.users (id, email) values (r, 'remind@sv.test');
  -- 3-day window
  update public.user_trials set trial_started_at = now() - interval '4 days', trial_ends_at = now() + interval '71 hours' where user_id = r;
  select count(*), max(milestone_key) into c1, m from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c1 = 1 and m = '3d', '3-day reminder is claimed');
  select count(*) into c2 from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c2 = 0, '3-day reminder is NOT claimed a second time');
  -- 1-day window
  update public.user_trials set trial_ends_at = now() + interval '40 hours' where user_id = r;
  select count(*), max(milestone_key) into c1, m from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c1 = 1 and m = '1d', '1-day reminder is claimed');
  select count(*) into c2 from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c2 = 0, '1-day reminder is NOT claimed a second time');
  -- final day
  update public.user_trials set trial_ends_at = now() + interval '10 hours' where user_id = r;
  select count(*), max(milestone_key) into c1, m from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c1 = 1 and m = 'final', 'final-day reminder is claimed');
  select count(*) into c2 from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c2 = 0, 'final-day reminder is NOT claimed a second time');
  -- expired
  update public.user_trials set trial_ends_at = now() - interval '1 hour' where user_id = r;
  select count(*), max(milestone_key) into c1, m from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c1 = 1 and m = 'expired', 'expiry reminder is claimed');
  perform test.check((select subscription_status from public.user_trials where user_id = r) = 'trial_expired',
    'trial flips to trial_expired via sweeper');
  select count(*) into c2 from public.claim_due_trial_reminders() where target_user_id = r;
  perform test.check(c2 = 0, 'expiry reminder is NOT claimed a second time');
  -- hard duplicate guard at the constraint level (defends against concurrent cron runs)
  begin
    insert into public.trial_reminders (user_id, milestone, trial_ends_at, trigger_source)
      select user_id, milestone, trial_ends_at, 'cron' from public.trial_reminders where user_id = r and milestone = 'final';
    raise exception 'duplicate insert unexpectedly succeeded';
  exception when unique_violation then
    perform test.check(true, 'unique index rejects a duplicate cron reminder');
  end;
  -- manual reminders are separate and never consume the automatic milestone
  insert into public.trial_reminders (user_id, milestone, trial_ends_at, trigger_source)
    select user_id, 'expired', trial_ends_at, 'manual' from public.user_trials where user_id = r;
  perform test.check(true, 'manual reminder allowed alongside the automatic one');
  -- a converted user is never nagged
  update public.user_trials set subscription_status = 'active', trial_ends_at = now() + interval '10 hours' where user_id = '00000000-0000-0000-0000-00000000c001';
  perform test.check(not exists (select 1 from public.claim_due_trial_reminders() where target_user_id = '00000000-0000-0000-0000-00000000c001'),
    'converted user gets no trial reminders');
end $$;

-- ---------------------------------------------------------------- 6/7. expired user: login yes, writes no, then subscribes
do $$
declare
  r uuid := '00000000-0000-0000-0000-00000000d001'; cust uuid; blocked boolean := false;
begin
  perform test.check(exists (select 1 from auth.users where id = r), 'expired user still exists / can log in');
  perform test.as_user(r);
  perform test.check(not public.has_speedvendors_access(), 'expired trial user is locked even though enforcement flag is OFF');
  perform test.check(public.get_my_trial_status()->>'subscription_status' = 'trial_expired', 'status: trial_expired');
  perform test.check((select count(*) from public.user_trials where user_id = r) = 1, 'expired user can still read own trial row');
  perform test.check(not (public.get_my_entitlement_status()->>'has_access')::boolean, 'entitlement status has_access = false');
  begin
    insert into public.products (user_id, name) values (r, 'Should be blocked');
  exception when insufficient_privilege then blocked := true; end;
  perform test.check(blocked, 'expired user cannot write (RLS write guard)');
  perform test.as_superuser();
  -- existing data survives expiry
  insert into public.products (user_id, name) values (r, 'Pre-existing product');
  perform test.as_user(r);
  perform test.check((select count(*) from public.products where user_id = r) = 1, 'expired user can still read existing data');
  perform test.as_superuser();
  -- subscribe (what the Stripe webhook does)
  insert into public.billing_customers (user_id, stripe_customer_id) values (r, 'cus_test2') returning id into cust;
  insert into public.billing_subscriptions (user_id, billing_customer_id, stripe_subscription_id, plan, tier, status)
    values (r, cust, 'sub_test2', 'monthly', 'growth', 'active');
  insert into public.entitlements (user_id, source, status, source_ref) values (r, 'stripe', 'active', 'sub_test2');
  perform test.as_user(r);
  perform test.check(public.has_speedvendors_access(), 'subscribing unlocks access immediately');
  insert into public.products (user_id, name) values (r, 'Post-subscribe product');
  perform test.check(true, 'subscribed user can write again');
  perform test.as_superuser();
  perform test.check((select subscription_status from public.user_trials where user_id = r) = 'active', 'status becomes active');
end $$;

-- ---------------------------------------------------------------- 8. superadmin visibility + isolation
do $$
declare
  adm uuid := '00000000-0000-0000-0000-00000000a001'; mer uuid := '00000000-0000-0000-0000-00000000a002';
  ex uuid := '00000000-0000-0000-0000-00000000e001'; cnt int; s jsonb; denied boolean; o jsonb;
begin
  insert into auth.users (id, email) values (ex, 'expired@sv.test');
  insert into public.profiles (user_id, store_name) values (ex, 'Expired Shop');
  update public.user_trials set trial_started_at = now() - interval '10 days', trial_ends_at = now() - interval '3 days' where user_id = ex;

  perform test.as_user(adm, 'aal2');
  select count(*) into cnt from public.admin_list_trials('active');
  perform test.check(cnt >= 1 and not exists (select 1 from public.admin_list_trials('active') where subscription_status <> 'trialing'), 'superadmin sees active trials');
  perform test.check(exists (select 1 from public.admin_list_trials('expired') where user_id = ex), 'superadmin sees expired trials');
  perform test.check(exists (select 1 from public.admin_list_trials('converted') where email = 'payer@sv.test'), 'superadmin sees converted subscribers');
  perform test.check((select count(*) from public.admin_list_trials('all', 'expired shop')) = 1, 'search by store name');
  perform test.check((select count(*) from public.admin_list_trials('all', 'EXPIRED@sv')) = 1, 'search by email (case-insensitive)');
  perform test.check((select count(*) from public.admin_list_trials('all', '%')) = 0, 'search escapes LIKE wildcards');
  perform test.check((select email from public.admin_list_trials('all', null, 'ending_soon', 1)) is not null
    and (select subscription_status from public.admin_list_trials('all', null, 'ending_soon', 1)) = 'trialing', 'ending_soon sort puts active trials first');
  perform test.check(not exists (select 1 from public.admin_list_trials('all') where user_id = adm), 'superadmins are excluded from the trials list');
  s := public.admin_trial_summary();
  perform test.check((s->>'expired_trials')::int >= 1 and (s->>'active_trials')::int >= 1 and (s->>'converted_to_paid')::int >= 1, 'summary counts');
  perform test.check((s->>'conversion_rate')::numeric between 0 and 100, 'conversion rate is a percentage');
  o := public.admin_get_user_overview(ex);
  perform test.check(o->'account'->>'email' = 'expired@sv.test' and o->'merchant'->>'store_name' = 'Expired Shop', 'user overview returns account + merchant');

  -- extend +3 days on an EXPIRED trial: from now(), reactivates
  perform public.admin_extend_trial(ex, 3, null, 'support goodwill');
  perform test.as_superuser();
  perform test.check((select subscription_status from public.user_trials where user_id = ex) = 'trialing', 'extending an expired trial reactivates it');
  perform test.check((select trial_ends_at from public.user_trials where user_id = ex) between now() + interval '71 hours' and now() + interval '73 hours',
    '+3 days counts from now for an expired trial');
  perform test.check(public.user_has_speedvendors_access(ex), 'extended user regains access');

  -- extend +7 on an ACTIVE trial: from the current end, not from now
  perform test.as_user(adm, 'aal2');
  perform public.admin_extend_trial(ex, 7);
  perform test.as_superuser();
  perform test.check((select trial_ends_at from public.user_trials where user_id = ex) between now() + interval '10 days' - interval '1 hour' and now() + interval '10 days' + interval '1 hour',
    '+7 days stacks on the current end date');

  -- custom date
  perform test.as_user(adm, 'aal2');
  perform public.admin_extend_trial(ex, null, now() + interval '30 days');
  perform test.as_superuser();
  perform test.check((select extended_count from public.user_trials where user_id = ex) = 3, 'extension count tracked');

  -- audit rows
  perform test.check((select count(*) from public.admin_audit_log where action = 'trial_extended' and target_user_id = ex and admin_user_id = adm and target_email = 'expired@sv.test') = 3,
    'audit log has one row per extension with admin, target, email');
  perform test.check(exists (select 1 from public.admin_audit_log where target_user_id = ex and metadata->>'reason' = 'support goodwill'), 'audit metadata carries reason');

  -- validation
  perform test.as_user(adm, 'aal2');
  begin perform public.admin_extend_trial(ex, null, now() - interval '1 day'); raise exception 'past date accepted';
  exception when sqlstate '22023' then perform test.check(true, 'custom date in the past rejected'); end;
  begin perform public.admin_extend_trial(ex, null, now() + interval '2 days'); raise exception 'shortening accepted';
  exception when sqlstate '22023' then perform test.check(true, 'shortening via custom date rejected'); end;
  begin perform public.admin_extend_trial(ex, 3, now() + interval '90 days'); raise exception 'both accepted';
  exception when sqlstate '22023' then perform test.check(true, 'both p_days and p_new_end rejected'); end;
  begin perform public.admin_extend_trial(adm, 3); raise exception 'superadmin extended';
  exception when sqlstate '22023' then perform test.check(true, 'cannot extend a superadmin'); end;

  -- explicit trial for a legacy user (audited)
  perform public.admin_extend_trial(mer, 7, null, 'explicit grant');
  perform test.as_superuser();
  perform test.check((select source from public.user_trials where user_id = mer) = 'admin', 'admin can explicitly grant a legacy user a trial');
  perform test.check((select (metadata->>'created_trial')::boolean from public.admin_audit_log where target_user_id = mer), 'grant is audited as created_trial');

  -- non-superadmin: everything denied
  perform test.as_user(mer);
  denied := false; begin perform * from public.admin_list_trials(); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot list trials');
  denied := false; begin perform public.admin_trial_summary(); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot read trial summary');
  denied := false; begin perform public.admin_extend_trial(ex, 30); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot extend a trial');
  denied := false; begin perform public.admin_get_user_overview(ex); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot read user overview');
  perform test.check((select count(*) from public.admin_audit_log) = 0, 'merchant sees no audit rows (RLS)');
  perform test.check((select count(*) from public.user_trials) = 1, 'merchant sees only their own trial row (RLS)');
  denied := false; begin insert into public.admin_audit_log (admin_user_id, action) values (mer, 'forged'); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot forge audit rows');
  denied := false; begin update public.user_trials set trial_ends_at = now() + interval '3650 days' where user_id = mer; exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'merchant cannot edit their own trial');
  perform test.as_superuser();

  -- superadmin WITHOUT MFA (aal1) is refused too
  perform test.as_user(adm, 'aal1');
  denied := false; begin perform * from public.admin_list_trials(); exception when insufficient_privilege then denied := true; end;
  perform test.check(denied, 'superadmin at aal1 (no MFA) is refused');
  perform test.as_superuser();
end $$;

-- ---------------------------------------------------------------- 9. audit log is append-only
do $$
begin
  begin update public.admin_audit_log set action = 'tampered'; raise exception 'update allowed';
  exception when insufficient_privilege then perform test.check(true, 'audit log rejects UPDATE'); end;
  begin delete from public.admin_audit_log; raise exception 'delete allowed';
  exception when insufficient_privilege then perform test.check(true, 'audit log rejects DELETE'); end;
end $$;

-- ---------------------------------------------------------------- 10. deletion archive retains financial records
do $$
declare
  d uuid := '00000000-0000-0000-0000-00000000f001'; o1 uuid; o2 uuid; res jsonb;
begin
  insert into auth.users (id, email) values (d, 'gone@sv.test');
  insert into public.profiles (user_id, store_name) values (d, 'Gone Store');
  insert into public.orders (user_id, customer_name, payment_status, invoice_number) values (d, 'Cust A', 'paid', 'SV-001') returning id into o1;
  insert into public.orders (user_id, customer_name, payment_status) values (d, 'Cust B', 'pending') returning id into o2;
  insert into public.order_items (order_id) values (o1), (o2);
  insert into public.payment_transactions (order_id, amount) values (o1, 99);
  insert into public.products (user_id, name) values (d, 'p');
  perform test.check((public.count_user_rows(d)->>'orders')::int = 2, 'count_user_rows reports rows across user_id tables');
  res := public.admin_archive_account_for_deletion(d, '00000000-0000-0000-0000-00000000a001');
  perform test.check((res->>'orders')::int = 1 and (res->>'order_items')::int = 1 and (res->>'payment_transactions')::int = 1,
    'archive keeps only the paid/invoiced order with its items and payments');
  delete from auth.users where id = d;   -- what auth.admin.deleteUser cascades to
  perform test.check(not exists (select 1 from public.orders where user_id = d) and not exists (select 1 from public.profiles where user_id = d),
    'live merchant data is removed by the cascade');
  perform test.check((select orders->0->>'invoice_number' from public.deleted_account_archive where deleted_user_id = d) = 'SV-001',
    'invoiced order survives in the archive after deletion');
  perform test.check(public.count_user_rows(d) = '{}'::jsonb, 'no rows left behind for the deleted user');
  insert into public.admin_audit_log (admin_user_id, action, target_user_id, target_email, metadata)
    values ('00000000-0000-0000-0000-00000000a001', 'user_deleted', d, 'gone@sv.test', '{}');
  perform test.check(exists (select 1 from public.admin_audit_log where target_user_id = d), 'audit row survives deletion of its target (no FK)');
  -- archive is not readable by merchants / admins through the API roles
  perform test.as_user('00000000-0000-0000-0000-00000000a002');
  begin perform 1 from public.deleted_account_archive; raise exception 'archive readable';
  exception when insufficient_privilege then perform test.check(true, 'archive not readable by authenticated role'); end;
  perform test.as_superuser();
end $$;

-- ---------------------------------------------------------------- 11. migration idempotence facts
do $$
begin
  perform test.check((select trial_program_started_at from public.billing_settings where id = 1) is not null, 'cutover recorded');
  perform test.check((select count(*) from public.user_trials t join auth.users u on u.id = t.user_id where t.source = 'signup' and u.created_at < (select trial_program_started_at from public.billing_settings where id = 1)) = 0,
    'no signup trial pre-dates the cutover (nobody was back-filled)');
end $$;
