-- Free delivery toggle and optional customer-facing delivery message.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_delivery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_message TEXT;

COMMENT ON COLUMN public.profiles.free_delivery IS
  'When true, storefront and orders charge 0 for home and locker delivery.';
COMMENT ON COLUMN public.profiles.delivery_message IS
  'Optional message shown to customers near delivery options at checkout.';
