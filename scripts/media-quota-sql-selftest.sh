#!/usr/bin/env bash
# Runs supabase/tests/media_quota_*.sql against a throwaway local Postgres cluster.
# Needs initdb / pg_ctl / psql on PATH. Touches nothing outside a temp directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"
TMP="$(mktemp -d)"
PORT="${MEDIA_TEST_PG_PORT:-54329}"

cleanup() {
  pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

initdb -D "$TMP/data" -A trust -U postgres >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
psql_run() { psql -h "$TMP" -p "$PORT" -U postgres -d t -v ON_ERROR_STOP=1 -q "$@"; }

psql -h "$TMP" -p "$PORT" -U postgres -d postgres -q -c 'create database t' >/dev/null

psql_run -f "$TESTS/media_quota_stub.sql" >/dev/null
for f in \
  20260829073548_media_storage_quota.sql \
  20260829073600_media_storage_quota_rpcs.sql \
  20260829073700_media_storage_object_size.sql \
  20260829081000_media_quota_expire_and_explicit.sql \
  20260829082000_media_storage_signed_upload_only.sql \
  20260829210841_media_pending_delete_status.sql; do
  psql_run -f "$MIG/$f" >/dev/null
done

psql_run -f "$TESTS/media_quota_pre_fixture.sql" >/dev/null
psql_run -f "$MIG/20260919000000_media_quota_original_size.sql" >/dev/null
psql_run -f "$TESTS/media_quota_original_size.test.sql"

if [ -n "${MEDIA_TEST_SHOW_GRANTS:-}" ]; then
  psql_run -P pager=off -c "
    select tbl, role,
      coalesce((select string_agg(p, ',' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
                where has_table_privilege(role, 'public.' || tbl, p)), '-') as table_level,
      coalesce((select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
                where a.attrelid = ('public.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped
                  and has_column_privilege(role, 'public.' || tbl, a.attname, 'SELECT')
                  and not has_table_privilege(role, 'public.' || tbl, 'SELECT')), '-') as column_level_select
    from (values ('media_assets'), ('media_usage'), ('media_upload_reservations')) v(tbl),
         (values ('authenticated'), ('anon'), ('service_role'), ('postgres')) r(role)
    order by 1, 2"
fi
