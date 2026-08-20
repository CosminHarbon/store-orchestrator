import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabaseClient';
import { parseStorefrontSpec, type GenerateStatusStep, type StorefrontSpec, type StudioQuality } from './spec';

export interface StudioMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface StreamEvent {
  step?: GenerateStatusStep;
  message?: string;
  spec?: StorefrontSpec;
  conversationId?: string;
  error?: string;
  llm?: string;
  llmError?: string;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
  };
}

export async function streamStudioFunction(
  name: 'ai-studio-generate' | 'ai-studio-refine',
  body: Record<string, unknown>,
  onEvent: (event: string, data: StreamEvent) => void
): Promise<StreamEvent> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    let error = text;
    try {
      error = JSON.parse(text).error || text;
    } catch {
      /* ignore */
    }
    throw new Error(error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let last: StreamEvent = {};

  const flush = (chunk: string) => {
    const blocks = chunk.split('\n\n');
    for (const block of blocks) {
      if (!block.trim()) continue;
      let event = 'message';
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        const data = JSON.parse(dataLine) as StreamEvent;
        if (data.spec) {
          try {
            const parsed = parseStorefrontSpec(data.spec);
            console.log('[ai-studio client] SSE spec parsed', {
              event,
              layoutId: parsed.spec.layoutId,
              faq: parsed.spec.copy?.faq,
              primary: parsed.spec.tokens?.primary,
              warnings: parsed.warnings,
            });
            data.spec = parsed.spec;
          } catch (err) {
            console.warn('[ai-studio client] SSE spec parse failed, keeping raw', err);
          }
        }
        last = { ...last, ...data };
        onEvent(event, data);
      } catch {
        /* skip malformed */
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    flush(parts.join('\n\n') + (parts.length ? '\n\n' : ''));
  }
  if (buffer.trim()) flush(buffer);
  return last;
}

export async function publishAiStorefront() {
  const { data, error } = await supabase.functions.invoke('ai-studio-publish', { body: {} });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { liveUrl?: string; version?: number };
}

export async function loadStudioState() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: storefront } = await supabase
    .from('ai_storefronts')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  let spec: StorefrontSpec | null = null;
  if (storefront?.draft_spec) {
    try {
      spec = parseStorefrontSpec(storefront.draft_spec).spec;
    } catch {
      spec = null;
    }
  }

  const { data: conversation } = await supabase
    .from('ai_conversations')
    .select('id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let messages: StudioMessage[] = [];
  if (conversation?.id) {
    const { data: rows } = await supabase
      .from('ai_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversation.id)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true });
    messages = (rows || []).map((r) => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content || '',
      createdAt: r.created_at,
    }));
  }

  return {
    spec,
    status: storefront?.status || 'idle',
    quality: (storefront?.quality as StudioQuality) || 'studio',
    conversationId: conversation?.id as string | undefined,
    published: Boolean(storefront?.published_spec),
    version: storefront?.version || 1,
    messages,
  };
}

export const EXAMPLE_PROMPTS = [
  { id: 'floral', en: 'A calm flower shop, blush pink, elegant, Romanian', ro: 'Un magazin de flori liniștit, roz pal, elegant' },
  { id: 'streetwear', en: 'Streetwear store, dark, bold type, big photos', ro: 'Magazin streetwear, întunecat, tipografie bold, poze mari' },
  { id: 'cosmetics', en: 'Natural cosmetics, cream tones, soft and clean', ro: 'Cosmetice naturale, nuanțe crem, clean și delicat' },
  { id: 'jewelry', en: 'Fine jewelry boutique, luxury, lots of whitespace', ro: 'Bijuterie fină, lux, mult spațiu alb' },
  { id: 'kids', en: 'Playful kids toy shop, bright and friendly', ro: 'Magazin de jucării vesel, colorat, prietenos' },
];
