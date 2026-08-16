-- Add invoice tracking fields to orders table
ALTER TABLE public.orders 
ADD COLUMN invoice_number TEXT,
ADD COLUMN invoice_series TEXT;