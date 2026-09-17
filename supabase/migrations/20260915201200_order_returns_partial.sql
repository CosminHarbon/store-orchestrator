-- Partial and full order returns: track returned qty per line, restock inventory,
-- and keep an audit trail. Full cancel/restock still works for remaining units.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS returned_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_returned_quantity_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_returned_quantity_check
  CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);

COMMENT ON COLUMN public.order_items.returned_quantity IS
  'Units already returned/restocked for this line. Remaining returnable = quantity - returned_quantity.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_status text NOT NULL DEFAULT 'none';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_return_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_return_status_check
  CHECK (return_status IN ('none', 'partial', 'returned'));

COMMENT ON COLUMN public.orders.return_status IS
  'none = no returns; partial = some units returned; returned = all units returned.';

CREATE TABLE IF NOT EXISTS public.order_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  mark_refunded boolean NOT NULL DEFAULT false,
  is_full boolean NOT NULL DEFAULT false,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  restored jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_returns_order_id_idx ON public.order_returns (order_id);
CREATE INDEX IF NOT EXISTS order_returns_user_id_idx ON public.order_returns (user_id);

ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own order returns" ON public.order_returns;
CREATE POLICY "Owners manage own order returns"
  ON public.order_returns
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_superadmin())
  WITH CHECK (auth.uid() = user_id OR public.is_superadmin());

GRANT SELECT, INSERT ON TABLE public.order_returns TO authenticated;
GRANT ALL ON TABLE public.order_returns TO service_role;
REVOKE ALL ON TABLE public.order_returns FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Allow updating returned_quantity while inventory is committed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_items_guard_stock_applied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_applied  timestamptz;
  v_restored timestamptz;
BEGIN
  v_order_id := CASE WHEN tg_op = 'DELETE' THEN old.order_id ELSE new.order_id END;

  SELECT o.stock_applied_at, o.stock_restored_at
    INTO v_applied, v_restored
  FROM public.orders o
  WHERE o.id = v_order_id;

  IF NOT FOUND THEN
    IF tg_op = 'DELETE' THEN RETURN old; ELSE RETURN new; END IF;
  END IF;

  -- Partial returns update only returned_quantity via return_order_items().
  IF tg_op = 'UPDATE'
     AND v_applied IS NOT NULL
     AND v_restored IS NULL
     AND new.order_id IS NOT DISTINCT FROM old.order_id
     AND new.product_id IS NOT DISTINCT FROM old.product_id
     AND new.variant_id IS NOT DISTINCT FROM old.variant_id
     AND new.product_title IS NOT DISTINCT FROM old.product_title
     AND new.product_price IS NOT DISTINCT FROM old.product_price
     AND new.quantity IS NOT DISTINCT FROM old.quantity
     AND new.variant_title IS NOT DISTINCT FROM old.variant_title
     AND new.variant_sku IS NOT DISTINCT FROM old.variant_sku
     AND new.variant_options IS NOT DISTINCT FROM old.variant_options
     AND new.image_url IS NOT DISTINCT FROM old.image_url
     AND new.created_at IS NOT DISTINCT FROM old.created_at
     AND new.returned_quantity IS DISTINCT FROM old.returned_quantity
     AND new.returned_quantity >= old.returned_quantity
     AND new.returned_quantity <= new.quantity
  THEN
    RETURN new;
  END IF;

  IF v_applied IS NOT NULL AND v_restored IS NULL THEN
    RAISE EXCEPTION
      'ORDER_ITEMS_IMMUTABLE: inventory is already committed for order %. Call restore_order_stock() or return_order_items() before changing its lines.',
      v_order_id
      USING ERRCODE = 'P0001';
  END IF;

  IF tg_op = 'DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. return_order_items — full or partial return + restock
--    p_items: [{"order_item_id":"<uuid>","quantity":1}, ...]
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.return_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_mark_refunded boolean DEFAULT false,
  p_cancel_if_full boolean DEFAULT true,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order          public.orders%rowtype;
  v_entry          jsonb;
  v_item_id        uuid;
  v_qty            integer;
  v_line           public.order_items%rowtype;
  v_remaining      integer;
  v_missing        integer;
  v_give           integer;
  v_has_vars       boolean;
  v_restored       jsonb := '[]'::jsonb;
  v_snapshot       jsonb := '[]'::jsonb;
  v_return_id      uuid;
  v_any            boolean := false;
  v_all_returned   boolean;
  v_any_returned   boolean;
  v_return_status  text;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ITEMS');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF auth.uid() IS NOT NULL
     AND v_order.user_id <> auth.uid()
     AND NOT public.is_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  IF v_order.stock_applied_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'STOCK_NOT_APPLIED');
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_item_id := (v_entry->>'order_item_id')::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_ITEM_ID');
    END;

    v_qty := coalesce((v_entry->>'quantity')::integer, 0);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_line
    FROM public.order_items
    WHERE id = v_item_id AND order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_FOUND', 'order_item_id', v_item_id);
    END IF;

    v_remaining := v_line.quantity - coalesce(v_line.returned_quantity, 0);
    IF v_qty > v_remaining THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'QTY_EXCEEDS_REMAINING',
        'order_item_id', v_item_id,
        'remaining', v_remaining,
        'requested', v_qty
      );
    END IF;

    -- Shortfall was never reserved; do not restock more than was applied.
    SELECT coalesce(sum((entry->>'missing')::integer), 0) INTO v_missing
    FROM jsonb_array_elements(coalesce(v_order.stock_shortfall, '[]'::jsonb)) entry
    WHERE (entry->>'product_id')::uuid IS NOT DISTINCT FROM v_line.product_id
      AND (
        (
          v_line.variant_id IS NULL
          AND nullif(entry->>'variant_id', '') IS NULL
        )
        OR (
          nullif(entry->>'variant_id', '')::uuid IS NOT DISTINCT FROM v_line.variant_id
        )
      );

    -- Allocate shortfall proportionally to remaining unreturned units on this
    -- product/variant group is complex; for line-level returns, cap give by
    -- remaining after shortfall already accounted on full restore. Simple rule:
    -- restock min(requested, max(0, line.quantity - returned - missing_for_line)).
    -- Missing is at product/variant grain; apply only once against first returns
    -- by reducing give if returned_quantity + give would exceed quantity - missing.
    v_give := least(v_qty, greatest(v_line.quantity - coalesce(v_line.returned_quantity, 0) - v_missing, 0));

    UPDATE public.order_items
    SET returned_quantity = returned_quantity + v_qty
    WHERE id = v_line.id;

    v_any := true;
    v_snapshot := v_snapshot || jsonb_build_object(
      'order_item_id', v_line.id,
      'product_id', v_line.product_id,
      'variant_id', v_line.variant_id,
      'product_title', v_line.product_title,
      'variant_title', v_line.variant_title,
      'quantity', v_qty,
      'unit_price', v_line.product_price
    );

    IF v_give > 0 AND v_line.product_id IS NOT NULL THEN
      IF v_line.variant_id IS NOT NULL THEN
        UPDATE public.product_variants pv
        SET stock = pv.stock + v_give, updated_at = now()
        FROM public.products p
        WHERE pv.id = v_line.variant_id
          AND p.id = pv.product_id
          AND p.user_id = v_order.user_id;

        IF FOUND THEN
          v_restored := v_restored || jsonb_build_object(
            'product_id', v_line.product_id,
            'variant_id', v_line.variant_id,
            'quantity', v_give
          );
        END IF;
      ELSE
        SELECT p.has_variants INTO v_has_vars
        FROM public.products p
        WHERE p.id = v_line.product_id
          AND p.user_id = v_order.user_id;

        IF NOT coalesce(v_has_vars, false) THEN
          UPDATE public.products
          SET stock = stock + v_give, updated_at = now()
          WHERE id = v_line.product_id
            AND user_id = v_order.user_id;

          IF FOUND THEN
            v_restored := v_restored || jsonb_build_object(
              'product_id', v_line.product_id,
              'variant_id', null,
              'quantity', v_give
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_any THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_VALID_QTY');
  END IF;

  SELECT
    bool_and(oi.returned_quantity >= oi.quantity),
    bool_or(oi.returned_quantity > 0)
  INTO v_all_returned, v_any_returned
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  v_return_status := CASE
    WHEN coalesce(v_all_returned, false) THEN 'returned'
    WHEN coalesce(v_any_returned, false) THEN 'partial'
    ELSE 'none'
  END;

  INSERT INTO public.order_returns (
    order_id, user_id, created_by, notes, mark_refunded, is_full, items, restored
  ) VALUES (
    p_order_id,
    v_order.user_id,
    auth.uid(),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_mark_refunded, false),
    coalesce(v_all_returned, false),
    v_snapshot,
    v_restored
  )
  RETURNING id INTO v_return_id;

  UPDATE public.orders
  SET return_status = v_return_status,
      stock_restored_at = CASE
        WHEN coalesce(v_all_returned, false) THEN coalesce(stock_restored_at, now())
        ELSE stock_restored_at
      END,
      order_status = CASE
        WHEN coalesce(v_all_returned, false) AND coalesce(p_cancel_if_full, true)
          THEN 'cancelled'
        ELSE order_status
      END,
      payment_status = CASE
        WHEN coalesce(p_mark_refunded, false) THEN 'refunded'
        ELSE payment_status
      END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'order_id', p_order_id,
    'return_status', v_return_status,
    'is_full', coalesce(v_all_returned, false),
    'restored', v_restored,
    'items', v_snapshot
  );
END;
$function$;

COMMENT ON FUNCTION public.return_order_items(uuid, jsonb, boolean, boolean, text) IS
  'Merchant return of selected order line quantities (partial or full). Restocks inventory and optionally marks payment refunded / cancels when complete.';

REVOKE ALL ON FUNCTION public.return_order_items(uuid, jsonb, boolean, boolean, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.return_order_items(uuid, jsonb, boolean, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.return_order_items(uuid, jsonb, boolean, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. restore_order_stock — only restore remaining (not already returned) units
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_order_stock(
  p_order_id uuid,
  p_cancel_order boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order      public.orders%rowtype;
  v_line       record;
  v_missing    integer;
  v_give       integer;
  v_restored   jsonb := '[]'::jsonb;
  v_has_vars   boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF auth.uid() IS NOT NULL
     AND v_order.user_id <> auth.uid()
     AND NOT public.is_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  IF v_order.stock_applied_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'STOCK_NOT_APPLIED');
  END IF;

  IF v_order.stock_restored_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'already_restored', true,
      'order_id', p_order_id, 'stock_restored_at', v_order.stock_restored_at
    );
  END IF;

  FOR v_line IN
    SELECT oi.product_id,
           oi.variant_id,
           sum(greatest(oi.quantity - coalesce(oi.returned_quantity, 0), 0))::integer AS qty,
           min(oi.product_title) AS title
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id, oi.variant_id
    ORDER BY oi.product_id, oi.variant_id NULLS FIRST
  LOOP
    SELECT coalesce(sum((entry->>'missing')::integer), 0) INTO v_missing
    FROM jsonb_array_elements(coalesce(v_order.stock_shortfall, '[]'::jsonb)) entry
    WHERE (entry->>'product_id')::uuid = v_line.product_id
      AND (
        (
          v_line.variant_id IS NULL
          AND nullif(entry->>'variant_id', '') IS NULL
        )
        OR (
          nullif(entry->>'variant_id', '')::uuid IS NOT DISTINCT FROM v_line.variant_id
        )
      );

    v_give := greatest(v_line.qty - v_missing, 0);
    IF v_give = 0 THEN
      CONTINUE;
    END IF;

    IF v_line.variant_id IS NOT NULL THEN
      UPDATE public.product_variants pv
      SET stock = pv.stock + v_give, updated_at = now()
      FROM public.products p
      WHERE pv.id = v_line.variant_id
        AND p.id = pv.product_id
        AND p.user_id = v_order.user_id;

      IF FOUND THEN
        v_restored := v_restored || jsonb_build_object(
          'product_id', v_line.product_id,
          'variant_id', v_line.variant_id,
          'quantity',   v_give
        );
      END IF;
    ELSE
      SELECT p.has_variants INTO v_has_vars
      FROM public.products p
      WHERE p.id = v_line.product_id
        AND p.user_id = v_order.user_id;

      IF coalesce(v_has_vars, false) THEN
        CONTINUE;
      END IF;

      UPDATE public.products
      SET stock = stock + v_give, updated_at = now()
      WHERE id = v_line.product_id
        AND user_id = v_order.user_id;

      IF FOUND THEN
        v_restored := v_restored || jsonb_build_object(
          'product_id', v_line.product_id,
          'variant_id', null,
          'quantity',   v_give
        );
      END IF;
    END IF;
  END LOOP;

  -- Mark all remaining line quantities as returned.
  UPDATE public.order_items
  SET returned_quantity = quantity
  WHERE order_id = p_order_id
    AND returned_quantity < quantity;

  UPDATE public.orders
  SET stock_restored_at = now(),
      return_status     = 'returned',
      order_status      = CASE WHEN p_cancel_order THEN 'cancelled' ELSE order_status END,
      updated_at        = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_restored', false,
    'order_id', p_order_id,
    'order_cancelled', p_cancel_order,
    'restored', v_restored
  );
END;
$function$;
