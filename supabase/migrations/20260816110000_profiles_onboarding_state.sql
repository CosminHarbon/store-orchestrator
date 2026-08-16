-- Persist store setup wizard progress (skip/resume) without per-step columns.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.onboarding_state IS
  'Store setup wizard state: current_step, per-step status, selected_template';

-- Existing merchants must not be forced into the new wizard.
-- Established accounts: mark setup complete.
UPDATE public.profiles p
SET
  welcome_dismissed = true,
  setup_completed = true
WHERE
  COALESCE(setup_completed, false) = false
  AND (
    EXISTS (SELECT 1 FROM public.products pr WHERE pr.user_id = p.user_id LIMIT 1)
    OR (
      NULLIF(BTRIM(COALESCE(p.netpopia_api_key, '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(p.netpopia_signature, '')), '') IS NOT NULL
    )
    OR NULLIF(BTRIM(COALESCE(p.eawb_api_key, '')), '') IS NOT NULL
    OR (
      p.store_name IS NOT NULL
      AND BTRIM(p.store_name) <> ''
      AND BTRIM(p.store_name) <> 'My Store'
    )
  );

-- All remaining existing profiles: dismiss auto-open only.
UPDATE public.profiles
SET welcome_dismissed = true
WHERE COALESCE(welcome_dismissed, false) = false;
