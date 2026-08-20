import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Monitor,
  Palette,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CanvasPreview } from './CanvasPreview';
import { useWebsiteBuilderState } from './useWebsiteBuilderState';
import type { AddableSectionType, BuilderPanel, DeviceMode } from './types';
import '@/styles/website-builder.css';

const FONT_OPTIONS = [
  'Inter',
  'Poppins',
  'Playfair Display',
  'Montserrat',
  'Space Grotesk',
  'DM Sans',
  'Outfit',
];

const ADDABLE_SECTIONS: Array<{
  id: AddableSectionType;
  category: 'content' | 'marketing' | 'products';
  blockType: string;
}> = [
  { id: 'text', category: 'content', blockType: 'text' },
  { id: 'image', category: 'content', blockType: 'image' },
  { id: 'text-image', category: 'content', blockType: 'text-image' },
  { id: 'video', category: 'content', blockType: 'video' },
  { id: 'banner', category: 'marketing', blockType: 'banner' },
  { id: 'newsletter', category: 'marketing', blockType: 'newsletter' },
  { id: 'testimonial', category: 'marketing', blockType: 'testimonial' },
  { id: 'carousel', category: 'marketing', blockType: 'carousel' },
];

interface VisualEditorProps {
  onBack: () => void;
  apiKey?: string | null;
  templateId?: string;
}

export function VisualEditor({ onBack, apiKey, templateId = 'elementar' }: VisualEditorProps) {
  const { t } = useTranslation('templates');
  const builder = useWebsiteBuilderState(templateId);
  const [device, setDevice] = useState<DeviceMode>('mobile');
  const [panel, setPanel] = useState<BuilderPanel>('sections');
  const [addOpen, setAddOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<'hero' | 'logo' | 'block' | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const storeUrl = apiKey
    ? `${window.location.origin}/templates/${templateId}?api_key=${apiKey}`
    : null;

  const sectionLabel = (type: string, blockType?: string) => {
    if (type === 'block') return t(`builder.sections.block.${blockType || 'text'}`, { defaultValue: blockType || 'Section' });
    return t(`builder.sections.${type}`);
  };

  if (builder.isLoading || !builder.customization) {
    return (
      <div className="sv-builder flex h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#6E3DFF]" />
      </div>
    );
  }

  const c = builder.customization;

  return (
    <div className="sv-builder flex h-full min-h-[calc(100dvh-4rem)] flex-col">
      <header className="sv-builder-topbar">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('builder.eyebrow')}
            </p>
            <h1 className="text-sm font-semibold md:text-base">{t('builder.title')}</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1">
          {(
            [
              ['mobile', Smartphone],
              ['tablet', Tablet],
              ['desktop', Monitor],
            ] as const
          ).map(([mode, Icon]) => (
            <button
              key={mode}
              type="button"
              className={cn(
                'rounded-full p-1.5 transition',
                device === mode ? 'bg-background shadow-sm' : 'opacity-60 hover:opacity-100'
              )}
              onClick={() => setDevice(mode)}
              aria-label={mode}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!builder.canUndo}
            onClick={builder.undo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!builder.canRedo}
            onClick={builder.redo}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {builder.saveStatus === 'saving'
              ? t('builder.saving')
              : builder.saveStatus === 'saved'
                ? t('builder.saved')
                : builder.dirty
                  ? t('builder.unsaved')
                  : t('builder.saved')}
          </span>
          {storeUrl && (
            <Button
              variant="outline"
              size="sm"
              className="hidden h-8 gap-1.5 sm:inline-flex"
              onClick={() => window.open(storeUrl, '_blank')}
            >
              <Eye className="h-3.5 w-3.5" />
              {t('builder.preview')}
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-[#6E3DFF] hover:bg-[#4B21B6]"
            onClick={async () => {
              await builder.saveNow();
              if (storeUrl) {
                await navigator.clipboard.writeText(storeUrl);
                toast.success(t('builder.publishedToast'));
              }
            }}
          >
            {t('builder.publish')}
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-hidden bg-[hsl(250_20%_96%)] dark:bg-[hsl(261_36%_8%)]">
          <CanvasPreview
            customization={c}
            sections={builder.sections}
            blocks={builder.blocks}
            selectedSectionId={builder.selectedSectionId}
            device={device}
            products={builder.previewProducts}
            collections={builder.previewCollections}
            onSelectSection={(id) => {
              builder.setSelectedSectionId(id);
              setPanel('sections');
            }}
            onInlineHeroChange={(field, value) => builder.updateCustomization({ [field]: value })}
          />
        </div>

        <aside className="sv-builder-sidepanel hidden w-[360px] shrink-0 border-l lg:flex lg:flex-col">
          <SidePanelTabs panel={panel || 'sections'} setPanel={setPanel} t={t} />
          <ScrollArea className="flex-1">
            <div className="p-4">
              {(panel || 'sections') === 'theme' ? (
                <ThemeEditor
                  customization={c}
                  onChange={builder.updateCustomization}
                  onPickMedia={setMediaTarget}
                  t={t}
                />
              ) : (panel || 'sections') === 'pages' ? (
                <PagesPanel storeUrl={storeUrl} t={t} />
              ) : (
                <SectionsPanel
                  builder={builder}
                  sectionLabel={sectionLabel}
                  onAdd={() => setAddOpen(true)}
                  onPickMedia={setMediaTarget}
                  t={t}
                />
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>

      {/* Mobile bottom dock */}
      <div className="sv-builder-dock lg:hidden">
        <button type="button" onClick={() => setPanel('sections')}>
          <Layers className="h-4 w-4" />
          {t('builder.tabs.sections')}
        </button>
        <button type="button" onClick={() => setAddOpen(true)} className="sv-builder-dock-add">
          <Plus className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => setPanel('theme')}>
          <Palette className="h-4 w-4" />
          {t('builder.tabs.theme')}
        </button>
        <button type="button" onClick={() => setPanel('pages')}>
          <FileText className="h-4 w-4" />
          {t('builder.tabs.pages')}
        </button>
      </div>

      <Sheet
        open={!isDesktop && panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl p-0 lg:hidden">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>
              {panel === 'theme'
                ? t('builder.tabs.theme')
                : panel === 'pages'
                  ? t('builder.tabs.pages')
                  : t('builder.tabs.sections')}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(75vh-3.5rem)]">
            <div className="p-4">
              {panel === 'theme' ? (
                <ThemeEditor
                  customization={c}
                  onChange={builder.updateCustomization}
                  onPickMedia={setMediaTarget}
                  t={t}
                />
              ) : panel === 'pages' ? (
                <PagesPanel storeUrl={storeUrl} t={t} />
              ) : (
                <SectionsPanel
                  builder={builder}
                  sectionLabel={sectionLabel}
                  onAdd={() => setAddOpen(true)}
                  onPickMedia={setMediaTarget}
                  t={t}
                />
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>{t('builder.addSection')}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(70vh-3.5rem)]">
            <div className="space-y-6 p-4">
              {(['content', 'marketing'] as const).map((category) => (
                <div key={category}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t(`builder.catalog.${category}`)}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {ADDABLE_SECTIONS.filter((item) => item.category === category).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="sv-builder-catalog-card"
                        onClick={() => {
                          builder.addSection(item.blockType, t(`builder.sections.block.${item.id}`));
                          setAddOpen(false);
                        }}
                      >
                        <div className="sv-builder-catalog-thumb" data-type={item.id} />
                        <div className="text-sm font-medium">{t(`builder.sections.block.${item.id}`)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <p className="mb-2 text-xs text-muted-foreground">{t('builder.catalog.productsHint')}</p>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <MediaPickerSheet
        open={!!mediaTarget}
        onOpenChange={(open) => !open && setMediaTarget(null)}
        onSelect={(url) => {
          if (mediaTarget === 'hero') builder.updateCustomization({ hero_image_url: url });
          if (mediaTarget === 'logo') builder.updateCustomization({ logo_url: url });
          if (mediaTarget === 'block' && builder.selectedBlock) {
            builder.updateBlock(builder.selectedBlock.id, {
              content: { ...builder.selectedBlock.content, imageUrl: url },
            });
          }
          setMediaTarget(null);
        }}
        t={t}
      />
    </div>
  );
}

function SidePanelTabs({
  panel,
  setPanel,
  t,
}: {
  panel: BuilderPanel;
  setPanel: (p: BuilderPanel) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex border-b">
      {(
        [
          ['sections', t('builder.tabs.sections')],
          ['theme', t('builder.tabs.theme')],
          ['pages', t('builder.tabs.pages')],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={cn(
            'flex-1 px-3 py-3 text-sm font-medium transition',
            panel === id ? 'border-b-2 border-[#6E3DFF] text-foreground' : 'text-muted-foreground'
          )}
          onClick={() => setPanel(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SectionsPanel({
  builder,
  sectionLabel,
  onAdd,
  onPickMedia,
  t,
}: {
  builder: ReturnType<typeof useWebsiteBuilderState>;
  sectionLabel: (type: string, blockType?: string) => string;
  onAdd: () => void;
  onPickMedia: (target: 'hero' | 'logo' | 'block') => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const selected = builder.selectedSection;
  const c = builder.customization!;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('builder.homepageSections')}</h3>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          {t('builder.add')}
        </Button>
      </div>

      <div className="space-y-2">
        {builder.sections.map((section) => (
          <div
            key={section.id}
            className={cn(
              'sv-builder-section-row',
              builder.selectedSectionId === section.id && 'sv-builder-section-row--active'
            )}
            onClick={() => builder.setSelectedSectionId(section.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {sectionLabel(section.type, section.blockType)}
              </div>
              {!section.visible && (
                <div className="text-[11px] text-muted-foreground">{t('builder.hidden')}</div>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  builder.moveSection(section.id, -1);
                }}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  builder.moveSection(section.id, 1);
                }}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  builder.toggleSectionVisibility(section.id);
                }}
              >
                {section.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="space-y-4 rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              {sectionLabel(selected.type, selected.blockType)}
            </h4>
            <div className="flex gap-1">
              {selected.type === 'block' && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => builder.duplicateSection(selected.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => builder.deleteSection(selected.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {selected.type === 'hero' && (
            <div className="space-y-3">
              <Field label={t('builder.fields.heading')}>
                <Input
                  value={c.hero_title}
                  onChange={(e) => builder.updateCustomization({ hero_title: e.target.value })}
                />
              </Field>
              <Field label={t('builder.fields.description')}>
                <Textarea
                  value={c.hero_subtitle}
                  onChange={(e) => builder.updateCustomization({ hero_subtitle: e.target.value })}
                />
              </Field>
              <Field label={t('builder.fields.button')}>
                <Input
                  value={c.hero_button_text}
                  onChange={(e) => builder.updateCustomization({ hero_button_text: e.target.value })}
                />
              </Field>
              <Field label={t('builder.fields.layout')}>
                <Select
                  value={c.hero_layout}
                  onValueChange={(value) => builder.updateCustomization({ hero_layout: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center">{t('builder.layouts.center')}</SelectItem>
                    <SelectItem value="left">{t('builder.layouts.left')}</SelectItem>
                    <SelectItem value="right">{t('builder.layouts.right')}</SelectItem>
                    <SelectItem value="split">{t('builder.layouts.split')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Button variant="outline" className="w-full" onClick={() => onPickMedia('hero')}>
                {t('builder.fields.changeBackground')}
              </Button>
              <div className="flex items-center justify-between">
                <Label>{t('builder.fields.gradient')}</Label>
                <Switch
                  checked={c.gradient_enabled}
                  onCheckedChange={(checked) =>
                    builder.updateCustomization({ gradient_enabled: checked })
                  }
                />
              </div>
            </div>
          )}

          {selected.type === 'header' && (
            <div className="space-y-3">
              <Field label={t('builder.fields.storeName')}>
                <Input
                  value={c.store_name}
                  onChange={(e) => builder.updateCustomization({ store_name: e.target.value })}
                />
              </Field>
              <Field label={t('builder.fields.navbarStyle')}>
                <Select
                  value={c.navbar_style}
                  onValueChange={(value) => builder.updateCustomization({ navbar_style: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transparent">Transparent</SelectItem>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="glass">Glass</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Button variant="outline" className="w-full" onClick={() => onPickMedia('logo')}>
                {t('builder.fields.changeLogo')}
              </Button>
            </div>
          )}

          {selected.type === 'footer' && (
            <Field label={t('builder.fields.footerText')}>
              <Textarea
                value={c.footer_text}
                onChange={(e) => builder.updateCustomization({ footer_text: e.target.value })}
              />
            </Field>
          )}

          {(selected.type === 'collections' ||
            selected.type === 'products' ||
            selected.type === 'reviews') && (
            <p className="text-sm text-muted-foreground">{t('builder.systemSectionHint')}</p>
          )}

          {selected.type === 'block' && builder.selectedBlock && (
            <BlockFields
              block={builder.selectedBlock}
              onChange={(content) =>
                builder.updateBlock(builder.selectedBlock!.id, { content })
              }
              onTitleChange={(title) =>
                builder.updateBlock(builder.selectedBlock!.id, { title })
              }
              onPickImage={() => onPickMedia('block')}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

function BlockFields({
  block,
  onChange,
  onTitleChange,
  onPickImage,
  t,
}: {
  block: NonNullable<ReturnType<typeof useWebsiteBuilderState>['selectedBlock']>;
  onChange: (content: typeof block.content) => void;
  onTitleChange: (title: string) => void;
  onPickImage: () => void;
  t: (key: string) => string;
}) {
  const content = block.content;
  return (
    <div className="space-y-3">
      <Field label={t('builder.fields.title')}>
        <Input value={block.title || ''} onChange={(e) => onTitleChange(e.target.value)} />
      </Field>
      {(block.block_type === 'text' ||
        block.block_type === 'text-image' ||
        block.block_type === 'banner') && (
        <Field label={t('builder.fields.text')}>
          <Textarea
            value={content.text || ''}
            onChange={(e) => onChange({ ...content, text: e.target.value })}
          />
        </Field>
      )}
      {block.block_type === 'banner' && (
        <>
          <Field label={t('builder.fields.button')}>
            <Input
              value={content.buttonText || ''}
              onChange={(e) => onChange({ ...content, buttonText: e.target.value })}
            />
          </Field>
          <Field label={t('builder.fields.buttonUrl')}>
            <Input
              value={content.buttonUrl || ''}
              onChange={(e) => onChange({ ...content, buttonUrl: e.target.value })}
            />
          </Field>
        </>
      )}
      {block.block_type === 'testimonial' && (
        <>
          <Field label={t('builder.fields.quote')}>
            <Textarea
              value={content.quote || ''}
              onChange={(e) => onChange({ ...content, quote: e.target.value })}
            />
          </Field>
          <Field label={t('builder.fields.author')}>
            <Input
              value={content.author || ''}
              onChange={(e) => onChange({ ...content, author: e.target.value })}
            />
          </Field>
        </>
      )}
      {(block.block_type === 'image' || block.block_type === 'text-image') && (
        <Button variant="outline" className="w-full" onClick={onPickImage}>
          {t('builder.fields.changeImage')}
        </Button>
      )}
      {block.block_type === 'video' && (
        <Field label={t('builder.fields.videoUrl')}>
          <Input
            value={content.videoUrl || ''}
            onChange={(e) => onChange({ ...content, videoUrl: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}

function ThemeEditor({
  customization,
  onChange,
  onPickMedia,
  t,
}: {
  customization: NonNullable<ReturnType<typeof useWebsiteBuilderState>['customization']>;
  onChange: (updates: Partial<typeof customization>) => void;
  onPickMedia: (target: 'hero' | 'logo') => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-semibold">{t('builder.theme.colors')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['primary_color', t('builder.theme.primary')],
              ['secondary_color', t('builder.theme.secondary')],
              ['accent_color', t('builder.theme.accent')],
              ['background_color', t('builder.theme.background')],
              ['text_color', t('builder.theme.text')],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="space-y-1.5 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2 rounded-xl border px-2 py-1.5">
                <input
                  type="color"
                  value={customization[key] || '#000000'}
                  onChange={(e) => onChange({ [key]: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
                />
                <Input
                  value={customization[key] || ''}
                  onChange={(e) => onChange({ [key]: e.target.value })}
                  className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t('builder.theme.typography')}</h3>
        <Field label={t('builder.theme.headingFont')}>
          <Select
            value={customization.heading_font}
            onValueChange={(value) => onChange({ heading_font: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font} value={font}>
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('builder.theme.bodyFont')}>
          <Select
            value={customization.font_family}
            onValueChange={(value) => onChange({ font_family: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font} value={font}>
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t('builder.theme.layout')}</h3>
        <Field label={t('builder.theme.radius')}>
          <Select
            value={customization.border_radius}
            onValueChange={(value) => onChange({ border_radius: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rounded-none">Square</SelectItem>
              <SelectItem value="rounded-md">Soft</SelectItem>
              <SelectItem value="rounded-lg">Rounded</SelectItem>
              <SelectItem value="rounded-2xl">Pill-ish</SelectItem>
              <SelectItem value="rounded-3xl">Max</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('builder.theme.buttons')}>
          <Select
            value={customization.button_style}
            onValueChange={(value) => onChange({ button_style: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Filled</SelectItem>
              <SelectItem value="outline">Outline</SelectItem>
              <SelectItem value="ghost">Ghost</SelectItem>
              <SelectItem value="gradient">Gradient</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Button variant="outline" className="w-full" onClick={() => onPickMedia('logo')}>
          {t('builder.fields.changeLogo')}
        </Button>
      </div>
    </div>
  );
}

function PagesPanel({
  storeUrl,
  t,
}: {
  storeUrl: string | null;
  t: (key: string) => string;
}) {
  const pages = [
    { id: 'home', editable: true },
    { id: 'products', editable: false },
    { id: 'cart', editable: false },
    { id: 'checkout', editable: false },
  ] as const;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('builder.pagesHint')}</p>
      {pages.map((page) => (
        <div key={page.id} className="flex items-center justify-between rounded-2xl border px-3 py-3">
          <div>
            <div className="text-sm font-medium">{t(`builder.pages.${page.id}`)}</div>
            <div className="text-xs text-muted-foreground">
              {page.editable ? t('builder.pages.editable') : t('builder.pages.themeLinked')}
            </div>
          </div>
          {storeUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.open(storeUrl, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function MediaPickerSheet({
  open,
  onOpenChange,
  onSelect,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  t: (key: string) => string;
}) {
  const { data: files = [], isLoading, refetch } = useQuery({
    queryKey: ['template-images-library'],
    enabled: open,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.storage.from('template-images').list(user.id, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) throw error;
      return (data || [])
        .filter((f) => f.name && !f.name.endsWith('/'))
        .map((file) => {
          const path = `${user.id}/${file.name}`;
          const { data: pub } = supabase.storage.from('template-images').getPublicUrl(path);
          return { name: file.name, url: pub.publicUrl, path };
        });
    },
  });

  const upload = async (file: File) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/builder-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('template-images').upload(path, file);
    if (error) {
      toast.error(t('builder.media.uploadFailed'));
      return;
    }
    const { data: pub } = supabase.storage.from('template-images').getPublicUrl(path);
    await refetch();
    onSelect(pub.publicUrl);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl p-0">
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle>{t('builder.media.title')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 p-4">
          <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-sm font-medium">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            {t('builder.media.upload')}
          </label>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{t('builder.media.empty')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className="aspect-square overflow-hidden rounded-xl border"
                  onClick={() => onSelect(file.url)}
                >
                  <img src={file.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
