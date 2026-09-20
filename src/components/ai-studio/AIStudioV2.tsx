import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Loader2, Monitor, Smartphone, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import AiStorefrontTemplate from '@/components/templates/ai/AiStorefrontTemplate';
import type { DeviceMode } from '@/components/website-builder/types';
import { publishAiStorefront } from '@/lib/ai-studio/client';
import type { GenerateStatusStep } from '@/lib/ai-studio/spec';
import {
  loadV2StudioDraft,
  streamV2Generate,
  type V2StreamEvent,
} from '@/lib/ai-studio/v2/generateClient';
import { brandDesignSystemSchema, type BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import type { SiteDocument } from '@/lib/ai-studio/v2/siteTree';

interface Props {
  apiKey?: string;
  onBack: () => void;
}

/**
 * Merchant-facing "AI Store Builder" (V2 engine).
 *
 * Internal naming only — nothing here surfaces "V2", schema versions,
 * SiteTree/DesignSpec internals, model names, or token costs to the merchant.
 * Product copy reuses the existing `templates:studio.*` i18n keys used by the
 * V1 experience, plus a small `studioV2.*` block for the handful of strings
 * unique to this flow (see src/i18n/{en,ro}/templates.json).
 *
 * B1 scope: freeform prompt -> persisted V2 draft -> real-data preview.
 * No conversational editing, no critique loop, no version history — those
 * stay in the DEV Generate Lab / are deferred to a later phase.
 */
export default function AIStudioV2({ apiKey, onBack }: Props) {
  const { t } = useTranslation('templates');
  const [prompt, setPrompt] = useState('');
  const [document, setDocument] = useState<SiteDocument | null>(null);
  const [brandSystem, setBrandSystem] = useState<BrandDesignSystem | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState<GenerateStatusStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  // Bumped on every successful (re)generation to force AiStorefrontTemplate to
  // remount. Without this, the merchant's commerce preview (view/cart state,
  // owned by useStorefrontCommerce inside AiStorefrontTemplate) survives
  // across regenerate: if they had clicked into Shop/a product before
  // regenerating, the freshly generated HOME page would silently never show
  // (SiteTreeRenderer only renders when commerce.view === 'home') and they'd
  // keep looking at the old catalog/product view. Remounting resets that
  // internal state back to its 'home' default, matching the expected Beta
  // behavior: a successful generate/regenerate always surfaces the new home
  // page; the merchant can still navigate to Shop manually afterwards.
  const [previewKey, setPreviewKey] = useState(0);

  const STEP_LABELS: Partial<Record<GenerateStatusStep, string>> = {
    understanding: t('studio.steps.understanding'),
    designing: t('studio.steps.designing'),
    planning: t('studioV2.steps.planning'),
    composing: t('studioV2.steps.composing'),
    verifying: t('studio.steps.verifying'),
    ready: t('studio.steps.ready'),
  };

  // Initial load: if the merchant already has a persisted V2 draft, show it
  // immediately without requiring a fresh generation. Reuses the existing
  // shared helper (same fetch + zod validation AiStorefrontTemplate itself
  // uses internally) — no duplicated persistence logic here.
  useEffect(() => {
    let cancelled = false;
    loadV2StudioDraft()
      .then((draft) => {
        if (cancelled) return;
        if (draft.document && draft.brandSystem) {
          setDocument(draft.document);
          setBrandSystem(draft.brandSystem);
          setHasDraft(true);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runGenerate = async () => {
    const text = prompt.trim();
    if (!text || generating) return;
    setGenerating(true);
    setError(null);
    setStep('understanding');
    try {
      const last = await streamV2Generate(
        text,
        (_event, data: V2StreamEvent) => {
          if (data.step) setStep(data.step);
        },
        { conversationId }
      );
      if (last.error) throw new Error(last.error);
      if (!last.document) throw new Error('No document returned');
      if (last.conversationId) setConversationId(last.conversationId);

      // The SSE 'ready' payload is delivered only after the edge function has
      // already persisted draft_document server-side (see
      // supabase/functions/_shared/aiStudioV2.ts: the DB UPDATE happens before
      // the final `send('ready', ...)`). Using this payload directly as the
      // preview override is therefore at least as fresh as any DB re-fetch
      // would be, with no extra round trip and no risk of a stale draft: the
      // override always wins over AiStorefrontTemplate's own internal fetch
      // (see AiStorefrontTemplate's v2Payload resolution order).
      setDocument(last.document);
      if (last.brandSystem) {
        const parsed = brandDesignSystemSchema.safeParse(last.brandSystem);
        if (parsed.success) setBrandSystem(parsed.data);
      }
      setHasDraft(true);
      setPublished(false);
      setStep('ready');
      // Force a fresh AiStorefrontTemplate/useStorefrontCommerce instance so
      // the preview always lands back on the new home page (see previewKey
      // comment above).
      setPreviewKey((k) => k + 1);
    } catch (err) {
      // Merchant-facing failures never surface raw model/JSON/stack detail.
      console.error('[AIStudioV2] generate failed', err);
      setStep('error');
      setError(t('studio.error'));
      // document/brandSystem intentionally left untouched: a failed
      // (re)generation must not blank out the currently visible preview,
      // and never touches published_document / the live storefront.
    } finally {
      setGenerating(false);
    }
  };

  const publish = async () => {
    if (!document) return;
    setPublishing(true);
    try {
      await publishAiStorefront();
      setPublished(true);
      toast.success(t('studio.published'));
    } catch {
      toast.error(t('studio.publishError'));
    } finally {
      setPublishing(false);
    }
  };

  const liveUrl = apiKey ? `${window.location.origin}/templates/ai?api_key=${apiKey}` : '';
  const previewWidth = device === 'mobile' ? 390 : '100%';

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] overflow-hidden rounded-2xl border bg-background">
      <aside className="flex w-full max-w-[380px] flex-col border-r md:max-w-[400px]">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('studio.back')}
          </Button>
          <Sparkles className="h-4 w-4 text-[#6E3DFF]" />
          <span className="text-sm font-semibold">{t('studio.title')}</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground">{t('studio.empty')}</p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('studio.placeholder')}
            className="min-h-[120px] resize-none"
            disabled={generating}
          />
          <Button
            className="w-full"
            onClick={() => void runGenerate()}
            disabled={generating || !prompt.trim()}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('studioV2.generating')}
              </>
            ) : hasDraft ? (
              t('studioV2.regenerate')
            ) : (
              t('studioV2.generate')
            )}
          </Button>

          {generating && step && STEP_LABELS[step] && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {STEP_LABELS[step]}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-muted/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
          <div className="flex items-center gap-1">
            <Button
              variant={device === 'desktop' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setDevice('desktop')}
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              variant={device === 'mobile' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setDevice('mobile')}
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {published && liveUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(liveUrl, '_blank')}>
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                {t('studio.viewLive')}
              </Button>
            )}
            <Button size="sm" onClick={() => void publish()} disabled={!document || publishing}>
              {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('studio.publish')}
            </Button>
          </div>
        </div>
        {device === 'mobile' && (
          // Scope-limiting notice, not a fix: this preview only narrows the
          // container — it does not give Shop/product/cart their own real
          // viewport, so their (correctly viewport-based) responsive CSS
          // never activates here. See AIStudioV2 audit notes for why a real
          // fix needs an isolated preview viewport (e.g. an iframe), which
          // does not exist anywhere in this codebase yet and is out of scope
          // for this pass.
          <div className="border-b bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
            {t('studioV2.mobilePreviewHint')}
          </div>
        )}
        <div className="flex flex-1 justify-center overflow-auto p-4">
          <div
            className="h-full overflow-hidden rounded-xl border bg-background shadow-sm"
            style={{ width: previewWidth, maxWidth: '100%' }}
          >
            {apiKey && document && brandSystem ? (
              <div className="h-full origin-top overflow-auto">
                <AiStorefrontTemplate
                  key={previewKey}
                  apiKey={apiKey}
                  siteDocumentOverride={document}
                  brandSystemOverride={brandSystem}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                {loadingDraft ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  t('studio.previewEmpty')
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
