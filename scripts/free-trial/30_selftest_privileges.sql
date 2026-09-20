-- Privilege hardening (20260920130000). Simulates Supabase's default privileges, which grant the
-- API roles broad rights on new public tables, then checks the hardening migration removes them.
-- Runs LAST so it does not disturb earlier fixtures.

do $$
declare t text; p text;
begin
  -- simulate default privileges having been granted to the API roles
  grant insert, update, delete, truncate, references, trigger on public.user_trials, public.trial_reminders, public.admin_audit_log to authenticated;
  grant all on public.user_trials, public.trial_reminders, public.admin_audit_log, public.deleted_account_archive to anon;
end $$;

\i :root/supabase/migrations/20260920130000_free_trial_privilege_hardening.sql

do $$
declare t text; p text;
begin
  foreach t in array array['user_trials', 'trial_reminders', 'admin_audit_log'] loop
    foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      perform test.check(not has_table_privilege('authenticated', 'public.' || t, p), 'authenticated has no ' || p || ' on ' || t);
    end loop;
    perform test.check(has_table_privilege('authenticated', 'public.' || t, 'SELECT'), 'authenticated keeps SELECT (RLS-scoped) on ' || t);
    perform test.check(not has_table_privilege('anon', 'public.' || t, 'SELECT'), 'anon has no access to ' || t);
    perform test.check(has_table_privilege('service_role', 'public.' || t, 'INSERT'), 'service_role keeps full access to ' || t);
  end loop;
  perform test.check(not has_table_privilege('authenticated', 'public.deleted_account_archive', 'SELECT') and not has_table_privilege('anon', 'public.deleted_account_archive', 'SELECT'),
    'retention archive is service_role only');
end $$;
