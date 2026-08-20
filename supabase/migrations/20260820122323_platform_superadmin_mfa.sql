-- Platform superadmin: one (or few) operator accounts with MFA (AAL2) required
-- for cross-tenant access. Role is NOT stored on profiles (merchants can UPDATE
-- their own profile). Only service_role / SQL can grant roles.

CREATE TYPE public.app_role AS ENUM ('superadmin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles (user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users may see their own role (for UI routing). Nobody can insert/update/delete
-- via the Data API — grants go through service_role / SQL only.
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('superadmin'::public.app_role);
$$;

-- Cross-tenant access requires verified TOTP (JWT aal = aal2).
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('superadmin'::public.app_role)
    AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

REVOKE ALL ON FUNCTION public.has_role(public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_superadmin_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;

-- Merchant directory for the admin console (includes auth email).
CREATE OR REPLACE FUNCTION public.admin_list_merchants()
RETURNS TABLE (
  user_id uuid,
  store_name text,
  email text,
  setup_completed boolean,
  active_template text,
  shipping_provider text,
  payment_provider text,
  created_at timestamptz,
  order_count bigint,
  product_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.store_name,
    u.email::text,
    coalesce(p.setup_completed, false),
    p.active_template::text,
    p.shipping_provider::text,
    p.payment_provider::text,
    p.created_at,
    (SELECT count(*) FROM public.orders o WHERE o.user_id = p.user_id),
    (SELECT count(*) FROM public.products pr WHERE pr.user_id = p.user_id)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_merchants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_merchants() TO authenticated;

-- ---------------------------------------------------------------------------
-- Cross-tenant SELECT + UPDATE policies (intervention). No DELETE grants.
-- ---------------------------------------------------------------------------

CREATE POLICY "Superadmins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all products"
  ON public.products FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all order items"
  ON public.order_items FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all product images"
  ON public.product_images FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all product images"
  ON public.product_images FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all collections"
  ON public.collections FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all collections"
  ON public.collections FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all product collections"
  ON public.product_collections FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can view all discounts"
  ON public.discounts FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all discounts"
  ON public.discounts FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all product discounts"
  ON public.product_discounts FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Superadmins can view all payment transactions"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all payment transactions"
  ON public.payment_transactions FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all checkout sessions"
  ON public.checkout_sessions FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all checkout sessions"
  ON public.checkout_sessions FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all abandoned carts"
  ON public.abandoned_carts FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all abandoned carts"
  ON public.abandoned_carts FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all reviews"
  ON public.reviews FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all reviews"
  ON public.reviews FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all template blocks"
  ON public.template_blocks FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all template blocks"
  ON public.template_blocks FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all template customization"
  ON public.template_customization FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all template customization"
  ON public.template_customization FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all delivery pricing settings"
  ON public.delivery_pricing_settings FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all delivery pricing settings"
  ON public.delivery_pricing_settings FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all delivery pricing rules"
  ON public.delivery_pricing_rules FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all delivery pricing rules"
  ON public.delivery_pricing_rules FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all delivery order value rules"
  ON public.delivery_order_value_rules FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all delivery order value rules"
  ON public.delivery_order_value_rules FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all ai storefronts"
  ON public.ai_storefronts FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all ai storefronts"
  ON public.ai_storefronts FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all ai conversations"
  ON public.ai_conversations FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all ai conversations"
  ON public.ai_conversations FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all ai messages"
  ON public.ai_messages FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "Superadmins can update all ai messages"
  ON public.ai_messages FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can view all push tokens"
  ON public.push_tokens FOR SELECT TO authenticated
  USING (public.is_superadmin());
