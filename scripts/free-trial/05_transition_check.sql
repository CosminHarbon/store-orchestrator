-- Runs right AFTER the explicit-start migration: checks how auto-created trial rows were handled.
create or replace function test.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'ok   - %', p_msg;
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-000000009a01';
  b uuid := '00000000-0000-0000-0000-000000009b01';
  seed_a record; seed_b record; t public.user_trials;
begin
  select count(*) as n into seed_a from test.seed;
  perform test.check(seed_a.n = 2, 'precondition: the old trigger auto-created a trial for both accounts');
  select * into seed_b from test.seed where user_id = b;

  perform test.check(not exists (select 1 from public.user_trials where user_id = a), 'account that never signed in: auto trial removed (back to NO PLAN, still eligible)');
  perform test.check(not exists (select 1 from public.trial_reminders where user_id = a), 'its reminder rows were removed too');
  perform test.check(not public.user_has_speedvendors_access(a), 'that account now has no application access');
  perform test.check((public.trial_status_json(a)->>'trial_eligible')::boolean and public.trial_status_json(a)->>'plan_state' = 'no_plan', 'and remains eligible to start a trial explicitly');

  select * into t from public.user_trials where user_id = b;
  perform test.check(t.user_id is not null and t.source = 'grandfathered', 'account already using the app: trial kept and marked grandfathered (consumed)');
  perform test.check(t.trial_started_at = seed_b.trial_started_at and t.trial_ends_at = seed_b.trial_ends_at, 'grandfathered window is exactly the original one (access preserved, nothing extended)');
  perform test.check(public.user_has_speedvendors_access(b), 'grandfathered account keeps its access');
  perform test.check(not (public.trial_status_json(b)->>'trial_eligible')::boolean, 'and cannot start a second trial');
  perform test.check(not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created_trial'), 'signup trigger removed');
end $$;
