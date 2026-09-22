-- Specialist storefront design requests (human workflow — not Cursor/AI generation).

CREATE TABLE IF NOT EXISTS public.storefront_design_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  store_name text,
  selected_styles text[] NOT NULL DEFAULT '{}'::text[],
  inspiration_text text,
  inspiration_urls text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  inspiration_media_urls text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'submitted',
      'in_review',
      'in_progress',
      'ready_for_review',
      'completed',
      'cancelled'
    )),
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Staff-only. Merchants must never SELECT this column via client wildcards —
  -- use the merchant-safe view / explicit column lists.
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storefront_design_requests_user_created_idx
  ON public.storefront_design_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS storefront_design_requests_status_created_idx
  ON public.storefront_design_requests (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.storefront_design_requests_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storefront_design_requests_updated_at ON public.storefront_design_requests;
CREATE TRIGGER storefront_design_requests_updated_at
  BEFORE UPDATE ON public.storefront_design_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.storefront_design_requests_touch_updated_at();

ALTER TABLE public.storefront_design_requests ENABLE ROW LEVEL SECURITY;

-- Merchant: own rows only
DROP POLICY IF EXISTS storefront_design_requests_select_own ON public.storefront_design_requests;
CREATE POLICY storefront_design_requests_select_own
  ON public.storefront_design_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

DROP POLICY IF EXISTS storefront_design_requests_insert_own ON public.storefront_design_requests;
CREATE POLICY storefront_design_requests_insert_own
  ON public.storefront_design_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'submitted'
    AND assigned_to IS NULL
    AND internal_notes IS NULL
  );

DROP POLICY IF EXISTS storefront_design_requests_update_own_submitted ON public.storefront_design_requests;
CREATE POLICY storefront_design_requests_update_own_submitted
  ON public.storefront_design_requests
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'submitted')
    OR public.is_superadmin()
  )
  WITH CHECK (
    (user_id = auth.uid() AND status = 'submitted')
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS storefront_design_requests_delete_none ON public.storefront_design_requests;
-- Merchants cannot delete; superadmin can soft-cancel via status.
CREATE POLICY storefront_design_requests_delete_superadmin
  ON public.storefront_design_requests
  FOR DELETE
  TO authenticated
  USING (public.is_superadmin());

REVOKE ALL ON TABLE public.storefront_design_requests FROM PUBLIC, anon;
-- Merchants: write + column-scoped read (no internal_notes).
GRANT INSERT, UPDATE ON TABLE public.storefront_design_requests TO authenticated;
GRANT SELECT (
  id, user_id, store_name, selected_styles, inspiration_text, inspiration_urls,
  notes, inspiration_media_urls, status, assigned_to, created_at, updated_at
) ON public.storefront_design_requests TO authenticated;
REVOKE SELECT (internal_notes) ON public.storefront_design_requests FROM authenticated;
GRANT ALL ON TABLE public.storefront_design_requests TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_storefront_design_requests()
RETURNS SETOF public.storefront_design_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT *
  FROM public.storefront_design_requests
  ORDER BY created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_storefront_design_request(
  p_id uuid,
  p_status text DEFAULT NULL,
  p_internal_notes text DEFAULT NULL
)
RETURNS public.storefront_design_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.storefront_design_requests;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.storefront_design_requests
  SET
    status = COALESCE(p_status, status),
    internal_notes = COALESCE(p_internal_notes, internal_notes),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_storefront_design_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_storefront_design_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_storefront_design_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_storefront_design_request(uuid, text, text) TO authenticated;

-- Block merchants from escalating status / writing staff fields.
CREATE OR REPLACE FUNCTION public.storefront_design_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'submitted';
    NEW.assigned_to := NULL;
    NEW.internal_notes := NULL;
    NEW.user_id := auth.uid();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'design_request_locked'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'design_request_status_forbidden'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      RAISE EXCEPTION 'design_request_assign_forbidden'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.internal_notes IS DISTINCT FROM OLD.internal_notes THEN
      RAISE EXCEPTION 'design_request_internal_forbidden'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'design_request_owner_immutable'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storefront_design_request_guard_trg ON public.storefront_design_requests;
CREATE TRIGGER storefront_design_request_guard_trg
  BEFORE INSERT OR UPDATE ON public.storefront_design_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.storefront_design_request_guard();

-- Merchant-safe view without internal_notes (security_invoker so RLS still applies).
CREATE OR REPLACE VIEW public.storefront_design_requests_merchant
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  store_name,
  selected_styles,
  inspiration_text,
  inspiration_urls,
  notes,
  inspiration_media_urls,
  status,
  created_at,
  updated_at
FROM public.storefront_design_requests;

REVOKE ALL ON public.storefront_design_requests_merchant FROM PUBLIC, anon;
GRANT SELECT ON public.storefront_design_requests_merchant TO authenticated;
GRANT ALL ON public.storefront_design_requests_merchant TO service_role;

COMMENT ON TABLE public.storefront_design_requests IS
  'Human specialist storefront design requests. Not Cursor/AI generation.';
COMMENT ON COLUMN public.storefront_design_requests.internal_notes IS
  'Staff-only notes. Merchants should query via storefront_design_requests_merchant view.';
