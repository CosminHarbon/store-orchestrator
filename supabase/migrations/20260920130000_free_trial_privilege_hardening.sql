-- Free trial: privilege hardening (follow-up to 20260920120000).
--
-- Found by the live production verification: Supabase's default privileges give `authenticated`
-- INSERT/UPDATE/DELETE on new public tables. RLS already denied every such write (no policy
-- exists), but the trial tables are server-owned, so also revoke the privileges (defence in
-- depth: a future permissive policy must not silently open them). Reads stay RLS-scoped.

revoke all on table public.user_trials from public, anon, authenticated;
grant select on table public.user_trials to authenticated;
grant all on table public.user_trials to service_role;

revoke all on table public.trial_reminders from public, anon, authenticated;
grant select on table public.trial_reminders to authenticated;
grant all on table public.trial_reminders to service_role;

-- admin_audit_log / deleted_account_archive were already revoked from authenticated; restate
-- for idempotence so this file alone documents the intended end state.
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select on table public.admin_audit_log to authenticated;
grant all on table public.admin_audit_log to service_role;

revoke all on table public.deleted_account_archive from public, anon, authenticated;
grant all on table public.deleted_account_archive to service_role;
