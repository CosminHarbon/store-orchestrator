-- Minimal stand-ins for the Supabase-managed pieces the media migrations depend on.
-- Used ONLY by scripts/media-quota-sql-selftest.sh against a throwaway local Postgres.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema auth, storage, public to anon, authenticated, service_role;

create table auth.users (id uuid primary key default gen_random_uuid(), email text);

create function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

create table storage.buckets (
  id text primary key, name text, file_size_limit bigint, allowed_mime_types text[]
);
insert into storage.buckets (id, name) values ('product-images', 'product-images'), ('template-images', 'template-images');
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, metadata jsonb, is_delete_marker boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
$$ select string_to_array(name, '/') $$;

create function public.update_updated_at_column() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

create type public.app_role as enum ('superadmin', 'merchant');
create table public.user_roles (user_id uuid, role public.app_role);
create function public.has_role(r public.app_role) returns boolean language sql stable security definer as
$$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r) $$;
create function public.is_superadmin() returns boolean language sql stable security definer as
$$ select public.has_role('superadmin'::public.app_role) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' $$;
create function public.resolve_acting_user_id(p_acting_as uuid default null) returns uuid language sql stable as
$$ select coalesce(auth.uid(), p_acting_as) $$;

create table public.profiles (user_id uuid primary key, store_name text, created_at timestamptz default now());
create table public.products (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text);
create table public.collections (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text);
create table public.product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid not null, image_url text not null,
  is_primary boolean not null default false, display_order integer not null default 0
);
create table public.entitlements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null default 'active',
  valid_until timestamptz, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

alter table public.products enable row level security;
create policy products_own on public.products for all to authenticated using (user_id = auth.uid());
grant all on all tables in schema public to authenticated, service_role;
grant all on all tables in schema storage to service_role;
