\set ON_ERROR_STOP on

create schema t;
grant usage on schema t to public;

create function t.m1() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function t.m2() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
create function t.m3() returns uuid language sql immutable as $$ select '33333333-3333-4333-8333-333333333333'::uuid $$;
create function t.sa() returns uuid language sql immutable as $$ select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;

create function t.ok(cond boolean, msg text) returns void language plpgsql as
$$ begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;

create function t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as
$$ begin
  if actual is distinct from expected then
    raise exception 'ASSERT FAILED: % (expected %, got %)', msg, expected, actual;
  end if;
end $$;

create function t.as_root() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create function t.as_service() returns void language plpgsql as
$$ begin execute 'reset role'; execute 'set local role service_role'; end $$;
create function t.as_user(uid uuid, aal text default 'aal1') returns void language plpgsql as
$$ begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal)::text, true);
  execute 'set local role authenticated';
end $$;

create function t.raises(q text, expect text) returns void language plpgsql as
$$ begin
  begin
    execute q;
  exception when others then
    if sqlerrm not like '%' || expect || '%' then
      raise exception 'ASSERT FAILED: wrong error for [%]: got [%], wanted [%]', q, sqlerrm, expect;
    end if;
    return;
  end;
  raise exception 'ASSERT FAILED: expected error [%] but [%] succeeded', expect, q;
end $$;

-- Full merchant upload as the Edge Function performs it: reserve (stored size + original size), finalize.
create function t.upload(uid uuid, stored bigint, original bigint, entity uuid default null,
                         mtype text default 'product') returns uuid language plpgsql as
$$
declare
  v jsonb; f jsonb; p text := uid || '/t/' || gen_random_uuid() || '.webp';
begin
  perform t.as_service();
  v := public.reserve_media_upload(uid, stored, case when mtype in ('product','collection') then 'product-images' else 'template-images' end,
        p, mtype, 'image/webp', original, 100, 100, mtype, entity, uid);
  if (v->>'ok')::boolean is not true then
    raise exception 'reserve_failed:%', v->>'error';
  end if;
  f := public.finalize_media_upload((v->>'reservation_id')::uuid, stored, 'image/webp', 'https://x/' || p, 100, 100);
  if (f->>'ok')::boolean is not true then
    raise exception 'finalize_failed:%', f->>'error';
  end if;
  return (f->>'asset_id')::uuid;
end $$;

create function t.used(uid uuid) returns bigint language sql as $$ select bytes_used from public.media_usage where user_id = uid $$;
create function t.reserved(uid uuid) returns bigint language sql as $$ select bytes_reserved from public.media_usage where user_id = uid $$;

-- =============================================================================
-- A. Migration outcome on pre-existing (legacy) data
-- =============================================================================
do $$
declare a public.media_assets; begin
  select * into a from public.media_assets where id = 'a0000000-0000-4000-8000-000000000001';
  perform t.ok(a.original_size_bytes is null, 'A1 fabricated legacy original cleared to NULL');
  perform t.eq(a.charged_bytes, 3000000, 'A2 legacy row charged at stored size (documented fallback)');

  select * into a from public.media_assets where id = 'a0000000-0000-4000-8000-000000000002';
  perform t.eq(a.original_size_bytes, 5242880, 'A3 real original kept');
  perform t.eq(a.size_bytes, 921600, 'A4 stored size kept');
  perform t.eq(a.charged_bytes, 5242880, 'A5 charged = original');

  select * into a from public.media_assets where id = 'a0000000-0000-4000-8000-000000000003';
  perform t.eq(a.original_size_bytes, 200000, 'A6 genuine original==stored (uploaded_by set) is NOT cleared');

  -- 3,000,000 + 5,242,880 + 200,000 + 1,000,000
  perform t.eq(t.used('11111111-1111-4111-8111-111111111111'), 9442880, 'A7 counter rebased to original-size charges');
  perform t.eq(t.reserved('11111111-1111-4111-8111-111111111111'), 2000000, 'A8 in-flight reservation re-based on its original');
  perform t.eq((select charged_bytes from public.media_upload_reservations), 2000000, 'A9 reservation charged_bytes backfilled');
end $$;

-- =============================================================================
-- B. Superadmin analytics (before other tests mutate M1)
-- =============================================================================
do $$
declare r record; n int; s bigint; ps bigint; pc bigint; psv bigint; begin
  perform t.as_user(t.sa(), 'aal2');
  select * into r from public.admin_media_storage_overview() where store_user_id = t.m1();
  perform t.eq(r.asset_count, 4, 'B1 asset count');
  perform t.eq(r.charged_bytes, 9442880, 'B2 charged = sum(original-based)');
  perform t.eq(r.stored_bytes, 4221600, 'B3 physical = sum(stored)');
  perform t.eq(r.saved_bytes, 5221280, 'B4 saved = charged - physical');
  perform t.eq(r.legacy_asset_count, 1, 'B5 legacy rows flagged, not invented');
  perform t.eq(r.legacy_stored_bytes, 3000000, 'B6 legacy stored bytes');
  perform t.eq(r.measured_charged_bytes, 6442880, 'B7 measured subset charged');
  perform t.eq(r.measured_stored_bytes, 1221600, 'B8 measured subset stored');
  perform t.eq(r.counter_bytes_used, 9442880, 'B9 counter == derived (no drift)');
  perform t.ok(r.quota_bytes = 2147483648, 'B10 default START quota');

  select count(*), sum(original_size_bytes), sum(stored_size_bytes), sum(charged_bytes), sum(saved_bytes)
    into n, s, ps, pc, psv
  from public.admin_media_product_storage(t.m1());
  perform t.eq(n, 3, 'B11 three images on the product (product media only)');
  perform t.eq(s, 5442880, 'B12 product original total (known originals only)');
  perform t.eq(ps, 4121600, 'B13 product stored total');
  perform t.eq(pc, 8442880, 'B14 product charged total');
  perform t.eq(psv, 4321280, 'B15 product saved total');

  select count(*) into n from public.admin_media_product_storage(t.m1())
   where product_title = 'Nike Air Max' and product_image_id is not null;
  perform t.eq(n, 3, 'B16 rows carry product title and product_images link');
  select count(*) into n from public.admin_media_product_storage(t.m1())
   where original_size_bytes is null and saved_bytes = 0 and stored_size_bytes = 3000000;
  perform t.eq(n, 1, 'B17 legacy image shows unknown original, zero saving');
end $$;

-- =============================================================================
-- C. Quota behaviour
-- =============================================================================
-- C1 upload example: 5 MiB original compressed to ~900 KiB
do $$
declare before_used bigint; aid uuid; a public.media_assets; begin
  before_used := t.used(t.m3());
  aid := t.upload(t.m3(), 921600, 5242880, 'b3000000-0000-4000-8000-000000000003');
  select * into a from public.media_assets where id = aid;
  perform t.eq(a.original_size_bytes, 5242880, 'C1 original recorded');
  perform t.eq(a.size_bytes, 921600, 'C2 stored recorded');
  perform t.eq(t.used(t.m3()) - coalesce(before_used, 0), 5242880, 'C3 quota grows by ORIGINAL size');
  perform t.eq(t.reserved(t.m3()), 0, 'C4 reservation fully released on finalize');
end $$;

-- C5 quota rejection uses original size even though the physical file is tiny
do $$
declare i int; v jsonb; begin
  insert into public.entitlements (user_id, status, metadata)
    values (t.m2(), 'active', '{"media_quota_bytes": 104857600}');
  for i in 1..9 loop perform t.upload(t.m2(), 100000, 10485760); end loop;          -- 90 MiB
  perform t.upload(t.m2(), 100000, 5242880);                                        -- 95 MiB
  perform t.eq(t.used(t.m2()), 99614720, 'C5 M2 sits at 95 MiB');

  v := public.reserve_media_upload(t.m2(), 100000, 'product-images', t.m2() || '/x/reject.webp', 'product',
        'image/webp', 8388608, null, null, null, null, t.m2());
  perform t.ok(v->>'error' = 'quota_exceeded', 'C6 95+8 MiB rejected although physical file is 100 KB');
  perform t.eq(t.reserved(t.m2()), 0, 'C7 rejected upload holds no reservation');

  perform t.raises($q$ select public.reserve_media_upload('22222222-2222-4222-8222-222222222222', 100000,
     'product-images', 'p', 'product', 'image/webp', 15728640) $q$, 'invalid_original_size');   -- 15 MiB > 10 MiB cap

  v := public.reserve_media_upload(t.m2(), 100000, 'product-images', t.m2() || '/x/ok.webp', 'product',
        'image/webp', 5242880, null, null, null, null, t.m2());
  perform t.ok((v->>'ok')::boolean, 'C8 95+5 MiB fits exactly');
  perform t.eq(t.reserved(t.m2()), 5242880, 'C9 reservation holds ORIGINAL size');
  v := public.reserve_media_upload(t.m2(), 100000, 'product-images', t.m2() || '/x/ok2.webp', 'product',
        'image/webp', null, null, null, null, null, t.m2());
  perform t.ok(v->>'error' = 'quota_exceeded', 'C10 in-flight reservation counts against quota');
end $$;

-- C11 release + expire give the reserved bytes back
do $$
declare v jsonb; rid uuid; begin
  perform t.as_service();
  v := public.reserve_media_upload(t.m3(), 500000, 'product-images', t.m3() || '/x/rel.webp', 'product',
        'image/webp', 3145728, null, null, null, null, t.m3());
  perform t.eq(t.reserved(t.m3()), 3145728, 'C11 reserved by original');
  perform public.release_media_reservation((v->>'reservation_id')::uuid);
  perform t.eq(t.reserved(t.m3()), 0, 'C12 release returns original-size hold');

  v := public.reserve_media_upload(t.m3(), 500000, 'product-images', t.m3() || '/x/exp.webp', 'product',
        'image/webp', 2097152, null, null, null, null, t.m3());
  update public.media_upload_reservations set expires_at = now() - interval '1 minute' where id = (v->>'reservation_id')::uuid;
  perform public.media_expire_reservations_for_user(t.m3());
  perform t.eq(t.reserved(t.m3()), 0, 'C13 expiry returns original-size hold');
end $$;

-- C14 floor + fallback: under-reported / missing original never charges less than stored
do $$
declare aid uuid; a public.media_assets; b public.media_assets; begin
  aid := t.upload(t.m3(), 800000, 100);
  select * into a from public.media_assets where id = aid;
  perform t.eq(a.charged_bytes, 800000, 'C14 original 100 B but 800000 B stored -> charged at stored size');
  aid := t.upload(t.m3(), 700000, null);
  select * into b from public.media_assets where id = aid;
  perform t.ok(b.original_size_bytes is null and b.charged_bytes = 700000, 'C15 old client without original -> charged stored size');
end $$;

-- C16 delete subtracts the ORIGINAL-based charge
do $$
declare aid uuid; before_used bigint; begin
  aid := t.upload(t.m1(), 100000, 4194304);
  before_used := t.used(t.m1());
  perform t.as_service();
  perform public.record_media_deletion(aid);
  perform t.eq(before_used - t.used(t.m1()), 4194304, 'C16 delete frees ORIGINAL size, not stored size');
end $$;

-- C17 replacement: 10 MiB/2 MB image replaced by 4 MiB/800 KB image => usage drops 6 MiB
do $$
declare u_old bigint; old_id uuid; new_id uuid; base bigint; begin
  perform t.as_service();
  delete from public.media_assets where user_id = t.m3();
  perform public.media_recompute_usage(t.m3());
  base := t.used(t.m3());
  perform t.eq(base, 0, 'C17 clean slate');
  old_id := t.upload(t.m3(), 2000000, 10485760, 'b3000000-0000-4000-8000-000000000003');
  perform t.eq(t.used(t.m3()), 10485760, 'C18 old image charged 10 MiB');
  new_id := t.upload(t.m3(), 800000, 4194304, 'b3000000-0000-4000-8000-000000000003');
  perform t.eq(t.used(t.m3()), 14680064, 'C19 both present during replace');
  perform t.as_service();
  perform public.record_media_deletion(old_id);
  perform t.eq(t.used(t.m3()), 4194304, 'C20 after replace usage = new original only (dropped 6 MiB)');
end $$;

-- C21 multiple images aggregate; C22 store totals; counters == derived sums
do $$
declare r record; begin
  perform t.as_user(t.sa(), 'aal2');
  select * into r from public.admin_media_storage_overview() where store_user_id = t.m3();
  perform t.eq(r.charged_bytes, 4194304, 'C21 store charged total');
  perform t.eq(r.stored_bytes, 800000, 'C22 store physical total');
  perform t.eq(r.saved_bytes, 3394304, 'C23 store saved');
  perform t.eq(r.counter_bytes_used, r.charged_bytes, 'C24 counter equals derived charge');
end $$;

-- C25 recompute repairs a corrupted counter
do $$
declare v jsonb; begin
  perform t.as_service();
  update public.media_usage set bytes_used = 1, bytes_reserved = 999 where user_id = t.m3();
  v := public.media_recompute_usage(t.m3());
  perform t.eq(t.used(t.m3()), (select sum(charged_bytes)::bigint from public.media_assets where user_id = t.m3()), 'C25 bytes_used rebuilt from rows');
  perform t.eq(t.reserved(t.m3()), 0, 'C26 bytes_reserved rebuilt from live reservations');
end $$;

-- =============================================================================
-- D. Security
-- =============================================================================
do $$
declare j jsonb; n int; begin
  perform t.as_user(t.m1());
  perform t.raises('select size_bytes from public.media_assets', 'permission denied');
  perform t.raises('select original_size_bytes from public.media_assets', 'permission denied');
  perform t.raises('select charged_bytes from public.media_assets', 'permission denied');
  perform t.raises('select * from public.media_assets', 'permission denied');
  perform t.raises('select id from public.media_assets where size_bytes > 0', 'permission denied');

  select count(*), count(distinct user_id) into n from public.media_assets;
  perform t.ok(n > 0, 'D1 merchant can still read own asset rows (non-private columns)');
  perform t.eq((select count(distinct user_id) from public.media_assets), 1, 'D2 RLS: only own rows');
  perform t.ok((select user_id from public.media_assets limit 1) = t.m1(), 'D3 rows belong to the caller');

  perform t.raises('select * from public.admin_media_storage_overview()', 'not authorized');
  perform t.raises($q$ select * from public.admin_media_product_storage('11111111-1111-4111-8111-111111111111') $q$, 'not authorized');
  perform t.raises($q$ select * from public.admin_media_product_storage('22222222-2222-4222-8222-222222222222') $q$, 'not authorized');

  perform t.raises($q$ select public.media_recompute_usage('11111111-1111-4111-8111-111111111111') $q$, 'permission denied');
  perform t.raises($q$ select public.reserve_media_upload('11111111-1111-4111-8111-111111111111', 1, 'product-images','p','product','image/webp') $q$, 'permission denied');
  perform t.raises($q$ select public.finalize_media_upload(gen_random_uuid(), 1) $q$, 'permission denied');
  perform t.raises($q$ select public.record_media_deletion(gen_random_uuid()) $q$, 'permission denied');
  perform t.raises('select * from public.media_upload_reservations', 'permission denied');
  perform t.raises($q$ update public.media_usage set bytes_used = 0 $q$, 'permission denied');
  perform t.raises($q$ update public.media_assets set original_size_bytes = 1 $q$, 'permission denied');

  j := public.get_media_usage();
  perform t.ok(not (j ? 'stored_bytes' or j ? 'size_bytes' or j ? 'saved_bytes' or j ? 'physical_bytes'), 'D4 merchant usage RPC exposes no physical/compression data');
  perform t.ok((j->>'bytes_used')::bigint = t.used(t.m1()), 'D5 merchant sees quota (charged) usage');
  perform t.eq((select count(*) from public.media_usage), 1, 'D6 media_usage RLS: own row only');

  -- merchant with MFA-less superadmin role still cannot use the analytics
  perform t.as_user(t.sa(), 'aal1');
  perform t.raises('select * from public.admin_media_storage_overview()', 'not authorized');
  perform t.raises($q$ select * from public.admin_media_product_storage('11111111-1111-4111-8111-111111111111') $q$, 'not authorized');

  -- superadmin (aal2) reads via RPC only; even they have no direct column grant on private columns
  perform t.as_user(t.sa(), 'aal2');
  perform t.ok((select count(*) from public.admin_media_storage_overview()) = 3, 'D7 superadmin sees every store');
  perform t.raises('select size_bytes from public.media_assets', 'permission denied');

  -- anon
  perform t.as_root();
  execute 'set local role anon';
  perform t.raises('select * from public.admin_media_storage_overview()', 'permission denied');
  perform t.raises('select id from public.media_assets', 'permission denied');
end $$;

-- =============================================================================
-- E. Whole-database invariant: counters equal derived charges (no drift after all of the above)
-- =============================================================================
do $$
declare bad int; begin
  perform t.as_root();
  select count(*) into bad
  from public.media_usage mu
  where mu.bytes_used <> coalesce((select sum(charged_bytes) from public.media_assets a where a.user_id = mu.user_id), 0);
  perform t.eq(bad, 0, 'E1 media_usage.bytes_used == SUM(media_assets.charged_bytes) for every merchant');
end $$;

\echo ALL MEDIA QUOTA SQL TESTS PASSED
