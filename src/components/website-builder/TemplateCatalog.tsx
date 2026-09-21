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

type Props = {
  onBack: () => void;
  onCustomize?: (templateId: TemplateCatalogId) => void;
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

export function TemplateCatalog({ onBack, onCustomize }: Props) {
  const { t } = useTranslation('templates');
  const { effectiveUserId } = useImpersonation();
  const qc = useQueryClient();
  const [category, setCategory] = useState<TemplateCategory>('all');
  const [previewId, setPreviewId] = useState<TemplateCatalogId | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [confirmId, setConfirmId] = useState<TemplateCatalogId | null>(null);

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

  const categories = useMemo(() => availableTemplateCategories(), []);
  const templates = useMemo(() => filterTemplates(category), [category]);
  const activeTemplate = profileQuery.data?.active_template || null;
  const apiKey = profileQuery.data?.store_api_key || '';

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
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Store templates</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
          Choose a professionally designed starting point for your storefront.
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

      {/* Large preview dialog */}
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

      {/* Confirm apply */}
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
        {/* Mini layout chrome reflecting storefront structure — not stock photos */}
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
