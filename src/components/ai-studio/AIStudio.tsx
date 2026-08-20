import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Monitor,
  Send,
  Smartphone,
  Sparkles,
  Tablet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import AiStorefrontTemplate from '@/components/templates/ai/AiStorefrontTemplate';
import type { DeviceMode } from '@/components/website-builder/types';
import {
  EXAMPLE_PROMPTS,
  loadStudioState,
  publishAiStorefront,
  streamStudioFunction,
  type StudioMessage,
} from '@/lib/ai-studio/client';
import type { GenerateStatusStep, StorefrontSpec, StudioQuality } from '@/lib/ai-studio/spec';
import { variantSummary } from '@/lib/ai-studio/layouts';
import { cn } from '@/lib/utils';

interface Props {
  apiKey?: string;
  onBack: () => void;
  onOpenEditor?: () => void;
}

const STEPS: GenerateStatusStep[] = ['understanding', 'designing', 'verifying', 'building', 'ready'];

function previewFingerprint(spec: StorefrontSpec, liveCatalog: boolean) {
  return [
    spec.layoutId,
    spec.density,
    spec.nav?.style,
    spec.nav?.layout,
    spec.productCard?.style,
    spec.productCard?.imageRatio,
    spec.hero?.layout,
    spec.hero?.overlay,
    spec.tokens.primary,
    spec.tokens.background,
    spec.tokens.text,
    spec.copy.heroTitle,
    spec.copy.heroSubtitle,
    spec.copy.about || '',
    spec.copy.announcement || '',
    JSON.stringify(spec.copy.faq || []),
    spec.pages.home.sections.map((s) => `${s.id}:${s.type}:${s.visible !== false}`).join('|'),
    liveCatalog ? 'live' : 'sample',
  ].join('::');
}

export default function AIStudio({ apiKey, onBack, onOpenEditor }: Props) {
  const { t, i18n } = useTranslation('templates');
  const lang = i18n.language === 'ro' ? 'ro' : 'en';
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [spec, setSpec] = useState<StorefrontSpec | null>(null);
  const [step, setStep] = useState<GenerateStatusStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [quality, setQuality] = useState<StudioQuality>('studio');
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [published, setPublished] = useState(false);
  const [liveCatalog, setLiveCatalog] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStudioState()
      .then((state) => {
        setSpec(state.spec);
        setMessages(state.messages);
        setConversationId(state.conversationId);
        setQuality(state.quality === 'fast' ? 'fast' : 'studio');
        setPublished(state.published);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, step]);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput('');
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString() },
    ]);
    setStep('understanding');
    try {
      const fn = spec ? 'ai-studio-refine' : 'ai-studio-generate';
      const last = await streamStudioFunction(
        fn,
        { prompt, quality, conversationId },
        (_event, data) => {
          if (data.step) setStep(data.step);
          if (data.spec) {
            console.log('[AIStudio] preview setSpec from SSE', {
              event: _event,
              layoutId: data.spec.layoutId,
              faq: data.spec.copy?.faq,
              primary: data.spec.tokens?.primary,
              heroTitle: data.spec.copy?.heroTitle,
            });
            setSpec(structuredClone(data.spec));
          }
          if (data.conversationId) setConversationId(data.conversationId);
          if (data.message) {
            setMessages((prev) => {
              const next = [...prev];
              const lastMsg = next[next.length - 1];
              if (lastMsg?.role === 'assistant' && lastMsg.id.startsWith('live-')) {
                next[next.length - 1] = { ...lastMsg, content: data.message || lastMsg.content };
                return next;
              }
              return [
                ...next,
                { id: `live-${crypto.randomUUID()}`, role: 'assistant', content: data.message || '', createdAt: new Date().toISOString() },
              ];
            });
          }
        }
      );
      if (last.spec) {
        console.log('[AIStudio] final ready spec', {
          layoutId: last.spec.layoutId,
          faq: last.spec.copy?.faq,
          primary: last.spec.tokens?.primary,
        });
        setSpec(structuredClone(last.spec));
      }
      if (last.error) throw new Error(last.error);
      if (last.spec) {
        const summary = variantSummary(last.spec, lang);
        setMessages((prev) => {
          const already = prev.some(
            (m) => m.role === 'assistant' && (m.content.includes(summary) || /Nav |nav ·|Carduri |cards ·/.test(m.content))
          );
          if (already) return prev;
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: summary,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      }
      if (last.llm) {
        setMessages((prev) => {
          const note = t('studio.modelUsed', { model: last.llm });
          if (prev.some((m) => m.content === note)) return prev;
          return [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant', content: note, createdAt: new Date().toISOString() },
          ];
        });
      }
      if (last.llmError) {
        const err = last.llmError;
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (
            lastMsg?.role === 'assistant' &&
            (lastMsg.content.includes(err.slice(0, 40)) ||
              /AI did not respond|AI nu a răspuns|Could not apply|Nu am putut/i.test(lastMsg.content))
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `${err}\n${t('studio.llmFallback')}`,
              createdAt: new Date().toISOString(),
            },
          ];
        });
        if (/insufficient balance/i.test(err)) {
          toast.error(t('studio.llmNoCredit'));
        } else if (err.includes('not set')) {
          toast.message(t('studio.llmNotConnected'));
        } else {
          toast.error(err.slice(0, 200));
        }
      }
      setStep('ready');
    } catch (err) {
      setStep('error');
      toast.error(err instanceof Error ? err.message : t('studio.error'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!spec) return;
    setBusy(true);
    try {
      const result = await publishAiStorefront();
      setPublished(true);
      toast.success(t('studio.published'));
      if (result.liveUrl) {
        await navigator.clipboard.writeText(result.liveUrl).catch(() => undefined);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('studio.publishError'));
    } finally {
      setBusy(false);
    }
  };

  const liveUrl = apiKey ? `${window.location.origin}/templates/ai?api_key=${apiKey}` : '';
  const previewWidth = device === 'mobile' ? 390 : device === 'tablet' ? 768 : '100%';

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
          {(spec || messages.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={() => {
                setSpec(null);
                setMessages([]);
                setConversationId(undefined);
                setPublished(false);
                setStep(null);
              }}
            >
              {t('studio.startOver')}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs">
          <div>
            <div className="font-medium">{t('studio.qualityLabel')}</div>
            <p className="text-muted-foreground">{quality === 'studio' ? t('studio.qualityStudioHint') : t('studio.qualityFastHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('studio.fast')}</span>
            <Switch
              checked={quality === 'studio'}
              onCheckedChange={(v) => setQuality(v ? 'studio' : 'fast')}
              disabled={busy}
            />
            <span>{t('studio.studioQuality')}</span>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('studio.empty')}</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    className="rounded-full border px-3 py-1.5 text-left text-xs hover:border-[#6E3DFF]/50"
                    onClick={() => send(lang === 'ro' ? ex.ro : ex.en)}
                  >
                    {lang === 'ro' ? ex.ro : ex.en}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'max-w-[90%] rounded-2xl px-3 py-2 text-sm',
                m.role === 'user' ? 'ml-auto bg-[#6E3DFF] text-white' : 'bg-muted'
              )}
            >
              {m.content}
            </div>
          ))}
          {busy && step && step !== 'ready' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t(`studio.steps.${step}`)}
            </div>
          )}
        </div>

        <form
          className="border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('studio.placeholder')}
              className="min-h-[52px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} className="h-[52px] w-[52px] shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-muted/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
          <div className="flex items-center gap-1">
            <Button variant={device === 'desktop' ? 'secondary' : 'ghost'} size="icon" onClick={() => setDevice('desktop')}>
              <Monitor className="h-4 w-4" />
            </Button>
            <Button variant={device === 'tablet' ? 'secondary' : 'ghost'} size="icon" onClick={() => setDevice('tablet')}>
              <Tablet className="h-4 w-4" />
            </Button>
            <Button variant={device === 'mobile' ? 'secondary' : 'ghost'} size="icon" onClick={() => setDevice('mobile')}>
              <Smartphone className="h-4 w-4" />
            </Button>
            {spec && (
              <span className="ml-2 hidden max-w-[280px] truncate text-xs text-muted-foreground sm:inline">
                {variantSummary(spec, lang)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {apiKey && (
              <div className="mr-1 flex items-center gap-2 text-[11px]">
                <span className={cn(!liveCatalog && 'text-muted-foreground')}>{t('studio.catalogSample')}</span>
                <Switch checked={liveCatalog} onCheckedChange={setLiveCatalog} />
                <span className={cn(liveCatalog && 'font-medium')}>{t('studio.catalogLive')}</span>
              </div>
            )}
            {published && liveUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(liveUrl, '_blank')}>
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                {t('studio.viewLive')}
              </Button>
            )}
            {onOpenEditor && spec && (
              <Button variant="outline" size="sm" onClick={onOpenEditor}>
                {t('studio.openEditor')}
              </Button>
            )}
            <Button size="sm" onClick={() => void publish()} disabled={!spec || busy}>
              {t('studio.publish')}
            </Button>
          </div>
        </div>
        <div className="flex flex-1 justify-center overflow-auto p-4">
          <div
            className="h-full overflow-hidden rounded-xl border bg-background shadow-sm"
            style={{ width: previewWidth, maxWidth: '100%' }}
          >
            {apiKey && spec ? (
              <div className="h-full origin-top overflow-auto">
                <AiStorefrontTemplate
                  key={`ai-preview-${previewFingerprint(spec, liveCatalog)}`}
                  apiKey={apiKey}
                  demo={!liveCatalog}
                  specOverride={spec}
                  draft
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                {t('studio.previewEmpty')}
              </div>
            )}
          </div>
        </div>
        {busy && (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            {STEPS.map((s) => (
              <span key={s} className={cn('mr-3', step === s && 'font-semibold text-foreground')}>
                {t(`studio.steps.${s}`)}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
