-- Add integration provider columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN invoicing_provider TEXT DEFAULT 'oblio.eu',
ADD COLUMN shipping_provider TEXT DEFAULT 'sameday', 
ADD COLUMN payment_provider TEXT DEFAULT 'netpopia';