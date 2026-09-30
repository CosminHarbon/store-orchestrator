import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useImpersonation } from '@/hooks/useImpersonation';
import { supabase } from '@/integrations/supabase/client';
import {
  availableTemplateCategories,
  filterTemplates,
  getTemplateById,
  type TemplateCatalogEntry,
  type TemplateCatalogId,
  type TemplateCategory,
} from '@/lib/website-builder/templateCatalog';
import { trackWebsiteBuilderEvent } from '@/lib/website-builder/analytics';
import { applyStoreTemplate } from '@/lib/website-builder/applyTemplate';
import { NOVATEE_MANIFEST } from '@/lib/curated-themes/novatee';
import { FOUNDATION_MANIFEST } from '@/lib/curated-themes/foundation';
import type { CuratedThemeId } from '@/lib/curated-themes/themeIds';
import { createDraftConfig } from '@/lib/curated-themes/storefrontContentConfig';
import { ensureCuratedThemeDraft } from '@/lib/curated-themes/draftPersistence';
import { STORE_API_BASE, CHECKOUT_APP_ORIGIN } from '@/lib/storefront/api';
import { CuratedThemePreviewFrame } from './CuratedThemePreviewFrame';

type Props = {
  onBack: () => void;
  onCustomize?: (templateId: TemplateCatalogId) => void;
  /** Open curated Novatee editor (draft only — does not publish). */
  onCustomizeCurated?: (themeId: CuratedThemeId) => void;
};

const CATEGORY_LABELS: Partial<Record<TemplateCategory, string>> = {
  all: 'All',
  minimal: 'Minimal',
  bold: 'Bold',
  fashion: 'Fashion',
  beauty: 'Beauty',
  home: 'Home',
  services: 'Services',
  editable: 'Editable',
  predesigned: 'Pre-designed',
  ai: 'AI Studio',
};

export function TemplateCatalog({ onBack, onCustomize, onCustomizeCurated }: Props) {
  const { t } = useTranslation('templates');
  const { effectiveUserId } = useImpersonation();
  const qc = useQueryClient();
  const [category, setCategory] = useState<TemplateCategory>('all');
  const [previewId, setPreviewId] = useState<TemplateCatalogId | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [confirmId, setConfirmId] = useState<TemplateCatalogId | null>(null);
  const [novateePreviewOpen, setNovateePreviewOpen] = useState(false);
  const [novateeConfirmOpen, setNovateeConfirmOpen] = useState(false);
  const [novateePreviewDevice, setNovateePreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [foundationPreviewOpen, setFoundationPreviewOpen] = useState(false);
  const [foundationConfirmOpen, setFoundationConfirmOpen] = useState(false);
  const [foundationPreviewDevice, setFoundationPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    trackWebsiteBuilderEvent('template_catalog_opened');
  }, []);

  const profileQuery = useQuery({
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

  const draftQuery = useQuery({
    queryKey: ['curated-theme-draft', effectiveUserId, 'novatee'],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { loadCuratedThemeDraft } = await import('@/lib/curated-themes/draftPersistence');
      const existing = await loadCuratedThemeDraft(effectiveUserId!, 'novatee');
      return existing || createDraftConfig('novatee');
    },
  });

  const foundationDraftQuery = useQuery({
    queryKey: ['curated-theme-draft', effectiveUserId, 'foundation'],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { loadCuratedThemeDraft } = await import('@/lib/curated-themes/draftPersistence');
      const existing = await loadCuratedThemeDraft(effectiveUserId!, 'foundation');
      return existing || createDraftConfig('foundation');
    },
  });

  const categories = useMemo(() => availableTemplateCategories(), []);
  const templates = useMemo(() => filterTemplates(category), [category]);
  const activeTemplate = profileQuery.data?.active_template || null;
  const apiKey = profileQuery.data?.store_api_key || '';

  const showNovatee =
    category === 'all' ||
    category === 'bold' ||
    category === 'fashion' ||
    category === 'editable';

  const showFoundation =
    category === 'all' ||
    category === 'minimal' ||
    category === 'editable' ||
    category === 'fashion' ||
    category === 'beauty' ||
    category === 'home';

  const curatedRuntime = useMemo(() => {
    if (!apiKey) return null;
    return {
      storeApiKey: apiKey,
      apiBase: STORE_API_BASE,
      hostedCheckoutOrigin: CHECKOUT_APP_ORIGIN || window.location.origin,
      returnOrigin: window.location.origin,
    };
  }, [apiKey]);

  const novateePreviewConfig = draftQuery.data || createDraftConfig('novatee');
  const foundationPreviewConfig = foundationDraftQuery.data || createDraftConfig('foundation');

  const applyMutation = useMutation({
    mutationFn: async (templateId: TemplateCatalogId) => {
      if (!effectiveUserId) throw new Error('Not signed in');
      await applyStoreTemplate({
        userId: effectiveUserId,
        templateId,
        storeName: profileQuery.data?.store_name || 'My Store',
      });
    },
    onSuccess: (_d, templateId) => {
      trackWebsiteBuilderEvent('template_selected', { template_id: templateId });
      toast.success('Template applied to your storefront');
      setConfirmId(null);
      void qc.invalidateQueries({ queryKey: ['profile', effectiveUserId] });
      const entry = getTemplateById(templateId);
      if (entry?.opensEditor && onCustomize) onCustomize(templateId);
    },
    onError: (e: Error) => toast.error(e.message || 'Could not apply template'),
  });

  const useNovateeMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveUserId) throw new Error('Not signed in');
      return ensureCuratedThemeDraft({
        userId: effectiveUserId,
        themeId: 'novatee',
        storeName: profileQuery.data?.store_name || 'My Store',
      });
    },
    onSuccess: () => {
      trackWebsiteBuilderEvent('template_selected', { template_id: 'novatee' });
      toast.success('Novatee draft ready — customize without changing your live store');
      setNovateeConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ['curated-theme-draft', effectiveUserId, 'novatee'] });
      onCustomizeCurated?.('novatee');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create Novatee draft'),
  });

  const useFoundationMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveUserId) throw new Error('Not signed in');
      return ensureCuratedThemeDraft({
        userId: effectiveUserId,
        themeId: 'foundation',
        storeName: profileQuery.data?.store_name || 'My Store',
      });
    },
    onSuccess: () => {
      trackWebsiteBuilderEvent('template_selected', { template_id: 'foundation' });
      toast.success('Foundation draft ready — customize without changing your live store');
      setFoundationConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ['curated-theme-draft', effectiveUserId, 'foundation'] });
      onCustomizeCurated?.('foundation');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create Foundation draft'),
  });

  const previewEntry = previewId ? getTemplateById(previewId) : null;
  const previewUrl =
    previewId && apiKey
      ? `${window.location.origin}/templates/${previewId}?api_key=${apiKey}&demo=1`
      : null;

  return (
    <div className="sv-builder-home mx-auto max-w-5xl space-y-6 px-1 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Website Builder
      </button>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E3DFF]">
          Templates
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Design directions</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
          Pick a look as inspiration. When you publish, our human team creates the final storefront
          for you.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition ${
              category === c
                ? 'border-[#6E3DFF] bg-[#F4F0FF] text-[#6E3DFF]'
                : 'border-border bg-white hover:border-[#6E3DFF]/35'
            }`}
          >
            {CATEGORY_LABELS[c] || c}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {showNovatee ? (
          <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="relative h-48 bg-[#0b0b10] md:h-56">
              <img
                src={NOVATEE_MANIFEST.previewImage}
                alt="Novatee theme preview"
                className="h-full w-full object-cover object-top"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0b10] via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c6ff3d]">Curated theme</p>
                <p className="font-serif text-xl text-white md:text-2xl">{NOVATEE_MANIFEST.name}</p>
              </div>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                {NOVATEE_MANIFEST.categoryTags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="outline" className="capitalize">
                    {tag}
                  </Badge>
                ))}
                <Badge variant="secondary">Editable draft</Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {NOVATEE_MANIFEST.shortDescription}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => {
                    trackWebsiteBuilderEvent('template_previewed', { template_id: 'novatee' });
                    setNovateePreviewOpen(true);
                    setNovateePreviewDevice('desktop');
                  }}
                >
                  Preview
                </Button>
                <Button
                  className="flex-1 rounded-full bg-[#6E3DFF] hover:bg-[#5b30e0]"
                  onClick={() => setNovateeConfirmOpen(true)}
                >
                  Use this template
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Opens a draft editor with your live products. Publishing sends this direction to our
                human design team — they create the final store for you.
              </p>
            </div>
          </article>
        ) : null}

        {showFoundation ? (
          <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="relative h-48 bg-[#fbfaf8] md:h-56">
              <img
                src={FOUNDATION_MANIFEST.previewImage}
                alt="Foundation theme preview"
                className="h-full w-full object-cover object-top"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#f3f0ec] via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#4a1d55]">Curated theme</p>
                <p className="font-serif text-xl text-[#1d1622] md:text-2xl">{FOUNDATION_MANIFEST.name}</p>
              </div>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                {FOUNDATION_MANIFEST.categoryTags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="outline" className="capitalize">
                    {tag}
                  </Badge>
                ))}
                <Badge variant="secondary">Editable draft</Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {FOUNDATION_MANIFEST.shortDescription}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => {
                    trackWebsiteBuilderEvent('template_previewed', { template_id: 'foundation' });
                    setFoundationPreviewOpen(true);
                    setFoundationPreviewDevice('desktop');
                  }}
                >
                  Preview
                </Button>
                <Button
                  className="flex-1 rounded-full bg-[#4a1d55] hover:bg-[#33123c]"
                  onClick={() => setFoundationConfirmOpen(true)}
                >
                  Use this template
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Opens a draft editor with your live products. Publishing sends this direction to our
                human design team — they create the final store for you.
              </p>
            </div>
          </article>
        ) : null}

        {templates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            entry={tpl}
            t={t}
            isActive={activeTemplate === tpl.id}
            onPreview={() => {
              trackWebsiteBuilderEvent('template_previewed', { template_id: tpl.id });
              setPreviewId(tpl.id);
              setPreviewDevice('desktop');
            }}
            onUse={() => setConfirmId(tpl.id)}
          />
        ))}
      </div>

      {/* Classic template preview */}
      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <DialogTitle className="text-base">
                {previewEntry ? t(previewEntry.nameKey) : 'Preview'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Demo preview — does not change your live storefront.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={previewDevice === 'desktop' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setPreviewDevice('desktop')}
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={previewDevice === 'mobile' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setPreviewDevice('mobile')}
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex max-h-[70vh] justify-center bg-muted/40 p-4">
            {previewUrl ? (
              <div
                className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                  previewDevice === 'mobile' ? 'h-[560px] w-[360px]' : 'h-[560px] w-full max-w-3xl'
                }`}
              >
                <iframe title="Template preview" src={previewUrl} className="h-full w-full" />
              </div>
            ) : (
              <p className="py-20 text-sm text-muted-foreground">Store API key required for preview.</p>
            )}
          </div>
          <DialogFooter className="border-t px-4 py-3 sm:justify-between">
            <Button
              variant="outline"
              disabled={!previewUrl}
              onClick={() => previewUrl && window.open(previewUrl, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in new tab
            </Button>
            <Button
              className="bg-[#6E3DFF] hover:bg-[#5b30e0]"
              onClick={() => {
                if (previewId) setConfirmId(previewId);
                setPreviewId(null);
              }}
            >
              Use template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novatee live preview */}
      <Dialog open={novateePreviewOpen} onOpenChange={setNovateePreviewOpen}>
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <DialogTitle className="text-base">Novatee</DialogTitle>
              <DialogDescription className="text-xs">
                Live preview with your catalog — does not change your published storefront.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={novateePreviewDevice === 'desktop' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setNovateePreviewDevice('desktop')}
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={novateePreviewDevice === 'mobile' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setNovateePreviewDevice('mobile')}
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="bg-muted/40 p-4">
            <CuratedThemePreviewFrame
              themeId="novatee"
              config={novateePreviewConfig}
              runtime={curatedRuntime}
              device={novateePreviewDevice}
              hideChrome
            />
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <Button
              className="bg-[#6E3DFF] hover:bg-[#5b30e0]"
              onClick={() => {
                setNovateePreviewOpen(false);
                setNovateeConfirmOpen(true);
              }}
            >
              Use this template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Classic confirm apply */}
      <Dialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use this template?</DialogTitle>
            <DialogDescription>
              {activeTemplate && confirmId && activeTemplate !== confirmId ? (
                <>
                  Your store currently uses <strong>{activeTemplate}</strong>. Applying{' '}
                  <strong>{confirmId}</strong> will make it your active storefront template. This does
                  not delete products or orders.
                </>
              ) : (
                <>This will set the selected design as your active storefront template.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[#6E3DFF] hover:bg-[#5b30e0]"
              disabled={applyMutation.isPending || !confirmId}
              onClick={() => confirmId && applyMutation.mutate(confirmId)}
            >
              {applyMutation.isPending ? 'Applying…' : 'Use template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novatee draft confirm — does NOT overwrite published template */}
      <Dialog open={novateeConfirmOpen} onOpenChange={setNovateeConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Novatee as inspiration?</DialogTitle>
            <DialogDescription>
              Opens a Novatee draft you can customize. Publishing sends it to our human design team —
              they create the final store for you. Your live storefront (
              {activeTemplate || 'none'}) stays unchanged until then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovateeConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#6E3DFF] hover:bg-[#5b30e0]"
              disabled={useNovateeMutation.isPending}
              onClick={() => useNovateeMutation.mutate()}
            >
              {useNovateeMutation.isPending ? 'Opening…' : 'Use this template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={foundationPreviewOpen} onOpenChange={setFoundationPreviewOpen}>
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <div className="border-b px-4 py-3">
            <DialogTitle className="text-base">Foundation preview</DialogTitle>
            <DialogDescription className="text-xs">
              Live products via your store API — draft only, does not publish.
            </DialogDescription>
          </div>
          <div className="p-4">
            <CuratedThemePreviewFrame
              themeId="foundation"
              config={foundationPreviewConfig}
              runtime={curatedRuntime}
              device={foundationPreviewDevice}
              onDeviceChange={setFoundationPreviewDevice}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={foundationConfirmOpen} onOpenChange={setFoundationConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Foundation as inspiration?</DialogTitle>
            <DialogDescription>
              Opens a Foundation draft you can customize. Publishing sends it to our human design
              team — they create the final store for you. Your live storefront stays unchanged until
              then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFoundationConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#4a1d55] hover:bg-[#33123c]"
              disabled={useFoundationMutation.isPending}
              onClick={() => useFoundationMutation.mutate()}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateCard({
  entry,
  t,
  isActive,
  onPreview,
  onUse,
}: {
  entry: TemplateCatalogEntry;
  t: (k: string) => string;
  isActive: boolean;
  onPreview: () => void;
  onUse: () => void;
}) {
  const p = entry.preview;
  return (
    <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div
        className="relative h-48 md:h-56"
        style={{
          background: `linear-gradient(135deg, ${p.from}, ${p.via}, ${p.to})`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#ffffff33,transparent_55%)]" />
        <div className="absolute inset-x-6 top-6 bottom-6 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-[2px]">
          <div className="mb-2 h-2 w-1/3 rounded-full" style={{ background: p.accent || '#fff' }} />
          <div className="mb-3 h-3 w-2/3 rounded" style={{ background: p.titleColor, opacity: 0.85 }} />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-square rounded-lg bg-white/25" />
            ))}
          </div>
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: p.eyebrowColor }}>
            {t(entry.badgeKey)}
          </p>
          <p className="font-serif text-xl md:text-2xl" style={{ color: p.titleColor }}>
            {t(entry.nameKey)}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{entry.styleLabel}</Badge>
          {isActive ? <Badge className="bg-[#6E3DFF]">Current</Badge> : null}
          {entry.editable ? <Badge variant="secondary">Editable</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">{t(entry.descriptionKey)}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1 rounded-full" onClick={onPreview}>
            Preview
          </Button>
          <Button className="flex-1 rounded-full bg-[#6E3DFF] hover:bg-[#5b30e0]" onClick={onUse}>
            Use template
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Preview uses the real template in demo mode. Catalog thumbnails mirror each template&apos;s
          palette (screenshot assets not yet available).
        </p>
      </div>
    </article>
  );
}
