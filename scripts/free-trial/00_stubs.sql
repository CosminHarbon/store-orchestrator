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

-- Production-shaped stand-ins for the merchant write RPCs the migration guards. Same attributes as
-- prod: SECURITY DEFINER, plpgsql, DECLARE-before-BEGIN, nested BEGIN..EXCEPTION, empty or `public`
-- search_path, executable by authenticated (bulk_update_stock also by anon).
create table public.order_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notes text
);
create table public.push_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null, device_token text);

create function public.bulk_update_stock(updates jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer := 0;
begin
  begin
    n := jsonb_array_length(updates);
  exception when others then
    n := -1;
  end;
  return n;
end $$;
create function public.restore_order_stock(p_order_id uuid, p_cancel_order boolean) returns jsonb language plpgsql security definer set search_path = public as $$
DECLARE
  v jsonb := '{}'::jsonb;
BEGIN
  RETURN jsonb_build_object('success', true);
END $$;
create function public.return_order_items(p_order_id uuid, p_items jsonb, p_mark_refunded boolean, p_cancel_if_full boolean, p_notes text) returns jsonb language plpgsql security definer set search_path = public as $$
DECLARE
  v_any boolean := false;
BEGIN
  RETURN jsonb_build_object('success', true);
END $$;
create function public.save_product_variants(p_product_id uuid, p_payload jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_x integer := 1;
begin
  return jsonb_build_object('success', true);
end $$;
grant execute on function public.bulk_update_stock(jsonb) to anon, authenticated, service_role;
grant execute on function public.restore_order_stock(uuid, boolean) to authenticated, service_role;
grant execute on function public.return_order_items(uuid, jsonb, boolean, boolean, text) to authenticated, service_role;
grant execute on function public.save_product_variants(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.restore_order_stock(uuid, boolean) from public, anon;
revoke execute on function public.return_order_items(uuid, jsonb, boolean, boolean, text) from public, anon;
revoke execute on function public.save_product_variants(uuid, jsonb) from public, anon;
grant all on all tables in schema public to service_role;
