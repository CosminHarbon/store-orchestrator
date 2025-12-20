-- Fix linter WARN: Function Search Path Mutable
-- Set a fixed search_path for the trigger function.
ALTER FUNCTION public.update_product_stock() SET search_path TO '';
