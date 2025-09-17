-- Add eAWB.ro delivery configuration to profiles table
ALTER TABLE public.profiles 
ADD COLUMN eawb_api_key text,
ADD COLUMN eawb_name text,
ADD COLUMN eawb_email text,
ADD COLUMN eawb_phone text,
ADD COLUMN eawb_address text;