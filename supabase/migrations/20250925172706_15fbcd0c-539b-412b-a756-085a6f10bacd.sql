-- Fix carriers table with correct Romanian carrier data
-- First, clear any existing data
DELETE FROM public.carrier_services;
DELETE FROM public.carriers;

-- Reset sequences to ensure clean IDs
ALTER SEQUENCE carriers_id_seq RESTART WITH 1;
ALTER SEQUENCE carrier_services_id_seq RESTART WITH 1;

-- Insert correct Romanian carriers with their specific IDs
INSERT INTO public.carriers (id, name, code, logo_url, is_active, api_base_url, created_at, updated_at) VALUES
(1, 'Cargus', 'CARGUS', 'https://www.cargus.ro/favicon.ico', true, 'https://api.europarcel.com/api/public', now(), now()),
(2, 'DPD', 'DPD', 'https://www.dpd.com/favicon.ico', true, 'https://api.europarcel.com/api/public', now(), now()),
(3, 'FAN Courier', 'FAN', 'https://www.fancourier.ro/favicon.ico', true, 'https://api.europarcel.com/api/public', now(), now()),
(4, 'GLS', 'GLS', 'https://gls-group.eu/favicon.ico', true, 'https://api.europarcel.com/api/public', now(), now()),
(6, 'Sameday', 'SAMEDAY', 'https://www.sameday.ro/favicon.ico', true, 'https://api.europarcel.com/api/public', now(), now());

-- Reset the sequence to continue from the highest ID
SELECT setval('carriers_id_seq', (SELECT MAX(id) FROM public.carriers));

-- Update profiles table to use integer IDs for eAWB configuration
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS eawb_customer_id integer,
ALTER COLUMN eawb_default_carrier_id TYPE integer USING eawb_default_carrier_id::integer,
ALTER COLUMN eawb_default_service_id TYPE integer USING eawb_default_service_id::integer,
ALTER COLUMN eawb_billing_address_id TYPE integer USING eawb_billing_address_id::integer;