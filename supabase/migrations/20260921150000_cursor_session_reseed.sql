-- Track B Phase 2: session reseed / replacement support (additive).
-- runtime_commit_sha is immutable for a session; upgrades require create_replacement_session.

-- =============================================================================
-- Replacement lineage columns
-- =============================================================================

ALTER TABLE public.cursor_storefront_sessions
  ADD COLUMN IF NOT EXISTS replaced_by_session_id uuid,
  ADD COLUMN IF NOT EXISTS replaced_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cursor_storefront_sessions_replaced_by_session_id_fkey'
  ) THEN
    ALTER TABLE public.cursor_storefront_sessions
      ADD CONSTRAINT cursor_storefront_sessions_replaced_by_session_id_fkey
      FOREIGN KEY (replaced_by_session_id)
      REFERENCES public.cursor_storefront_sessions (id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.cursor_storefront_sessions.runtime_commit_sha IS
  'Pinned speedvendors-storefront-runtime commit SHA for this session. Immutable once set; upgrades require create_replacement_session / reseed (new session row).';
COMMENT ON COLUMN public.cursor_storefront_sessions.replaced_by_session_id IS
  'When status=replaced, the successor session created by create_replacement_session.';
COMMENT ON COLUMN public.cursor_storefront_sessions.replaced_at IS
  'Timestamp when this session was superseded by a reseed/replacement.';
COMMENT ON COLUMN public.cursor_storefront_sessions.replacement_reason IS
  'Why this session was replaced (e.g. runtime tip upgrade).';

-- =============================================================================
-- Status: allow replaced (archived already present from Phase 1)
-- =============================================================================

ALTER TABLE public.cursor_storefront_sessions
  DROP CONSTRAINT IF EXISTS cursor_storefront_sessions_status_check;

ALTER TABLE public.cursor_storefront_sessions
  ADD CONSTRAINT cursor_storefront_sessions_status_check
  CHECK (status IN (
    'idle',
    'provisioning',
    'ready',
    'running',
    'error',
    'archived',
    'replaced'
  ));

-- =============================================================================
-- Allow multiple historical sessions per user; one non-terminal at a time
-- =============================================================================

ALTER TABLE public.cursor_storefront_sessions
  DROP CONSTRAINT IF EXISTS cursor_storefront_sessions_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS cursor_storefront_sessions_one_active_per_user
  ON public.cursor_storefront_sessions (user_id)
  WHERE status NOT IN ('replaced', 'archived');

-- =============================================================================
-- Claim / gate RPCs: operate on the active (non-replaced/archived) session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cursor_ai_may_start_run(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ent public.cursor_ai_entitlements%ROWTYPE;
  has_app_access boolean;
  active_run uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  has_app_access := public.user_has_speedvendors_access(p_user_id);
  IF has_app_access IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_app_access');
  END IF;

  SELECT * INTO ent FROM public.cursor_ai_entitlements WHERE user_id = p_user_id;
  IF NOT FOUND OR ent.enabled IS NOT TRUE OR ent.backend_feature_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ai_entitlement_disabled');
  END IF;

  IF ent.budget_cents IS NOT NULL AND ent.spent_charged_cents >= ent.budget_cents THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ai_budget_exhausted');
  END IF;

  IF ent.max_runs IS NOT NULL AND ent.runs_used >= ent.max_runs THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ai_runs_exhausted');
  END IF;

  SELECT s.active_run_id INTO active_run
  FROM public.cursor_storefront_sessions s
  WHERE s.user_id = p_user_id
    AND s.status NOT IN ('replaced', 'archived')
  LIMIT 1;

  IF active_run IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'run_already_active',
      'active_run_id', active_run
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'plan_kind', ent.plan_kind,
    'budget_cents', ent.budget_cents,
    'spent_charged_cents', ent.spent_charged_cents
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cursor_ai_claim_run(
  p_user_id uuid,
  p_idempotency_key text,
  p_run_type text,
  p_prompt text,
  p_model text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate jsonb;
  sess public.cursor_storefront_sessions%ROWTYPE;
  existing public.cursor_storefront_runs%ROWTYPE;
  new_run public.cursor_storefront_runs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  gate := public.cursor_ai_may_start_run(p_user_id);
  IF (gate->>'allowed')::boolean IS NOT TRUE THEN
    NULL;
  END IF;

  SELECT * INTO sess
  FROM public.cursor_storefront_sessions
  WHERE user_id = p_user_id
    AND status NOT IN ('replaced', 'archived')
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.cursor_storefront_sessions (user_id, status)
    VALUES (p_user_id, 'idle')
    RETURNING * INTO sess;
  END IF;

  SELECT * INTO existing
  FROM public.cursor_storefront_runs
  WHERE session_id = sess.id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reused', true,
      'run_id', existing.id,
      'cursor_run_id', existing.cursor_run_id,
      'status', existing.status,
      'session_id', sess.id,
      'cursor_agent_id', sess.cursor_agent_id
    );
  END IF;

  IF (gate->>'allowed')::boolean IS NOT TRUE THEN
    INSERT INTO public.cursor_storefront_runs (
      session_id, user_id, run_type, status, idempotency_key, prompt, model, error_category
    ) VALUES (
      sess.id, p_user_id, COALESCE(p_run_type, 'initial'),
      CASE
        WHEN gate->>'reason' = 'run_already_active' THEN 'rejected_concurrency'
        ELSE 'rejected_entitlement'
      END,
      p_idempotency_key, p_prompt, p_model, gate->>'reason'
    )
    RETURNING * INTO new_run;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', gate->>'reason',
      'run_id', new_run.id,
      'session_id', sess.id,
      'active_run_id', gate->'active_run_id'
    );
  END IF;

  INSERT INTO public.cursor_storefront_runs (
    session_id, user_id, run_type, status, idempotency_key, prompt, model, started_at
  ) VALUES (
    sess.id, p_user_id, COALESCE(p_run_type, 'initial'), 'queued',
    p_idempotency_key, p_prompt, p_model, now()
  )
  RETURNING * INTO new_run;

  UPDATE public.cursor_storefront_sessions
  SET active_run_id = new_run.id, status = 'running', updated_at = now()
  WHERE id = sess.id;

  RETURN jsonb_build_object(
    'ok', true,
    'reused', false,
    'run_id', new_run.id,
    'session_id', sess.id,
    'cursor_agent_id', sess.cursor_agent_id
  );
END;
$$;
