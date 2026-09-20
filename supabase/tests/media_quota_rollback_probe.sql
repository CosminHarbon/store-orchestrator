-- The migration must execute completely inside one transaction and leave NOTHING behind on ROLLBACK.
-- Run against the pre-migration fixture. Usage: psql -v mig=/path/to/migration.sql -f this-file
\set ON_ERROR_STOP on

begin;
\i :mig
rollback;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and column_name = 'charged_bytes') then
    raise exception 'ROLLBACK PROBE FAILED: charged_bytes column persisted';
  end if;
  if to_regprocedure('public.admin_media_storage_overview()') is not null
     or to_regprocedure('public.admin_media_product_storage(uuid)') is not null
     or to_regprocedure('public.media_recompute_usage(uuid)') is not null then
    raise exception 'ROLLBACK PROBE FAILED: new functions persisted';
  end if;
  if (select bytes_used from public.media_usage where user_id = '11111111-1111-4111-8111-111111111111') <> 4221600
     or (select bytes_reserved from public.media_usage where user_id = '11111111-1111-4111-8111-111111111111') <> 500000 then
    raise exception 'ROLLBACK PROBE FAILED: media_usage counters changed';
  end if;
  if (select count(*) from public.media_assets where original_size_bytes is null) <> 0 then
    raise exception 'ROLLBACK PROBE FAILED: legacy original_size_bytes was nulled';
  end if;
  if not has_column_privilege('authenticated', 'public.media_assets', 'size_bytes', 'SELECT')
     or not has_table_privilege('authenticated', 'public.media_usage', 'SELECT') then
    raise exception 'ROLLBACK PROBE FAILED: grants changed';
  end if;
end $$;
\echo ROLLBACK PROBE OK
