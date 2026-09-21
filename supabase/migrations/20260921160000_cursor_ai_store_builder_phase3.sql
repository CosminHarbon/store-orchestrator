-- Track B Phase 3: merchant-facing AI Store Builder (additive only).
-- Does NOT modify free-trial / Track A / active_template / V1-V2 publish paths.

-- =============================================================================
-- cursor_storefront_versions — merchant-facing display label
-- =============================================================================

ALTER TABLE public.cursor_storefront_versions
  ADD COLUMN IF NOT EXISTS display_label text;

COMMENT ON COLUMN public.cursor_storefront_versions.display_label IS
  'Merchant-facing version label derived from the prompt (no second AI call).';

-- =============================================================================
-- cursor_storefront_sessions — conversation + design-sync flag
-- =============================================================================

ALTER TABLE public.cursor_storefront_sessions
  ADD COLUMN IF NOT EXISTS needs_design_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conversation jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cursor_storefront_sessions.needs_design_sync IS
  'True after restoring a prior draft; follow-up must reseed before Cursor edits.';
COMMENT ON COLUMN public.cursor_storefront_sessions.conversation IS
  'Merchant-facing chat transcript: array of {role, text, at, version_id?}.';

-- =============================================================================
-- Restore draft pointer (no Cursor call)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cursor_ai_restore_draft_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  ver public.cursor_storefront_versions%ROWTYPE;
  sess public.cursor_storefront_sessions%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_id_required');
  END IF;

  SELECT * INTO ver
  FROM public.cursor_storefront_versions
  WHERE id = p_version_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF ver.user_id <> caller THEN
    -- Allow service_role callers (gateway) that set request.jwt.claim.sub via
    -- authenticated path; for service_role direct calls, ownership is checked
    -- by the gateway before invoking with owner context. When auth.uid() is
    -- the merchant JWT, enforce ownership here.
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF ver.status IS DISTINCT FROM 'stored' OR ver.build_status IS DISTINCT FROM 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_not_ready');
  END IF;

  -- Prefer the active (non-replaced/archived) session for this merchant.
  SELECT * INTO sess
  FROM public.cursor_storefront_sessions
  WHERE user_id = ver.user_id
    AND status NOT IN ('replaced', 'archived')
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_active_session');
  END IF;

  IF sess.active_run_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'run_already_active',
      'active_run_id', sess.active_run_id
    );
  END IF;

  UPDATE public.cursor_storefront_sessions
  SET
    current_draft_version_id = ver.id,
    needs_design_sync = true,
    updated_at = now()
  WHERE id = sess.id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', sess.id,
    'version_id', ver.id,
    'needs_design_sync', true
  );
END;
$$;

COMMENT ON FUNCTION public.cursor_ai_restore_draft_version(uuid) IS
  'Set current_draft_version_id to an owned ready version and flag needs_design_sync. Does not call Cursor.';

REVOKE ALL ON FUNCTION public.cursor_ai_restore_draft_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cursor_ai_restore_draft_version(uuid) TO authenticated, service_role;

-- Service-role variant used by gateway (ownership already verified).
CREATE OR REPLACE FUNCTION public.cursor_ai_restore_draft_version_admin(
  p_user_id uuid,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ver public.cursor_storefront_versions%ROWTYPE;
  sess public.cursor_storefront_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO ver
  FROM public.cursor_storefront_versions
  WHERE id = p_version_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF ver.status IS DISTINCT FROM 'stored' OR ver.build_status IS DISTINCT FROM 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_not_ready');
  END IF;

  SELECT * INTO sess
  FROM public.cursor_storefront_sessions
  WHERE user_id = p_user_id
    AND status NOT IN ('replaced', 'archived')
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_active_session');
  END IF;

  IF sess.active_run_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'run_already_active',
      'active_run_id', sess.active_run_id
    );
  END IF;

  UPDATE public.cursor_storefront_sessions
  SET
    current_draft_version_id = ver.id,
    needs_design_sync = true,
    updated_at = now()
  WHERE id = sess.id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', sess.id,
    'version_id', ver.id,
    'needs_design_sync', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cursor_ai_restore_draft_version_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cursor_ai_restore_draft_version_admin(uuid, uuid) TO service_role;
