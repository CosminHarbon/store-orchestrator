-- Create reviews table
CREATE TABLE public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- Store owner ID (for RLS)
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view approved reviews (for public storefront)
CREATE POLICY "Anyone can view approved reviews"
ON public.reviews
FOR SELECT
USING (is_approved = true);

-- Store owners can view all reviews for their products
CREATE POLICY "Store owners can view all reviews for their products"
ON public.reviews
FOR SELECT
USING (auth.uid() = user_id);

-- Anyone can create reviews (customers submitting reviews)
CREATE POLICY "Anyone can create reviews"
ON public.reviews
FOR INSERT
WITH CHECK (true);

-- Store owners can update reviews for their products (approve/unapprove)
CREATE POLICY "Store owners can update their reviews"
ON public.reviews
FOR UPDATE
USING (auth.uid() = user_id);

-- Store owners can delete reviews for their products
CREATE POLICY "Store owners can delete their reviews"
ON public.reviews
FOR DELETE
USING (auth.uid() = user_id);

-- Add show_reviews setting to template_customization
ALTER TABLE public.template_customization 
ADD COLUMN IF NOT EXISTS show_reviews BOOLEAN DEFAULT true;

-- Create trigger for updated_at
CREATE TRIGGER update_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();