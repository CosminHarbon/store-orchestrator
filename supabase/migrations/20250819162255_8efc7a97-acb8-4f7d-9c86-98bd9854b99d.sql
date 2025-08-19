-- Add low stock threshold column to products table
ALTER TABLE public.products 
ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 5;

-- Add a comment to document the column
COMMENT ON COLUMN public.products.low_stock_threshold IS 'Threshold for low stock alerts. When stock <= threshold, product is considered low stock';