-- Add AWB tracking columns to orders table
ALTER TABLE public.orders ADD COLUMN awb_number TEXT;
ALTER TABLE public.orders ADD COLUMN carrier_name TEXT;
ALTER TABLE public.orders ADD COLUMN tracking_url TEXT;
ALTER TABLE public.orders ADD COLUMN estimated_delivery_date DATE;