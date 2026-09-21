-- Phase 3.5 — internal generation timing telemetry (not exposed to merchant UI).

ALTER TABLE public.cursor_storefront_runs
  ADD COLUMN IF NOT EXISTS timing jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS edit_size text
    CHECK (edit_size IS NULL OR edit_size IN ('small', 'medium', 'large')),
  ADD COLUMN IF NOT EXISTS files_changed integer,
  ADD COLUMN IF NOT EXISTS repair_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cursor_storefront_runs.timing IS
  'Internal Phase 3.5 timing buckets (ms): agent_create, setup, generation, validation, build, repair, packaging, storage, total. Not shown in merchant UI.';
COMMENT ON COLUMN public.cursor_storefront_runs.edit_size IS
  'Heuristic edit classification for follow-ups: small | medium | large.';
COMMENT ON COLUMN public.cursor_storefront_runs.files_changed IS
  'Diagnostic count of files changed in the agent branch (when available).';
COMMENT ON COLUMN public.cursor_storefront_runs.repair_count IS
  'Number of automatic repair passes attempted (cap = 1 in Phase 3.5 policy).';

-- Deduplicate historical complete_run spam so unique(run_id) can apply.
-- Keep earliest row per run_id; clear run_id on extras (versions retain history).
WITH ranked AS (
  SELECT
    id,
    run_id,
    ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.cursor_storefront_versions
  WHERE run_id IS NOT NULL
)
UPDATE public.cursor_storefront_versions AS v
SET run_id = NULL
FROM ranked AS r
WHERE v.id = r.id
  AND r.rn > 1;

-- One artifact version row per Cursor run — stops complete_run poll spam (fake v1→vN).
CREATE UNIQUE INDEX IF NOT EXISTS cursor_storefront_versions_one_per_run
  ON public.cursor_storefront_versions (run_id)
  WHERE run_id IS NOT NULL;
