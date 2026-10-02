-- Assisted store setup requests submitted from the public landing page.
-- Visitors are usually anonymous, so the table is closed to direct client access:
-- inserts go through submit_store_setup_request (validated, rate limited), reads and
-- updates through superadmin-only RPCs. Complements storefront_design_requests, which
-- stays the in-app flow for signed-in merchants.

CREATE TABLE IF NOT EXISTS public.store_setup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254),
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 160),
  products_description text NOT NULL CHECK (char_length(products_description) BETWEEN 3 AND 1000),
  social_url text CHECK (social_url IS NULL OR char_length(social_url) <= 300),
  contact_preference text NOT NULL CHECK (contact_preference IN ('email', 'call')),
  phone text CHECK (phone IS NULL OR char_length(phone) BETWEEN 6 AND 32),
  message text CHECK (message IS NULL OR char_length(message) <= 2000),
  language text NOT NULL DEFAULT 'ro' CHECK (language IN ('ro', 'en')),
  source text NOT NULL DEFAULT 'landing' CHECK (char_length(source) <= 40),
  -- Set when the visitor happened to be signed in; never trusted from the client.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'in_progress', 'launched', 'declined')),
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_setup_requests_phone_for_call
    CHECK (contact_preference <> 'call' OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS store_setup_requests_created_idx
  ON public.store_setup_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS store_setup_requests_email_created_idx
  ON public.store_setup_requests (lower(email), created_at DESC);

CREATE OR REPLACE FUNCTION public.store_setup_requests_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_setup_requests_updated_at ON public.store_setup_requests;
CREATE TRIGGER store_setup_requests_updated_at
  BEFORE UPDATE ON public.store_setup_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.store_setup_requests_touch_updated_at();

-- RLS on with no client policies: anon/authenticated can never read or write rows directly.
ALTER TABLE public.store_setup_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_setup_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.store_setup_requests TO service_role;

-- Public submission. Returns only the new id so callers can confirm the row was stored.
CREATE OR REPLACE FUNCTION public.submit_store_setup_request(
  p_contact_name text,
  p_email text,
  p_business_name text,
  p_products_description text,
  p_contact_preference text,
  p_social_url text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_language text DEFAULT 'ro'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_contact_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_business text := btrim(coalesce(p_business_name, ''));
  v_products text := btrim(coalesce(p_products_description, ''));
  v_pref text := lower(btrim(coalesce(p_contact_preference, '')));
  v_url text := nullif(btrim(coalesce(p_social_url, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_lang text := CASE WHEN lower(coalesce(p_language, '')) = 'en' THEN 'en' ELSE 'ro' END;
  v_id uuid;
BEGIN
  IF char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_email) > 254 OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_business) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'invalid_business_name' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_products) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'invalid_products' USING ERRCODE = '22023';
  END IF;
  IF v_pref NOT IN ('email', 'call') THEN
    RAISE EXCEPTION 'invalid_contact_preference' USING ERRCODE = '22023';
  END IF;
  IF v_pref = 'call' AND v_phone IS NULL THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND (char_length(v_phone) NOT BETWEEN 6 AND 32 OR v_phone !~ '^\+?[0-9 ().-]+$') THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF v_url IS NOT NULL AND char_length(v_url) > 300 THEN
    RAISE EXCEPTION 'invalid_url' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'invalid_message' USING ERRCODE = '22023';
  END IF;

  -- Abuse guards: a few requests per email per hour, and a global ceiling.
  IF (
    SELECT count(*) FROM public.store_setup_requests
    WHERE lower(email) = v_email AND created_at > now() - interval '1 hour'
  ) >= 3 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
  IF (
    SELECT count(*) FROM public.store_setup_requests
    WHERE created_at > now() - interval '10 minutes'
  ) >= 50 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.store_setup_requests (
    contact_name, email, business_name, products_description, social_url,
    contact_preference, phone, message, language, user_id
  ) VALUES (
    v_name, v_email, v_business, v_products, v_url,
    v_pref, v_phone, v_message, v_lang, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_store_setup_requests()
RETURNS SETOF public.store_setup_requests
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
  FROM public.store_setup_requests
  ORDER BY created_at DESC
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_store_setup_request(
  p_id uuid,
  p_status text DEFAULT NULL,
  p_internal_notes text DEFAULT NULL
)
RETURNS public.store_setup_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.store_setup_requests;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.store_setup_requests
  SET
    status = COALESCE(p_status, status),
    internal_notes = COALESCE(p_internal_notes, internal_notes)
  WHERE id = p_id
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_store_setup_request(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_store_setup_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_store_setup_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_store_setup_request(text, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_store_setup_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_store_setup_request(uuid, text, text) TO authenticated;

COMMENT ON TABLE public.store_setup_requests IS
  'Assisted store setup requests from the landing page. Direct client access denied; use submit/admin RPCs.';
