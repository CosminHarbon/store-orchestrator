-- Track B Phase 1: Cursor AI Store Builder foundation (additive only).
-- Merchant identity in SpeedVendors is profiles.user_id (no separate stores table).
-- Does NOT modify free-trial / Track A media architecture.

-- =============================================================================
-- cursor_ai_entitlements — AI-specific allowance ON TOP of app access
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cursor_ai_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  -- trial | paid | admin_override | none
  plan_kind text NOT NULL DEFAULT 'none'
    CHECK (plan_kind IN ('none', 'trial', 'paid', 'admin_override')),
  enabled boolean NOT NULL DEFAULT false,
  -- Soft budget targets in USD cents of *actual Cursor charged cost* (not tokens).
  -- Trial target ≈ $2 → 200. NULL = unset / not enforced yet in Phase 1.
  budget_cents integer CHECK (budget_cents IS NULL OR budget_cents >= 0),
  spent_charged_cents integer NOT NULL DEFAULT 0 CHECK (spent_charged_cents >= 0),
  max_runs integer CHECK (max_runs IS NULL OR max_runs >= 0),
  runs_used integer NOT NULL DEFAULT 0 CHECK (runs_used >= 0),
  -- Backend feature gate independent of VITE_* frontend flags.
  backend_feature_enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cursor_ai_entitlements IS
  'Cursor AI Store Builder allowance. Application trial/paid access is separate; this row gates AI spend.';

CREATE INDEX IF NOT EXISTS cursor_ai_entitlements_enabled_idx
  ON public.cursor_ai_entitlements (enabled)
  WHERE enabled = true;

DROP TRIGGER IF EXISTS cursor_ai_entitlements_updated_at ON public.cursor_ai_entitlements;
CREATE TRIGGER cursor_ai_entitlements_updated_at
  BEFORE UPDATE ON public.cursor_ai_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cursor_ai_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cursor_ai_entitlements_select_own ON public.cursor_ai_entitlements;
CREATE POLICY cursor_ai_entitlements_select_own
  ON public.cursor_ai_entitlements
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

-- Merchants must not self-grant AI entitlement.
REVOKE ALL ON TABLE public.cursor_ai_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cursor_ai_entitlements TO authenticated;
GRANT ALL ON TABLE public.cursor_ai_entitlements TO service_role;

-- =============================================================================
-- cursor_storefront_sessions — one durable Cursor agent per merchant
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cursor_storefront_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  cursor_agent_id text
    CHECK (cursor_agent_id IS NULL OR cursor_agent_id ~ '^bc-'),
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN (
      'idle',
      'provisioning',
      'ready',
      'running',
      'error',
      'archived'
    )),
  runtime_revision text NOT NULL DEFAULT 'phase1',
  runtime_repo_url text,
  runtime_starting_ref text,
  active_run_id uuid,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cursor_storefront_sessions IS
  'Maps a SpeedVendors merchant (profiles.user_id) to one durable Cursor Cloud Agent (bc-…).';

CREATE UNIQUE INDEX IF NOT EXISTS cursor_storefront_sessions_agent_uidx
  ON public.cursor_storefront_sessions (cursor_agent_id)
  WHERE cursor_agent_id IS NOT NULL;

DROP TRIGGER IF EXISTS cursor_storefront_sessions_updated_at ON public.cursor_storefront_sessions;
CREATE TRIGGER cursor_storefront_sessions_updated_at
  BEFORE UPDATE ON public.cursor_storefront_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cursor_storefront_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cursor_storefront_sessions_select_own ON public.cursor_storefront_sessions;
CREATE POLICY cursor_storefront_sessions_select_own
  ON public.cursor_storefront_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

-- Writes only via service_role (Edge gateway).
REVOKE ALL ON TABLE public.cursor_storefront_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cursor_storefront_sessions TO authenticated;
GRANT ALL ON TABLE public.cursor_storefront_sessions TO service_role;

-- =============================================================================
-- cursor_storefront_runs — per initial / edit / repair run
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cursor_storefront_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cursor_storefront_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  cursor_run_id text,
  run_type text NOT NULL DEFAULT 'initial'
    CHECK (run_type IN ('initial', 'followup', 'repair', 'cancel_probe')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'creating',
      'running',
      'finished',
      'error',
      'cancelled',
      'expired',
      'rejected_concurrency',
      'rejected_entitlement'
    )),
  idempotency_key text NOT NULL,
  prompt text,
  model text,
  -- Token usage (from REST /v1/agents/.../usage)
  input_tokens integer,
  output_tokens integer,
  cache_write_tokens integer,
  cache_read_tokens integer,
  total_tokens integer,
  usage_uuid text,
  -- Cost accounting — explicitly distinguished
  estimated_cost_cents numeric(12, 4),
  actual_raw_cost_cents numeric(12, 4),
  actual_charged_cents numeric(12, 4),
  cost_reconciliation_status text NOT NULL DEFAULT 'pending'
    CHECK (cost_reconciliation_status IN (
      'pending',
      'tokens_only',
      'estimated',
      'reconciled',
      'unavailable',
      'error'
    )),
  error_category text,
  error_message text,
  stream_last_event_id text,
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cursor_storefront_runs_idempotency_unique UNIQUE (session_id, idempotency_key)
);

COMMENT ON COLUMN public.cursor_storefront_runs.estimated_cost_cents IS
  'Approximate $ from token×price tables — NOT authoritative billing.';
COMMENT ON COLUMN public.cursor_storefront_runs.actual_charged_cents IS
  'Authoritative charged amount from Cursor REST GET …/usage cost.chargedCents (and/or SDK Agent.getUsage) when settled.';

CREATE INDEX IF NOT EXISTS cursor_storefront_runs_session_created_idx
  ON public.cursor_storefront_runs (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cursor_storefront_runs_user_created_idx
  ON public.cursor_storefront_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cursor_storefront_runs_active_idx
  ON public.cursor_storefront_runs (session_id)
  WHERE status IN ('queued', 'creating', 'running');

DROP TRIGGER IF EXISTS cursor_storefront_runs_updated_at ON public.cursor_storefront_runs;
CREATE TRIGGER cursor_storefront_runs_updated_at
  BEFORE UPDATE ON public.cursor_storefront_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cursor_storefront_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cursor_storefront_runs_select_own ON public.cursor_storefront_runs;
CREATE POLICY cursor_storefront_runs_select_own
  ON public.cursor_storefront_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

REVOKE ALL ON TABLE public.cursor_storefront_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cursor_storefront_runs TO authenticated;
GRANT ALL ON TABLE public.cursor_storefront_runs TO service_role;

-- FK from sessions.active_run_id → runs (added after runs exists)
ALTER TABLE public.cursor_storefront_sessions
  DROP CONSTRAINT IF EXISTS cursor_storefront_sessions_active_run_id_fkey;
ALTER TABLE public.cursor_storefront_sessions
  ADD CONSTRAINT cursor_storefront_sessions_active_run_id_fkey
  FOREIGN KEY (active_run_id) REFERENCES public.cursor_storefront_runs (id)
  ON DELETE SET NULL;

-- =============================================================================
-- cursor_storefront_versions — immutable artifact ownership (prepare structure)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cursor_storefront_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cursor_storefront_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.cursor_storefront_runs (id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  -- Cursor-relative artifact path at capture time (temporary).
  cursor_artifact_path text,
  -- SpeedVendors-owned storage keys (filled when we ingest; live site must use these).
  storage_bucket text,
  storage_path text,
  content_sha256 text,
  content_size_bytes bigint,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'captured', 'stored', 'failed', 'superseded')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cursor_storefront_versions_session_version_unique UNIQUE (session_id, version_number)
);

COMMENT ON TABLE public.cursor_storefront_versions IS
  'Immutable storefront artifact versions. Cursor presigned URLs are transient; SV storage is authoritative.';

CREATE INDEX IF NOT EXISTS cursor_storefront_versions_user_idx
  ON public.cursor_storefront_versions (user_id, created_at DESC);

ALTER TABLE public.cursor_storefront_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cursor_storefront_versions_select_own ON public.cursor_storefront_versions;
CREATE POLICY cursor_storefront_versions_select_own
  ON public.cursor_storefront_versions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

REVOKE ALL ON TABLE public.cursor_storefront_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cursor_storefront_versions TO authenticated;
GRANT ALL ON TABLE public.cursor_storefront_versions TO service_role;

-- =============================================================================
-- Entitlement helper — reject BEFORE any Cursor call
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

  -- App access (trial / paid / superadmin via user_has_speedvendors_access) is
  -- prerequisite, not sufficient alone — AI entitlement is a second gate.
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
  WHERE s.user_id = p_user_id;

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

REVOKE ALL ON FUNCTION public.cursor_ai_may_start_run(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cursor_ai_may_start_run(uuid) TO service_role;

-- =============================================================================
-- Atomic run claim (concurrency + idempotency)
-- =============================================================================

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
    -- Idempotent retry of the same key is handled below after session ensure;
    -- entitlement rejection still applies for new keys.
    NULL;
  END IF;

  INSERT INTO public.cursor_storefront_sessions (user_id, status)
  VALUES (p_user_id, 'idle')
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO sess FROM public.cursor_storefront_sessions WHERE user_id = p_user_id FOR UPDATE;

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

REVOKE ALL ON FUNCTION public.cursor_ai_claim_run(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cursor_ai_claim_run(uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cursor_ai_release_run(
  p_run_id uuid,
  p_status text,
  p_cursor_run_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.cursor_storefront_runs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.cursor_storefront_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.cursor_storefront_runs
  SET
    status = COALESCE(p_status, status),
    cursor_run_id = COALESCE(p_cursor_run_id, cursor_run_id),
    finished_at = CASE
      WHEN COALESCE(p_status, status) IN ('finished', 'error', 'cancelled', 'expired',
        'rejected_concurrency', 'rejected_entitlement') THEN now()
      ELSE finished_at
    END,
    updated_at = now()
  WHERE id = p_run_id;

  UPDATE public.cursor_storefront_sessions
  SET
    active_run_id = CASE WHEN active_run_id = p_run_id THEN NULL ELSE active_run_id END,
    status = CASE WHEN active_run_id = p_run_id THEN 'ready' ELSE status END,
    updated_at = now()
  WHERE id = r.session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cursor_ai_release_run(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cursor_ai_release_run(uuid, text, text) TO service_role;
