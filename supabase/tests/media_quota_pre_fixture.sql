-- State as it exists in production BEFORE 20260919000000_media_quota_original_size.sql:
-- counters charge the stored size, and the initial backfill copied size_bytes into original_size_bytes.

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'm1@test'),
  ('22222222-2222-4222-8222-222222222222', 'm2@test'),
  ('33333333-3333-4333-8333-333333333333', 'm3@test'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin@test');

insert into public.profiles (user_id, store_name) values
  ('11111111-1111-4111-8111-111111111111', 'Store One'),
  ('22222222-2222-4222-8222-222222222222', 'Store Two'),
  ('33333333-3333-4333-8333-333333333333', 'Store Three');

insert into public.user_roles values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'superadmin');

insert into public.products (id, user_id, title) values
  ('b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Nike Air Max'),
  ('b2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Store Two Product'),
  ('b3000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'Replace Me');

insert into public.media_assets
  (id, user_id, bucket, storage_path, public_url, media_type, mime_type, size_bytes, original_size_bytes,
   related_entity_type, related_entity_id, uploaded_by)
values
  -- legacy backfill row: uploaded_by NULL, original was copied from size
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'product-images',
   '11111111-1111-4111-8111-111111111111/legacy-1.jpg', 'https://x/legacy-1.jpg', 'product', 'image/jpeg',
   3000000, 3000000, 'product', 'b1000000-0000-4000-8000-000000000001', null),
  -- real upload: 5 MiB original compressed to 900 KiB
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'product-images',
   '11111111-1111-4111-8111-111111111111/products/b1/new-1.webp', 'https://x/new-1.webp', 'product', 'image/webp',
   921600, 5242880, 'product', 'b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  -- real upload that was not reduced (original == stored is genuine here)
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'product-images',
   '11111111-1111-4111-8111-111111111111/products/b1/new-2.webp', 'https://x/new-2.webp', 'product', 'image/webp',
   200000, 200000, 'product', 'b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  -- non-product media
  ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'template-images',
   '11111111-1111-4111-8111-111111111111/branding/logo/l.webp', 'https://x/l.webp', 'logo', 'image/webp',
   100000, 1000000, 'logo', null, '11111111-1111-4111-8111-111111111111');

insert into public.product_images (product_id, image_url, is_primary, display_order) values
  ('b1000000-0000-4000-8000-000000000001', 'https://x/new-1.webp', true, 1),
  ('b1000000-0000-4000-8000-000000000001', 'https://x/new-2.webp', false, 2),
  ('b1000000-0000-4000-8000-000000000001', 'https://x/legacy-1.jpg', false, 3);

-- old semantics: bytes_used = SUM(size_bytes) = 3,000,000 + 921,600 + 200,000 + 100,000
insert into public.media_usage (user_id, bytes_used, bytes_reserved)
values ('11111111-1111-4111-8111-111111111111', 4221600, 500000);

-- in-flight reservation created by the old function (no charged_bytes column yet)
insert into public.media_upload_reservations
  (id, user_id, expected_size_bytes, bucket, storage_path, media_type, mime_type, original_size_bytes, expires_at)
values
  ('e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 500000, 'product-images',
   '11111111-1111-4111-8111-111111111111/products/b1/inflight.webp', 'product', 'image/webp', 2000000,
   now() + interval '10 minutes');
