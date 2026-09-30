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
  Package,
  Sparkles,
  Truck,
  CreditCard,
  FileText,
  BarChart3,
  Users,
  Star,
  Warehouse,
  Wand2,
  UsersRound,
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
import { CuratedThemeEditor } from './CuratedThemeEditor';
import type { CuratedThemeId } from '@/lib/curated-themes/themeIds';
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
  | 'templates'
  | 'novatee-editor'
  | 'curated-editor';

const PLATFORM_FUNCTIONS: Array<{
  title: string;
  desc: string;
  icon: typeof Package;
}> = [
  { title: 'Website', desc: 'Human-designed storefront for your brand', icon: LayoutTemplate },
  { title: 'Catalog', desc: 'Products, variants, images & collections', icon: Package },
  { title: 'Stock', desc: 'Inventory so you sell what you can ship', icon: Warehouse },
  { title: 'Orders', desc: 'Capture, fulfil and track every order', icon: FileText },
  { title: 'Payments', desc: 'Netopia card + cash on delivery (COD)', icon: CreditCard },
  { title: 'Shipping', desc: 'eAWB home delivery & locker delivery', icon: Truck },
  { title: 'Invoicing', desc: 'Oblio invoices in the same workflow', icon: FileText },
  { title: 'Customers', desc: 'Order history and buying behaviour', icon: Users },
  { title: 'Reviews', desc: 'Collect and manage product reviews', icon: Star },
  { title: 'Analytics', desc: 'Revenue, orders and payment performance', icon: BarChart3 },
];

export default function WebsiteBuilder() {
  const { t } = useTranslation('templates');
  const [curatedThemeId, setCuratedThemeId] = useState<CuratedThemeId>('novatee');
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

  if (view === 'novatee-editor' || view === 'curated-editor') {
    return (
      <CuratedThemeEditor
        themeId={curatedThemeId}
        onBack={() => setView('templates')}
      />
    );
  }

  if (view === 'templates') {
    return (
      <TemplateCatalog
        onBack={() => setView('gallery')}
        onCustomize={(id) => {
          setEditorTemplateId(id);
          setView('editor');
        }}
        onCustomizeCurated={(themeId) => {
          setCuratedThemeId(themeId);
          setView('curated-editor');
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
            Website
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Your storefront</h1>
          <p className="max-w-xl text-sm text-muted-foreground md:text-base">
            Request a human-designed storefront. Your products, payments, shipping and orders already
            run on SpeedVendors — we design the shop around them.
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

      {/* PRIMARY: Request a human design */}
      <section className="relative overflow-hidden rounded-[2rem] border border-[#6E3DFF]/25 bg-gradient-to-br from-[#F4F0FF] via-white to-white p-6 shadow-[0_24px_60px_-36px_rgba(110,61,255,0.5)] md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#6E3DFF]/12 blur-2xl" />
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6E3DFF]/25 bg-white px-3 py-1 text-xs font-semibold text-[#6E3DFF]">
            <UsersRound className="h-3.5 w-3.5" />
            Human design team · not AI generation
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1A0F2E] md:text-4xl">
            Request a design for your store
          </h2>
          <p className="text-base text-muted-foreground md:text-lg">
            Tell us what you sell and the look you want. Our human design team builds the storefront
            for you — wired into your live products, Netopia, eAWB and Oblio.
          </p>
          <ul className="space-y-1.5 text-sm text-[#1A0F2E]/80">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6E3DFF]" />
              Uses your existing catalog, photos and store details
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6E3DFF]" />
              Checkout, delivery and payments stay on SpeedVendors
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6E3DFF]" />
              You review when it&apos;s ready — no DIY theme tweaking required
            </li>
          </ul>
          {hasDesignReq ? (
            <div className="rounded-2xl border bg-white/90 px-4 py-3 text-sm">
              Latest request:{' '}
              <span className="font-medium">
                {MERCHANT_STATUS_LABEL[designReq!.status] || designReq!.status}
              </span>
            </div>
          ) : null}
          <Button
            className="h-12 rounded-full bg-[#6E3DFF] px-8 text-base hover:bg-[#5b30e0]"
            onClick={() => setView('specialist')}
            disabled={!profile?.store_api_key}
          >
            {hasDesignReq ? 'View my design request' : 'Request my design'}
          </Button>
        </div>
      </section>

      {/* Explicit platform / integrations map */}
      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6E3DFF]">
            Included with SpeedVendors
          </p>
          <h3 className="text-lg font-semibold tracking-tight">
            Every function of your store, one platform
          </h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The design sits on top of the full ops stack — payments, shipping, invoices and catalog are
            already integrated. You don&apos;t stitch tools together.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PLATFORM_FUNCTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border bg-card p-4 shadow-sm transition hover:border-[#6E3DFF]/30"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#F4F0FF] text-[#6E3DFF]">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECONDARY: template inspiration + current store */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">Optional: pick a starting look</h3>
          <p className="text-sm text-muted-foreground">
            Prefer to browse inspiration first? Choose a template direction — when you publish, our
            human team still builds the final store for you.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm md:p-6">
            <div className="mb-4 flex h-24 items-end rounded-2xl bg-gradient-to-br from-stone-100 to-white p-4">
              <LayoutTemplate className="h-7 w-7 text-[#6E3DFF]" />
            </div>
            <h4 className="text-lg font-semibold">Browse design directions</h4>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Explore Foundation, Novatee and other looks. Use them as a draft — publishing sends the
              brief to our human design team.
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
            <div className="mb-4 flex h-24 items-end justify-between rounded-2xl bg-gradient-to-br from-[#F4F0FF] to-white p-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#6E3DFF]">Current</p>
                <p className="font-serif text-xl text-[#1A0F2E]">{activeName}</p>
              </div>
              <Badge variant="secondary">{profile?.active_template ? 'Active' : 'None'}</Badge>
            </div>
            <h4 className="text-lg font-semibold">Current storefront</h4>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Preview or manage what customers see today while your new design is in progress.
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
