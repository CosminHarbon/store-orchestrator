-- Add payment and delivery fee settings to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cash_payment_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS cash_payment_fee numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_delivery_fee numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS locker_delivery_fee numeric(10,2) DEFAULT 0;