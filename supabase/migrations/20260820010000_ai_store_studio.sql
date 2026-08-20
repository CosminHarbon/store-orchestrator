-- AI Store Studio: storefront drafts, conversations, and canonical active template.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_template text NOT NULL DEFAULT 'elementar';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_active_template_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_template_check
  CHECK (active_template IN ('elementar', 'premium', 'floral', 'ai'));

COMMENT ON COLUMN public.profiles.active_template IS
  'Canonical public storefront: elementar | premium | floral | ai';

CREATE TABLE IF NOT EXISTS public.ai_storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_spec jsonb,
  published_spec jsonb,
  draft_customization jsonb,
  status text NOT NULL DEFAULT 'idle',
  active boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  quality text NOT NULL DEFAULT 'fast',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT ai_storefronts_status_check CHECK (status IN ('idle', 'generating', 'ready', 'error')),
  CONSTRAINT ai_storefronts_quality_check CHECK (quality IN ('fast', 'studio')),
  CONSTRAINT ai_storefronts_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storefront_id uuid NOT NULL REFERENCES public.ai_storefronts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text,
  brief_json jsonb,
  spec_json jsonb,
  patches_json jsonb,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  estimated_cost_usd numeric(12, 6),
  quality text,
  kind text NOT NULL DEFAULT 'chat',
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_role_check CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT ai_messages_kind_check CHECK (kind IN ('chat', 'generate', 'refine', 'publish')),
  CONSTRAINT ai_messages_status_check CHECK (status IN ('ok', 'error'))
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON public.ai_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ai_messages_user_created_idx ON public.ai_messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON public.ai_conversations (user_id);

DROP TRIGGER IF EXISTS update_ai_storefronts_updated_at ON public.ai_storefronts;
CREATE TRIGGER update_ai_storefronts_updated_at
  BEFORE UPDATE ON public.ai_storefronts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_conversations_updated_at ON public.ai_conversations;
CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage ai storefronts" ON public.ai_storefronts;
CREATE POLICY "Owners manage ai storefronts"
  ON public.ai_storefronts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public customers read published_spec via store-api (service role), not this table.

DROP POLICY IF EXISTS "Owners manage ai conversations" ON public.ai_conversations;
CREATE POLICY "Owners manage ai conversations"
  ON public.ai_conversations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners manage ai messages" ON public.ai_messages;
CREATE POLICY "Owners manage ai messages"
  ON public.ai_messages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.ai_storefronts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ai_conversations TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ai_messages TO anon, authenticated, service_role;
