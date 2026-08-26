import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabaseClient';
import { designSpecSchema, type DesignSpec, type BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import { siteDocumentSchema, type SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import type { GenerateStatusStep } from '@/lib/ai-studio/spec';
import { streamStudioFunction, type StreamEvent } from '@/lib/ai-studio/client';

export type V2GenerationTaskMeta = {
  task: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
};

export type V2GenerationMeta = {
  engine: 'v2';
  schemaVersion: 2;
  startedAt: string;
  completedAt?: string;
  totalLatencyMs?: number;
  tasks: V2GenerationTaskMeta[];
  retries: number;
  validationWarnings: string[];
  contentProvenanceWarnings?: string[];
  architectureNotes?: string;
  silhouettePlan?: string[];
  architectureFingerprint?: import('@shared/ai-studio-v2/creativeStrategy').ArchitectureFingerprint;
};

export type V2StreamEvent = StreamEvent & {
  designSpec?: DesignSpec;
  document?: SiteDocument;
  brandSystem?: BrandDesignSystem;
  generationMeta?: V2GenerationMeta;
  validationRetry?: boolean;
  validationSummary?: {
    userMessage?: string;
    technicalMessage?: string;
    lengthViolations?: Array<{ path: string; label: string; max: number }>;
  };
};

function parseV2Payload(data: V2StreamEvent): V2StreamEvent {
  const out = { ...data };
  if (out.designSpec) {
    const parsed = designSpecSchema.safeParse(out.designSpec);
    if (parsed.success) out.designSpec = parsed.data;
  }
  if (out.document) {
    const parsed = siteDocumentSchema.safeParse(out.document);
    if (parsed.success) out.document = parsed.data;
  }
  return out;
}

export async function streamV2Generate(
  prompt: string,
  onEvent: (event: string, data: V2StreamEvent) => void,
  opts?: { quality?: 'fast' | 'studio'; conversationId?: string }
): Promise<V2StreamEvent> {
  let last: V2StreamEvent = {};
  await streamStudioFunction(
    'ai-studio-generate',
    {
      prompt,
      engine: 'v2',
      quality: opts?.quality ?? 'studio',
      conversationId: opts?.conversationId,
    },
    (event, data) => {
      const parsed = parseV2Payload(data as V2StreamEvent);
      last = { ...last, ...parsed };
      onEvent(event, parsed);
    }
  );
  return last;
}

export const V2_STATUS_LABELS: Partial<Record<GenerateStatusStep, string>> = {
  understanding: 'Understanding your brand…',
  designing: 'Creating the visual direction…',
  planning: 'Planning your storefront…',
  composing: 'Composing the homepage…',
  verifying: 'Finalizing the experience…',
  ready: 'Ready',
};

export async function loadV2StudioDraft(): Promise<{
  designSpec: DesignSpec | null;
  document: SiteDocument | null;
  brandSystem: BrandDesignSystem | null;
  schemaVersion: number | null;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data } = await supabase
    .from('ai_storefronts')
    .select('schema_version, draft_document, design_spec, brand_design_system')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data || data.schema_version !== 2) {
    return { designSpec: null, document: null, brandSystem: null, schemaVersion: data?.schema_version ?? null };
  }

  let designSpec: DesignSpec | null = null;
  let document: SiteDocument | null = null;
  let brandSystem: BrandDesignSystem | null = null;

  if (data.design_spec) {
    const p = designSpecSchema.safeParse(data.design_spec);
    if (p.success) designSpec = p.data;
  }
  if (data.draft_document) {
    const p = siteDocumentSchema.safeParse(data.draft_document);
    if (p.success) document = p.data;
  }
  if (data.brand_design_system) {
    try {
      const { brandDesignSystemSchema } = await import('@/lib/ai-studio/v2/designSpec');
      const p = brandDesignSystemSchema.safeParse(data.brand_design_system);
      if (p.success) brandSystem = p.data;
    } catch {
      /* ignore */
    }
  }

  return { designSpec, document, brandSystem, schemaVersion: 2 };
}

/** Dev-only: direct fetch for scripts */
export async function fetchV2GenerateRaw(prompt: string, accessToken: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-studio-generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, engine: 'v2', quality: 'studio' }),
  });
  return res;
}
