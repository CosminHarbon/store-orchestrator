-- Track B Phase 2: Cursor AI Store Builder foundation extensions (additive only).
-- Does NOT modify free-trial / Track A media / AI Studio publish paths.

-- =============================================================================
-- cursor_storefront_sessions — pipeline + draft pointer
-- =============================================================================

ALTER TABLE public.cursor_storefront_sessions
  ADD COLUMN IF NOT EXISTS current_draft_version_id uuid,
  ADD COLUMN IF NOT EXISTS pipeline_status text,
  ADD COLUMN IF NOT EXISTS runtime_commit_sha text,
  ADD COLUMN IF NOT EXISTS context_strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cursor_storefront_sessions_pipeline_status_check'
  ) THEN
    ALTER TABLE public.cursor_storefront_sessions
      ADD CONSTRAINT cursor_storefront_sessions_pipeline_status_check
      CHECK (
        pipeline_status IS NULL OR pipeline_status IN (
          'queued',
          'preparing_context',
          'cursor_running',
          'validating',
          'repairing',
          'storing_artifact',
          'ready',
          'failed',
          'cancelled',
          'needs_recovery'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.cursor_storefront_sessions.pipeline_status IS
  'Phase 2 generation pipeline state (orthogonal to session.status).';
COMMENT ON COLUMN public.cursor_storefront_sessions.runtime_commit_sha IS
  'Pinned speedvendors-storefront-runtime commit SHA used for the active agent.';
COMMENT ON COLUMN public.cursor_storefront_sessions.context_strategy IS
  'Sanitized context build options (maxProducts, featuredIds, etc.).';

-- FK to versions (added after column exists; versions table already present from Phase 1)
ALTER TABLE public.cursor_storefront_sessions
  DROP CONSTRAINT IF EXISTS cursor_storefront_sessions_current_draft_version_id_fkey;
ALTER TABLE public.cursor_storefront_sessions
  ADD CONSTRAINT cursor_storefront_sessions_current_draft_version_id_fkey
  FOREIGN KEY (current_draft_version_id)
  REFERENCES public.cursor_storefront_versions (id)
  ON DELETE SET NULL;

-- RLS unchanged: select-own + superadmin; writes service_role only (Phase 1).

-- =============================================================================
-- cursor_storefront_versions — lineage + prompt/manifest metadata
-- =============================================================================

ALTER TABLE public.cursor_storefront_versions
  ADD COLUMN IF NOT EXISTS parent_version_id uuid,
  ADD COLUMN IF NOT EXISTS prompt text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preview_path text,
  ADD COLUMN IF NOT EXISTS is_immutable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS build_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cursor_storefront_versions_build_status_check'
  ) THEN
    ALTER TABLE public.cursor_storefront_versions
      ADD CONSTRAINT cursor_storefront_versions_build_status_check
      CHECK (
        build_status IS NULL OR build_status IN (
          'pending',
          'building',
          'ready',
          'failed',
          'marker_only'
        )
      );
  END IF;
END $$;

ALTER TABLE public.cursor_storefront_versions
  DROP CONSTRAINT IF EXISTS cursor_storefront_versions_parent_version_id_fkey;
ALTER TABLE public.cursor_storefront_versions
  ADD CONSTRAINT cursor_storefront_versions_parent_version_id_fkey
  FOREIGN KEY (parent_version_id)
  REFERENCES public.cursor_storefront_versions (id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.cursor_storefront_versions.parent_version_id IS
  'Prior draft this version was edited from (follow-up lineage).';
COMMENT ON COLUMN public.cursor_storefront_versions.is_immutable IS
  'Once stored, versions are immutable; edits create a new version.';

-- RLS unchanged: select-own + superadmin; writes service_role only (Phase 1).

-- =============================================================================
-- Private storage bucket: cursor-storefront-artifacts
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cursor-storefront-artifacts', 'cursor-storefront-artifacts', false, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = false;

-- No public / anon / authenticated read. Explicit service_role policies only.
DROP POLICY IF EXISTS cursor_storefront_artifacts_service_insert ON storage.objects;
CREATE POLICY cursor_storefront_artifacts_service_insert
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'cursor-storefront-artifacts');

DROP POLICY IF EXISTS cursor_storefront_artifacts_service_select ON storage.objects;
CREATE POLICY cursor_storefront_artifacts_service_select
  ON storage.objects
  FOR SELECT
  TO service_role
  USING (bucket_id = 'cursor-storefront-artifacts');

DROP POLICY IF EXISTS cursor_storefront_artifacts_service_update ON storage.objects;
CREATE POLICY cursor_storefront_artifacts_service_update
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'cursor-storefront-artifacts')
  WITH CHECK (bucket_id = 'cursor-storefront-artifacts');
