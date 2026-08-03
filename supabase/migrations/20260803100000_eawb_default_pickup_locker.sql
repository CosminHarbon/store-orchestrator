-- Default pickup locker for eAWB locker-from services (3 & 4)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS eawb_pickup_locker_id text,
  ADD COLUMN IF NOT EXISTS eawb_pickup_locker_name text,
  ADD COLUMN IF NOT EXISTS eawb_pickup_locker_address text,
  ADD COLUMN IF NOT EXISTS eawb_pickup_locker_carrier_id integer,
  ADD COLUMN IF NOT EXISTS eawb_pickup_locker_carrier_code text,
  ADD COLUMN IF NOT EXISTS eawb_pickup_locker_county text,
  ADD COLUMN IF NOT EXISTS eawb_pickup_locker_city text;

COMMENT ON COLUMN public.profiles.eawb_pickup_locker_id IS 'eAWB fixed_location_id used as merchant default pickup locker';
