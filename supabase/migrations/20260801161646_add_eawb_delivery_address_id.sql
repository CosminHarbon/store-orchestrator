ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS eawb_delivery_address_id integer;

COMMENT ON COLUMN public.profiles.eawb_delivery_address_id IS 'Europarcel delivery address ID used as address_from.address_from_id for AWB generation';
