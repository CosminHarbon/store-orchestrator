-- Phase 2 packaging: expand build_status lifecycle for storefront archives.
-- Additive only. No new tables.

ALTER TABLE public.cursor_storefront_versions
  DROP CONSTRAINT IF EXISTS cursor_storefront_versions_build_status_check;

ALTER TABLE public.cursor_storefront_versions
  ADD CONSTRAINT cursor_storefront_versions_build_status_check
  CHECK (
    build_status IS NULL OR build_status IN (
      'pending',
      'building',
      'packaging',
      'verifying',
      'ready',
      'failed',
      'marker_only'
    )
  );

COMMENT ON COLUMN public.cursor_storefront_versions.build_status IS
  'Artifact readiness: pending → packaging → verifying → ready|failed. marker_only is legacy.';

COMMENT ON COLUMN public.cursor_storefront_versions.status IS
  'Version row lifecycle: captured → stored|failed. ready preview requires status=stored AND build_status=ready.';

COMMENT ON COLUMN public.cursor_storefront_versions.preview_path IS
  'Relative path inside extracted site/ (default index.html) for cursor-storefront-preview.';
