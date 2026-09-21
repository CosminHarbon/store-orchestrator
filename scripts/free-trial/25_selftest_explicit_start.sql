-- Explicit-start rules for start_free_trial(). Runs after 10 / 20 (shares their fixtures + helpers).

do $$
declare
  pd uuid := '00000000-0000-0000-0000-00000000aa01';   -- already a paying customer
  expired uuid := '00000000-0000-0000-0000-00000000b101'; -- boundary fixture: trial consumed and expired
  adm uuid := '00000000-0000-0000-0000-00000000a001';
  gr uuid := '00000000-0000-0000-0000-00000000aa02';   -- trial granted by a superadmin
  r jsonb;
begin
  perform test.check((select pronargs from pg_proc where proname = 'start_free_trial' and pronamespace = 'public'::regnamespace) = 0,
    'start_free_trial takes NO arguments: the client cannot supply start/end timestamps');
  perform test.check(has_function_privilege('authenticated', 'public.start_free_trial()', 'execute') and not has_function_privilege('anon', 'public.start_free_trial()', 'execute'),
    'only signed-in users can call start_free_trial');

  -- a subscriber cannot start a trial
  insert into auth.users (id, email, email_confirmed_at) values (pd, 'already-paid@sv.test', now());
  insert into public.entitlements (user_id, source, status) values (pd, 'manual', 'active');
  perform test.as_user(pd);
  r := public.start_free_trial();
  perform test.as_superuser();
  perform test.check(r->>'code' = 'already_subscribed' and not exists (select 1 from public.user_trials where user_id = pd), 'a paying user cannot start a trial');

  -- an expired trial can never be restarted (TEST H)
  perform test.as_user(expired);
  r := public.start_free_trial();
  perform test.check(r->>'code' = 'already_started' and not public.has_speedvendors_access(), 'expired trial: Start Free Trial is refused and access stays locked');
  perform test.as_superuser();
  perform test.check((select trial_ends_at from public.user_trials where user_id = expired) < now(), 'expired trial window untouched');

  -- superadmins do not use trials
  perform test.as_user(adm, 'aal2');
  perform test.check(public.start_free_trial()->>'code' = 'not_applicable', 'superadmin: not applicable');
  perform test.as_superuser();

  -- a superadmin-granted trial counts as consumed
  insert into auth.users (id, email, email_confirmed_at) values (gr, 'granted@sv.test', now());
  perform test.as_user(adm, 'aal2');
  perform public.admin_extend_trial(gr, 7);
  perform test.as_superuser();
  perform test.check((select source from public.user_trials where user_id = gr) = 'admin', 'admin-granted trial recorded with source admin');
  perform test.as_user(gr);
  perform test.check(public.start_free_trial()->>'code' = 'already_started', 'user with an admin-granted trial cannot start another');
  perform test.as_superuser();
end $$;

-- Fixture for the concurrency test run by the shell runner (must be committed: autocommit here).
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000cc01', 'double-click@sv.test', now());
