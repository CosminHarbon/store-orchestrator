-- Merchant UI + storefront locale preference (ro default)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'ro'
CHECK (preferred_language IN ('ro', 'en'));

COMMENT ON COLUMN public.profiles.preferred_language IS 'Merchant UI and storefront locale preference (ro|en)';
