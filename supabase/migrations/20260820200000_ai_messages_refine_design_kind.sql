-- Allow design-refine kind for multi-model AI Studio credit caps
ALTER TABLE public.ai_messages DROP CONSTRAINT IF EXISTS ai_messages_kind_check;
ALTER TABLE public.ai_messages
  ADD CONSTRAINT ai_messages_kind_check
  CHECK (kind IN ('chat', 'generate', 'refine', 'refine-design', 'publish'));
