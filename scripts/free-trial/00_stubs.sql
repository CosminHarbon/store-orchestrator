-- Minimal Supabase stand-ins so the billing + free-trial migrations can run on a bare Postgres.
create extension if not exists pgcrypto;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(current_setting('request.jwt.claim.role', true), 'authenticated') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create function public.update_updated_at_column() returns trigger language plpgsql as
  $$ begin new.updated_at = now(); return new; end $$;

create type public.app_role as enum ('superadmin');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
create function public.has_role(_role public.app_role) returns boolean language sql stable security definer
  set search_path = public as
  $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = _role) $$;
create function public.is_superadmin_user() returns boolean language sql stable security definer
  set search_path = public as $$ select public.has_role('superadmin'::public.app_role) $$;
create function public.is_superadmin() returns boolean language sql stable security definer
  set search_path = public as
  $$ select public.has_role('superadmin'::public.app_role) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' $$;
grant execute on function public.has_role(public.app_role), public.is_superadmin_user(), public.is_superadmin() to authenticated;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  store_name text, setup_completed boolean default false, created_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text, customer_email text, total numeric(10,2) default 0,
  payment_status text not null default 'pending', invoice_number text
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade, qty int default 1
);
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade, amount numeric default 0
);

-- Stand-in for a merchant table guarded by the production restrictive write policies
-- (see 20260829070000_billing_enforcement_write_guards.sql).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, name text
);
alter table public.products enable row level security;
create policy products_owner on public.products for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.products to authenticated;
