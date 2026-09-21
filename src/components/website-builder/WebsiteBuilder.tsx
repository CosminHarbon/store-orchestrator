import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  History,
  LayoutTemplate,
  MoreHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VisualEditor } from './VisualEditor';
import AIStudio from '@/components/ai-studio/AIStudio';
import AIStudioV2 from '@/components/ai-studio/AIStudioV2';
import CursorAiStoreBuilder from '@/components/ai-store-builder/CursorAiStoreBuilder';
import { SpecialistDesignFlow } from './SpecialistDesignFlow';
import { TemplateCatalog } from './TemplateCatalog';
import '@/styles/website-builder.css';
import { useImpersonation } from '@/hooks/useImpersonation';
import { isAiStudioV2MerchantBetaEnabled } from '@/lib/ai-studio/v2/featureFlag';
import { isAiStoreBuilderCursorEnabled } from '@/lib/ai-store-builder/featureFlag';
import { getTemplateById, type TemplateCatalogId } from '@/lib/website-builder/templateCatalog';
import { trackWebsiteBuilderEvent } from '@/lib/website-builder/analytics';
import { fetchLatestDesignRequest, MERCHANT_STATUS_LABEL } from '@/lib/website-builder/designRequests';
import { trackAiBuilderEvent } from '@/lib/ai-store-builder/analytics';

type BuilderView =
  | 'gallery'
  | 'editor'
  | 'studio'
  | 'cursor-studio'
  | 'specialist'
  | 'templates';

export default function WebsiteBuilder() {
  const { t } = useTranslation('templates');
  const { t: tCommon } = useTranslation('common');
  const { effectiveUserId } = useImpersonation();
  const [view, setView] = useState<BuilderView>('gallery');
  const [editorTemplateId, setEditorTemplateId] = useState('elementar');
  const [copiedKey, setCopiedKey] = useState(false);
  const cursorBuilderEnabled = isAiStoreBuilderCursorEnabled();

  useEffect(() => {
    trackWebsiteBuilderEvent('website_builder_opened');
  }, []);

  const { data: profile } = useQuery({
    queryKey: ['profile', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('store_api_key, store_name, active_template')
        .eq('user_id', effectiveUserId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const designRequestQuery = useQuery({
    queryKey: ['design-request', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: () => fetchLatestDesignRequest(effectiveUserId!),
  });

  const getTemplateUrl = (templateId: string, opts?: { edit?: boolean; demo?: boolean }) => {
    const base = `${window.location.origin}/templates/${templateId}?api_key=${profile?.store_api_key || 'YOUR_API_KEY'}`;
    const params: string[] = [];
    if (opts?.edit) params.push('edit=true');
    if (opts?.demo) params.push('demo=1');
    return params.length ? `${base}&${params.join('&')}` : base;
  };

  if (view === 'editor') {
    return (
      <VisualEditor
        apiKey={profile?.store_api_key}
        templateId={editorTemplateId}
        onBack={() => setView('gallery')}
      />
    );
  }

  if (view === 'cursor-studio') {
    return <CursorAiStoreBuilder onBack={() => setView('gallery')} />;
  }

  if (view === 'studio') {
    if (isAiStudioV2MerchantBetaEnabled()) {
      return <AIStudioV2 apiKey={profile?.store_api_key} onBack={() => setView('gallery')} />;
    }
    return (
      <AIStudio
        apiKey={profile?.store_api_key}
        onBack={() => setView('gallery')}
        onOpenEditor={() => {
          setEditorTemplateId('ai');
          setView('editor');
        }}
      />
    );
  }

  if (view === 'specialist') {
    return <SpecialistDesignFlow onBack={() => setView('gallery')} />;
  }

  if (view === 'templates') {
    return (
      <TemplateCatalog
        onBack={() => setView('gallery')}
        onCustomize={(id) => {
          setEditorTemplateId(id);
          setView('editor');
        }}
      />
    );
  }

  const activeId = (profile?.active_template || 'elementar') as TemplateCatalogId;
  const activeMeta = getTemplateById(activeId);
  const activeName = activeMeta ? t(activeMeta.nameKey) : activeId;
  const designReq = designRequestQuery.data;
  const hasDesignReq = !!designReq && designReq.status !== 'cancelled';

  return (
    <div className="sv-builder-home space-y-8 px-1 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E3DFF]">
            Website Builder
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Your storefront</h1>
          <p className="max-w-xl text-sm text-muted-foreground md:text-base">
            Get a professional design from SpeedVendors, or choose a ready-made template.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10 shrink-0 rounded-full">
              <MoreHorizontal className="mr-2 h-4 w-4" />
              More tools
              <ChevronDown className="ml-1 h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Advanced tools</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {cursorBuilderEnabled ? (
              <DropdownMenuItem
                disabled={!profile?.store_api_key}
                onClick={() => {
                  trackWebsiteBuilderEvent('ai_builder_opened_from_more_tools');
                  trackAiBuilderEvent('ai_builder_opened');
                  setView('cursor-studio');
                }}
              >
                <Wand2 className="mr-2 h-4 w-4 text-[#6E3DFF]" />
                AI Store Builder
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={!profile?.store_api_key}
              onClick={() => setView('studio')}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI Studio
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!profile?.store_api_key}
              onClick={() => {
                setEditorTemplateId('elementar');
                setView('editor');
              }}
            >
              <LayoutTemplate className="mr-2 h-4 w-4" />
              Visual editor
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!profile?.store_api_key || !profile?.active_template}
              onClick={() =>
                window.open(getTemplateUrl(profile?.active_template || 'elementar'), '_blank')
              }
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview current store
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!profile?.store_api_key}
              onClick={() => {
                setEditorTemplateId(activeId === 'ai' ? 'ai' : 'elementar');
                setView('editor');
              }}
            >
              <History className="mr-2 h-4 w-4" />
              Manage storefront content
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!profile?.store_api_key}
              onClick={() => {
                if (!profile?.store_api_key) return;
                navigator.clipboard.writeText(profile.store_api_key);
                setCopiedKey(true);
                toast.success(t('toast.apiKeyCopied'));
                setTimeout(() => setCopiedKey(false), 2000);
              }}
            >
              {copiedKey ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy store API key
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* PRIMARY: Specialist design hero */}
      <section className="relative overflow-hidden rounded-[2rem] border border-[#6E3DFF]/20 bg-gradient-to-br from-[#F4F0FF] via-white to-white p-6 shadow-[0_24px_60px_-36px_rgba(110,61,255,0.45)] md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#6E3DFF]/10 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-8 hidden h-40 w-40 rounded-3xl border border-[#6E3DFF]/15 bg-white/60 md:block" />
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6E3DFF]/20 bg-white px-3 py-1 text-xs font-medium text-[#6E3DFF]">
            Designed by a SpeedVendors specialist
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1A0F2E] md:text-4xl">
            Get a store designed for your business
          </h2>
          <p className="text-base text-muted-foreground md:text-lg">
            Tell us what you sell and the style you want. A SpeedVendors specialist will create a
            storefront designed around your business.
          </p>
          <p className="text-sm text-muted-foreground">
            We use your existing products, photos, and store details — no spreadsheets required.
          </p>
          {hasDesignReq ? (
            <div className="rounded-2xl border bg-white/80 px-4 py-3 text-sm">
              Latest request:{' '}
              <span className="font-medium">
                {MERCHANT_STATUS_LABEL[designReq!.status] || designReq!.status}
              </span>
            </div>
          ) : null}
          <Button
            className="h-12 rounded-full bg-[#6E3DFF] px-7 text-base hover:bg-[#5b30e0]"
            onClick={() => setView('specialist')}
            disabled={!profile?.store_api_key}
          >
            {hasDesignReq ? 'View my design request' : 'Get my store designed'}
          </Button>
        </div>
      </section>

      {/* SECONDARY: starting points */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight">Choose a starting point</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm md:p-6">
            <div className="mb-4 flex h-28 items-end rounded-2xl bg-gradient-to-br from-stone-100 to-white p-4">
              <LayoutTemplate className="h-8 w-8 text-[#6E3DFF]" />
            </div>
            <h4 className="text-lg font-semibold">Browse Templates</h4>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Explore ready-made storefront designs and choose the one that fits your brand.
            </p>
            <Button
              variant="outline"
              className="mt-4 h-11 rounded-full"
              onClick={() => setView('templates')}
            >
              Browse templates
            </Button>
          </article>

          <article className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm md:p-6">
            <div className="mb-4 flex h-28 items-end justify-between rounded-2xl bg-gradient-to-br from-[#F4F0FF] to-white p-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#6E3DFF]">Current</p>
                <p className="font-serif text-xl text-[#1A0F2E]">{activeName}</p>
              </div>
              <Badge variant="secondary">{profile?.active_template ? 'Active' : 'None'}</Badge>
            </div>
            <h4 className="text-lg font-semibold">Current storefront</h4>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Preview or manage the design your customers see today.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-full"
                disabled={!profile?.store_api_key}
                onClick={() => window.open(getTemplateUrl(activeId), '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Preview
              </Button>
              <Button
                className="h-11 flex-1 rounded-full bg-[#1A0F2E] hover:bg-[#1A0F2E]/90"
                disabled={!profile?.store_api_key}
                onClick={() => {
                  if (activeMeta?.opensEditor || activeId === 'elementar' || activeId === 'ai') {
                    setEditorTemplateId(activeId === 'ai' ? 'ai' : 'elementar');
                    setView('editor');
                  } else {
                    setView('templates');
                  }
                }}
              >
                Manage
              </Button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
