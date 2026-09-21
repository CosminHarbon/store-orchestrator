#!/usr/bin/env bash
# Runs the free-trial SQL self-tests against a scratch Postgres (no Supabase needed).
# Usage: PGHOST=<socket dir or host> PGPORT=<port> PGUSER=postgres scripts/free-trial/run-selftest.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
mig="$root/supabase/migrations"
DB="ft_selftest_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
P="psql -v ON_ERROR_STOP=1 -q -d $DB"

$P -f "$here/00_stubs.sql"
$P -f "$mig/20260827141430_saas_billing_entitlements.sql"
$P -c "alter table public.billing_subscriptions add column tier text"

# --- state of production BEFORE the correction: the original trial migrations (signup trigger installed)
$P -f "$mig/20260920120000_free_trial_system.sql"
$P -f "$mig/20260920120000_free_trial_system.sql"
$P -f "$mig/20260920130000_free_trial_privilege_hardening.sql"
$P -f "$here/04_pre_transition_seed.sql"

# --- the forward correction (must be re-runnable) and how it treated the auto-created rows
$P -f "$mig/20260920150000_free_trial_explicit_start.sql"
$P -f "$mig/20260920150000_free_trial_explicit_start.sql"
$P -f "$mig/20260920130000_free_trial_privilege_hardening.sql"
$P -f "$here/05_transition_check.sql"

$P -f "$here/10_selftest.sql"
$P -f "$here/20_selftest_audit.sql"
$P -f "$here/25_selftest_explicit_start.sql"
$P -v root="$root" -f "$here/30_selftest_privileges.sql"

# --- concurrency: 12 simultaneous "Start Free Trial" presses for the same user => exactly one trial
uid=00000000-0000-0000-0000-00000000cc01
out="$(mktemp)"
for i in $(seq 1 12); do
  ( psql -q -At -d "$DB" -c "select set_config('request.jwt.claim.sub','$uid',false); select set_config('request.jwt.claims','{\"role\":\"authenticated\",\"aal\":\"aal1\"}',false); set role authenticated; select public.start_free_trial()->>'code';" 2>&1 | tail -1 >> "$out" ) &
done
wait
started=$(grep -c '^started$' "$out" || true)
already=$(grep -c '^already_started$' "$out" || true)
rows=$(psql -q -At -d "$DB" -c "select count(*) from public.user_trials where user_id = '$uid'")
echo "concurrency: started=$started already_started=$already rows=$rows"
if [ "$started" != "1" ] || [ "$already" != "11" ] || [ "$rows" != "1" ]; then
  echo "FAIL: concurrent Start Free Trial produced started=$started already_started=$already rows=$rows"; cat "$out"; exit 1
fi
rm -f "$out"
echo "free-trial SQL self-test: ALL PASSED"
