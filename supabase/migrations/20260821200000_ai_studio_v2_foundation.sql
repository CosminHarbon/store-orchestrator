-- AI Studio V2: additive dual-write columns. V1 draft_spec / published_spec remain authoritative when schema_version = 1.

ALTER TABLE public.ai_storefronts
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.ai_storefronts
  ADD COLUMN IF NOT EXISTS draft_document jsonb;

ALTER TABLE public.ai_storefronts
  ADD COLUMN IF NOT EXISTS published_document jsonb;

ALTER TABLE public.ai_storefronts
  ADD COLUMN IF NOT EXISTS design_spec jsonb;

ALTER TABLE public.ai_storefronts
  ADD COLUMN IF NOT EXISTS brand_design_system jsonb;

ALTER TABLE public.ai_storefronts
  ADD COLUMN IF NOT EXISTS creative_mode text NOT NULL DEFAULT 'balanced';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_storefronts_creative_mode_check'
  ) THEN
    ALTER TABLE public.ai_storefronts
      ADD CONSTRAINT ai_storefronts_creative_mode_check
      CHECK (creative_mode IN ('faithful', 'balanced', 'surprise'));
  END IF;
END $$;

COMMENT ON COLUMN public.ai_storefronts.schema_version IS
  '1 = StorefrontSpec (V1), 2 = SiteDocument (V2). When 1, draft_spec is source of truth.';

COMMENT ON COLUMN public.ai_storefronts.draft_document IS
  'AI Studio V2 SiteTree JSON (SiteDocument). Dual-write alongside draft_spec during migration.';

COMMENT ON COLUMN public.ai_storefronts.design_spec IS
  'Persistent DesignSpec including designIntent / brand memory.';
