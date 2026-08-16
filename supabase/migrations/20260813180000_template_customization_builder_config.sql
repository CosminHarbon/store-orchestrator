-- Persist visual website builder section order/visibility.
ALTER TABLE public.template_customization
ADD COLUMN IF NOT EXISTS builder_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.template_customization.builder_config IS
  'Website builder config: homepage section order, visibility, and editor metadata';
