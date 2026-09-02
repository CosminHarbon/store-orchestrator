create or replace function public.media_storage_object_size(p_bucket text, p_path text)
returns bigint
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = p_bucket
    and o.name = p_path
    and coalesce(o.is_delete_marker, false) = false
  limit 1;
$$;

revoke all on function public.media_storage_object_size(text, text) from public, anon, authenticated;
grant execute on function public.media_storage_object_size(text, text) to service_role;
