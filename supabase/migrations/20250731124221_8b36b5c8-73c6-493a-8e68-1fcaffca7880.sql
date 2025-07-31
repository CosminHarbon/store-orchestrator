-- Add Oblio.eu specific configuration fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN oblio_series_name TEXT,
ADD COLUMN oblio_first_number TEXT;