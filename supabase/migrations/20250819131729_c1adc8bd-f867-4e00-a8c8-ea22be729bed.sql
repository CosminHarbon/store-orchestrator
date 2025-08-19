-- Create discounts table
CREATE TABLE public.discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create product_discounts junction table
CREATE TABLE public.product_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  discount_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, discount_id)
);

-- Enable RLS on discounts table
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for discounts
CREATE POLICY "Users can view their own discounts" ON public.discounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own discounts" ON public.discounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own discounts" ON public.discounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own discounts" ON public.discounts
  FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on product_discounts table
ALTER TABLE public.product_discounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for product_discounts
CREATE POLICY "Users can view product discounts for their products" ON public.product_discounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products 
      WHERE products.id = product_discounts.product_id 
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create product discounts for their products" ON public.product_discounts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM products 
      WHERE products.id = product_discounts.product_id 
      AND products.user_id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM discounts 
      WHERE discounts.id = product_discounts.discount_id 
      AND discounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete product discounts for their products" ON public.product_discounts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM products 
      WHERE products.id = product_discounts.product_id 
      AND products.user_id = auth.uid()
    )
  );

-- Add trigger for updated_at on discounts
CREATE TRIGGER update_discounts_updated_at
  BEFORE UPDATE ON public.discounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();