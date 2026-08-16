-- Add eAWB order id to orders for proper cancellation via carrier APIs
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS eawb_order_id integer;

-- Optional: simple index to help lookups by eAWB order id (safe even if rarely used)
CREATE INDEX IF NOT EXISTS idx_orders_eawb_order_id ON public.orders (eawb_order_id);
