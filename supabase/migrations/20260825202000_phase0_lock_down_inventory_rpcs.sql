-- Phase 0 follow-up — keep the inventory RPCs off the public REST surface.
--
-- `revoke all ... from public` is not sufficient on Supabase: default
-- privileges grant EXECUTE on new public functions to anon and authenticated,
-- which exposed them at /rest/v1/rpc/<name>. Anonymous callers could therefore
-- have committed inventory for arbitrary orders or created orders for any
-- merchant. These functions are only ever called with the service role from
-- edge functions.
--
-- restore_order_stock stays callable by authenticated because the merchant
-- dashboard calls it directly; it verifies order ownership internally and
-- returns NOT_AUTHORIZED otherwise.

revoke all on function public.apply_order_stock(uuid, text)         from anon, authenticated;
revoke all on function public.create_cod_order(jsonb, jsonb)        from anon, authenticated;
revoke all on function public.lock_products_for_items(jsonb)        from anon, authenticated;
revoke all on function public.order_items_guard_stock_applied()     from anon, authenticated, public;
revoke all on function public.restore_order_stock(uuid, boolean)    from anon;

grant execute on function public.apply_order_stock(uuid, text)      to service_role;
grant execute on function public.create_cod_order(jsonb, jsonb)     to service_role;
grant execute on function public.lock_products_for_items(jsonb)     to service_role;
grant execute on function public.restore_order_stock(uuid, boolean) to service_role, authenticated;
