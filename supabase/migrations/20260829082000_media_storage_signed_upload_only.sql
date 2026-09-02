-- Harden Storage after the signed-upload Edge Function is live.
-- Direct authenticated INSERT/UPDATE/DELETE is no longer a bypass for quota or path rules.
-- Public SELECT remains so existing storefront URLs keep working.

update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']::text[]
where id in ('product-images', 'template-images');

drop policy if exists "Users can upload product images" on storage.objects;
drop policy if exists "Users can upload collection images" on storage.objects;
drop policy if exists "Users can upload their own template images" on storage.objects;
drop policy if exists "Superadmins can upload product images" on storage.objects;

drop policy if exists "Users can update their product images" on storage.objects;
drop policy if exists "Users can update collection images" on storage.objects;
drop policy if exists "Users can update their own template images" on storage.objects;
drop policy if exists "Superadmins can update product images" on storage.objects;

drop policy if exists "Users can delete their product images" on storage.objects;
drop policy if exists "Users can delete collection images" on storage.objects;
drop policy if exists "Users can delete their own template images" on storage.objects;
drop policy if exists "Superadmins can delete product images" on storage.objects;
