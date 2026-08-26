-- Qualify variant stock updates so a join to products (which also has stock)
-- does not raise "column reference stock is ambiguous".

create or replace function public.restore_order_stock(
  p_order_id uuid,
  p_cancel_order boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order      public.orders%rowtype;
  v_line       record;
  v_missing    integer;
  v_give       integer;
  v_restored   jsonb := '[]'::jsonb;
  v_has_vars   boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  if auth.uid() is not null
     and v_order.user_id <> auth.uid()
     and not public.is_superadmin() then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if v_order.stock_applied_at is null then
    return jsonb_build_object('success', false, 'error', 'STOCK_NOT_APPLIED');
  end if;

  if v_order.stock_restored_at is not null then
    return jsonb_build_object(
      'success', true, 'already_restored', true,
      'order_id', p_order_id, 'stock_restored_at', v_order.stock_restored_at
    );
  end if;

  for v_line in
    select oi.product_id,
           oi.variant_id,
           sum(oi.quantity)::integer as qty,
           min(oi.product_title)     as title
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id is not null
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id nulls first
  loop
    select coalesce(sum((entry->>'missing')::integer), 0) into v_missing
    from jsonb_array_elements(coalesce(v_order.stock_shortfall, '[]'::jsonb)) entry
    where (entry->>'product_id')::uuid = v_line.product_id
      and (
        (
          v_line.variant_id is null
          and nullif(entry->>'variant_id', '') is null
        )
        or (
          nullif(entry->>'variant_id', '')::uuid is not distinct from v_line.variant_id
        )
      );

    v_give := greatest(v_line.qty - v_missing, 0);
    if v_give = 0 then
      continue;
    end if;

    if v_line.variant_id is not null then
      update public.product_variants pv
      set stock = pv.stock + v_give, updated_at = now()
      from public.products p
      where pv.id = v_line.variant_id
        and p.id = pv.product_id
        and p.user_id = v_order.user_id;

      if found then
        v_restored := v_restored || jsonb_build_object(
          'product_id', v_line.product_id,
          'variant_id', v_line.variant_id,
          'quantity',   v_give
        );
      end if;
    else
      select p.has_variants into v_has_vars
      from public.products p
      where p.id = v_line.product_id
        and p.user_id = v_order.user_id;

      if coalesce(v_has_vars, false) then
        continue;
      end if;

      update public.products
      set stock = stock + v_give, updated_at = now()
      where id = v_line.product_id
        and user_id = v_order.user_id;

      if found then
        v_restored := v_restored || jsonb_build_object(
          'product_id', v_line.product_id,
          'variant_id', null,
          'quantity',   v_give
        );
      end if;
    end if;
  end loop;

  update public.orders
  set stock_restored_at = now(),
      order_status      = case when p_cancel_order then 'cancelled' else order_status end,
      updated_at        = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'already_restored', false,
    'order_id', p_order_id,
    'order_cancelled', p_cancel_order,
    'restored', v_restored
  );
end;
$function$;
