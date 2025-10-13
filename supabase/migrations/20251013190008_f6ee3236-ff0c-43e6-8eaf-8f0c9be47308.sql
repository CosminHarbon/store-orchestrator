-- Add structured address fields to profiles table for eAWB sender address
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS eawb_city text,
ADD COLUMN IF NOT EXISTS eawb_county text,
ADD COLUMN IF NOT EXISTS eawb_street text,
ADD COLUMN IF NOT EXISTS eawb_street_number text;