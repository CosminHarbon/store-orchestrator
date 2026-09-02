-- Recoverable Storage cleanup. Live entities are never left pointing at
-- objects we already destroyed. Failed Storage deletes keep storage_path.

alter table public.media_assets
  add column if not exists status text not null default 'active';

alter table public.media_assets
  drop constraint if exists media_assets_status_check;

alter table public.media_assets
  add constraint media_assets_status_check
  check (status in ('active', 'pending_delete', 'delete_failed'));

alter table public.media_assets
  add column if not exists delete_attempted_at timestamptz;

create index if not exists media_assets_pending_delete_idx
  on public.media_assets (user_id, status)
  where status in ('pending_delete', 'delete_failed');

comment on column public.media_assets.status is
  'active = referenced; pending_delete/delete_failed = entity already gone, Storage cleanup retryable.';
