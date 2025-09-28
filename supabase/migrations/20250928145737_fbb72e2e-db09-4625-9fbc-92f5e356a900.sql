-- Add structured address fields to orders table
ALTER TABLE public.orders 
ADD COLUMN customer_city text,
ADD COLUMN customer_county text,  
ADD COLUMN customer_street text,
ADD COLUMN customer_street_number text,
ADD COLUMN customer_block text,
ADD COLUMN customer_apartment text;