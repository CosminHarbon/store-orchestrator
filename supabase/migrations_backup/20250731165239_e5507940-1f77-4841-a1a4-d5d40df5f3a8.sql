-- Add invoice link field to orders table
ALTER TABLE public.orders 
ADD COLUMN invoice_link TEXT;