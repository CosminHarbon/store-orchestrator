ALTER TABLE public.profiles
RENAME COLUMN eawb_delivery_address_id TO eawb_shipping_address_id;

COMMENT ON COLUMN public.profiles.eawb_shipping_address_id IS 'Europarcel shipping/pickup address ID used as address_from.address_from_id for AWB generation';
