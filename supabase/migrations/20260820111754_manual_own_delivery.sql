-- Own/manual delivery: price-by-order, price-by-distance, coverage limits.

ALTER TABLE public.delivery_pricing_settings
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'distance'
    CHECK (pricing_mode IN ('distance', 'order_value', 'combined')),
  ADD COLUMN IF NOT EXISTS distance_charge TEXT NOT NULL DEFAULT 'per_unit'
    CHECK (distance_charge IN ('flat', 'per_unit')),
  ADD COLUMN IF NOT EXISTS max_distance_km NUMERIC(10,2)
    CHECK (max_distance_km IS NULL OR max_distance_km > 0),
  ADD COLUMN IF NOT EXISTS origin_street TEXT,
  ADD COLUMN IF NOT EXISTS origin_street_number TEXT,
  ADD COLUMN IF NOT EXISTS origin_city TEXT,
  ADD COLUMN IF NOT EXISTS origin_county TEXT;

CREATE TABLE IF NOT EXISTS public.delivery_order_value_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  min_order_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
  max_order_value NUMERIC(12,2) CHECK (max_order_value IS NULL OR max_order_value > min_order_value),
  delivery_fee NUMERIC(12,2) NOT NULL CHECK (delivery_fee >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_order_value_rules_user_idx
  ON public.delivery_order_value_rules (user_id);

ALTER TABLE public.delivery_order_value_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own delivery order value rules" ON public.delivery_order_value_rules;
CREATE POLICY "Owners manage own delivery order value rules"
  ON public.delivery_order_value_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_order_value_rules TO authenticated;
GRANT ALL ON TABLE public.delivery_order_value_rules TO service_role;
REVOKE ALL ON TABLE public.delivery_order_value_rules FROM anon;

DROP TRIGGER IF EXISTS update_delivery_order_value_rules_updated_at ON public.delivery_order_value_rules;
CREATE TRIGGER update_delivery_order_value_rules_updated_at
  BEFORE UPDATE ON public.delivery_order_value_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
