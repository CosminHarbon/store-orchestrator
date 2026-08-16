-- Add eAWB configuration fields to profiles for billing and default carrier/service
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS eawb_billing_address_id INTEGER,
  ADD COLUMN IF NOT EXISTS eawb_default_carrier_id INTEGER,
  ADD COLUMN IF NOT EXISTS eawb_default_service_id INTEGER;