-- Superadmin full control: INSERT + DELETE on tenant tables (in addition to existing SELECT/UPDATE).
-- Required so platform operators can fully operate a merchant store while impersonating.

CREATE POLICY "Superadmins can insert profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can insert products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete products"
  ON public.products FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete orders"
  ON public.orders FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert order items"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete order items"
  ON public.order_items FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert product images"
  ON public.product_images FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete product images"
  ON public.product_images FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert collections"
  ON public.collections FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete collections"
  ON public.collections FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert product collections"
  ON public.product_collections FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete product collections"
  ON public.product_collections FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert discounts"
  ON public.discounts FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete discounts"
  ON public.discounts FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert product discounts"
  ON public.product_discounts FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete product discounts"
  ON public.product_discounts FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert payment transactions"
  ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete payment transactions"
  ON public.payment_transactions FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert checkout sessions"
  ON public.checkout_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete checkout sessions"
  ON public.checkout_sessions FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert abandoned carts"
  ON public.abandoned_carts FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete abandoned carts"
  ON public.abandoned_carts FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert reviews"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete reviews"
  ON public.reviews FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert template blocks"
  ON public.template_blocks FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete template blocks"
  ON public.template_blocks FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert template customization"
  ON public.template_customization FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete template customization"
  ON public.template_customization FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert delivery pricing settings"
  ON public.delivery_pricing_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete delivery pricing settings"
  ON public.delivery_pricing_settings FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert delivery pricing rules"
  ON public.delivery_pricing_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete delivery pricing rules"
  ON public.delivery_pricing_rules FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert delivery order value rules"
  ON public.delivery_order_value_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete delivery order value rules"
  ON public.delivery_order_value_rules FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert ai storefronts"
  ON public.ai_storefronts FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete ai storefronts"
  ON public.ai_storefronts FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert ai conversations"
  ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete ai conversations"
  ON public.ai_conversations FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can insert ai messages"
  ON public.ai_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "Superadmins can delete ai messages"
  ON public.ai_messages FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can upload merchant storage objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('product-images', 'template-images') AND public.is_superadmin());
CREATE POLICY "Superadmins can update merchant storage objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('product-images', 'template-images') AND public.is_superadmin())
  WITH CHECK (bucket_id IN ('product-images', 'template-images') AND public.is_superadmin());
CREATE POLICY "Superadmins can delete merchant storage objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('product-images', 'template-images') AND public.is_superadmin());

-- Resolve merchant context for edge functions when a verified superadmin acts as a store.
CREATE OR REPLACE FUNCTION public.resolve_acting_user_id(p_acting_as uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_acting_as IS NULL THEN
    RETURN auth.uid();
  END IF;

  IF public.is_superadmin() THEN
    RETURN p_acting_as;
  END IF;

  RAISE EXCEPTION 'not authorized to act as another user';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_acting_user_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_acting_user_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_acting_user_id(uuid) TO service_role;
