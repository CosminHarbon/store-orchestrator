#!/usr/bin/env bash
# Runs the free-trial SQL self-test against a scratch Postgres (no Supabase needed).
# Usage: PGHOST=<socket dir or host> PGPORT=<port> PGUSER=postgres scripts/free-trial/run-selftest.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
DB="ft_selftest_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
P="psql -v ON_ERROR_STOP=1 -q -d $DB"
$P -f "$here/00_stubs.sql"
$P -f "$root/supabase/migrations/20260827141430_saas_billing_entitlements.sql"
$P -c "alter table public.billing_subscriptions add column tier text"
$P -f "$root/supabase/migrations/20260920120000_free_trial_system.sql"
$P -f "$here/10_selftest.sql"
echo "free-trial SQL self-test: ALL PASSED"
