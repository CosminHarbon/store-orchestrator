-- Reviews moderation fields (status, merchant reply, internal notes)
-- Keeps is_approved in sync for storefront API compatibility

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS merchant_reply text,
  ADD COLUMN IF NOT EXISTS merchant_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_notes text;

-- Backfill status from legacy is_approved
UPDATE public.reviews
SET status = CASE WHEN is_approved THEN 'approved' ELSE 'pending' END
WHERE status IS NULL OR status = 'pending';

UPDATE public.reviews
SET status = 'approved'
WHERE is_approved = true AND status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_status_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'spam'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_review_is_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_approved := (NEW.status = 'approved');
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_review_is_approved ON public.reviews;
CREATE TRIGGER sync_review_is_approved
  BEFORE INSERT OR UPDATE OF status ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_review_is_approved();

CREATE INDEX IF NOT EXISTS reviews_user_id_status_idx ON public.reviews (user_id, status);
CREATE INDEX IF NOT EXISTS reviews_product_id_idx ON public.reviews (product_id);
