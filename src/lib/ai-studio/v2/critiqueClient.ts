import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabaseClient';
import type { DesignSpec, BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import type { SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import type { CritiqueScoreCard, CritiqueRecommendation } from '@/lib/ai-studio/v2/critiqueScoreCard';
import type { SiteOps } from '@/lib/ai-studio/v2/siteOps';
import { dataUrlToBase64, type CapturedScreenshot } from '@/lib/ai-studio/v2/screenshot';
import type { StreamEvent } from '@/lib/ai-studio/client';

export type CritiqueStreamEvent = StreamEvent & {
  cycle?: number;
  scorecard?: CritiqueScoreCard;
  recommendations?: CritiqueRecommendation[];
  ops?: SiteOps;
  rejected?: Array<{ reason: string; op?: unknown }>;
  stop?: boolean;
  stopReason?: string;
  cycleMetas?: Array<Record<string, unknown>>;
  calibrationNotes?: string[];
  screenshotMetas?: Array<Record<string, unknown>>;
  costUsd?: number;
  latencyMs?: number;
  conversationId?: string;
  expectedRenderManifest?: unknown;
};

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

/**
 * Stream one visual critique cycle.
 * Screenshots are ephemeral — sent once, never persisted by the client after the call.
 */
export async function streamV2Critique(
  payload: {
    designSpec: DesignSpec;
    document: SiteDocument;
    brandSystem: BrandDesignSystem;
    screenshots: CapturedScreenshot[];
    cycle: number;
    previousScorecard?: CritiqueScoreCard | null;
    conversationId?: string;
  },
  onEvent: (event: string, data: CritiqueStreamEvent) => void
): Promise<CritiqueStreamEvent> {
  const screenshots = payload.screenshots.map((s) => {
    const { base64, mimeType } = dataUrlToBase64(s.dataUrl);
    return {
      viewport: s.viewport,
      mimeType: mimeType || s.mimeType || 'image/jpeg',
      base64,
      widthPx: s.meta?.widthPx,
      heightPx: s.meta?.heightPx,
      blankSuspect: s.meta?.blankSuspect,
      meta: s.meta
        ? {
            widthPx: s.meta.widthPx,
            heightPx: s.meta.heightPx,
            approxBytes: s.meta.approxBytes,
            base64Chars: s.meta.base64Chars,
            blankSuspect: s.meta.blankSuspect,
            mimeType: s.meta.mimeType,
          }
        : undefined,
    };
  });

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[ai-studio-v2][critiqueClient] submitting screenshots', {
      count: screenshots.length,
      shots: screenshots.map((s) => ({
        viewport: s.viewport,
        mimeType: s.mimeType,
        base64Chars: s.base64.length,
        approxBytes: Math.floor((s.base64.length * 3) / 4),
        widthPx: s.widthPx,
        heightPx: s.heightPx,
        blankSuspect: s.blankSuspect,
      })),
    });
  }

  let last: CritiqueStreamEvent = {};

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-studio-v2-critique`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      designSpec: payload.designSpec,
      document: payload.document,
      brandSystem: payload.brandSystem,
      screenshots,
      cycle: payload.cycle,
      previousScorecard: payload.previousScorecard ?? null,
      conversationId: payload.conversationId,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    let error = text;
    try {
      error = JSON.parse(text).error || text;
    } catch {
      /* ignore */
    }
    throw new Error(error || `Critique failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
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
        const data = JSON.parse(dataLine) as CritiqueStreamEvent;
        last = { ...last, ...data };
        onEvent(event, data);
      } catch {
        /* skip */
      }
    }
  }

  return last;
}

/** Persist refined SiteTree only — never screenshots */
export async function persistV2DraftDocument(document: SiteDocument): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('ai_storefronts')
    .update({
      draft_document: document,
      schema_version: 2,
      status: 'ready',
    })
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
}
