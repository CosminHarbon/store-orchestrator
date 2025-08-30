-- Add Woot.ro shipping provider columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN woot_api_key text,
ADD COLUMN woot_name text,
ADD COLUMN woot_email text;