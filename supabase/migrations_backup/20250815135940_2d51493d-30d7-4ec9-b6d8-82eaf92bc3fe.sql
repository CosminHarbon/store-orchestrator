-- Add netpopia_public_key field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN netpopia_public_key text;