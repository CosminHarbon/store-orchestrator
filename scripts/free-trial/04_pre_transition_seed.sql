-- Runs BEFORE the explicit-start migration, while the old signup trigger is still installed, to
-- recreate what production looked like: accounts that were auto-given a trial at signup.

create schema if not exists test;
grant usage on schema test to public;

insert into auth.users (id, email, last_sign_in_at, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000009a01', 'never-signed-in@sv.test', null, null),
  ('00000000-0000-0000-0000-000000009b01', 'signed-in-and-using@sv.test', now(), now());

-- the old trigger created source='signup' rows for both
create table test.seed as
  select user_id, trial_started_at, trial_ends_at, source from public.user_trials
   where user_id in ('00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-000000009b01');

insert into public.trial_reminders (user_id, milestone, trial_ends_at, trigger_source)
  select user_id, '3d', trial_ends_at, 'cron' from public.user_trials where user_id = '00000000-0000-0000-0000-000000009a01';
