/**
 * Generic curated-theme form — renders fields from EditorFieldSchema.
 * Themes become editable by registering schema + defaults, not a new hard-coded form.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { supabase } from '@/integrations/supabase/client';
import { useImpersonation } from '@/hooks/useImpersonation';
import { uploadMedia } from '@/lib/media/uploadMedia';
import { merchantMediaMessage } from '@/lib/media/errors';
import type { MediaType } from '@/lib/media/constants';
import type {
  ContentSlots,
  HeroStatSlot,
  MarketingSectionId,
  MediaSlot,
  NavLabelsSlot,
  SectionSlots,
  SocialLinkSlot,
  WhyCardIcon,
  WhyCardSlot,
} from '@/lib/curated-themes/contentSlots';
import { isSafeMediaUrl } from '@/lib/curated-themes/contentSlots';
import type { CuratedThemeEditorSchema, EditorFieldSchema } from '@/lib/curated-themes/editorSchema';
import { getContentPath, setContentPath, softCapText } from '@/lib/curated-themes/contentPath';

type Props = {
  schema: CuratedThemeEditorSchema;
  content: ContentSlots;
  onChange: (next: ContentSlots) => void;
};

const WHY_ICON_OPTIONS: WhyCardIcon[] = ['star', 'art', 'secure', 'ship'];
const SECTION_LABELS: Record<string, string> = {
  marquee: 'Marquee',
  featured: 'Featured',
  why: 'Why us',
  collections: 'Collections',
  editorial: 'Editorial',
  ctaBand: 'Call to action',
};

function FieldShell({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MediaField({
  label,
  value,
  onChange,
  hint,
  mediaKind = 'hero',
  defaultValue,
}: {
  label: string;
  value: MediaSlot | null | undefined;
  onChange: (next: MediaSlot | null) => void;
  hint?: string;
  mediaKind?: MediaType;
  /** When set, shows Reset to restore the theme default media. */
  defaultValue?: MediaSlot | null;
}) {
  const { t: tCommon } = useTranslation('common');
  const { effectiveUserId } = useImpersonation();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alt, setAlt] = useState(value?.alt || '');
  const [urlDraft, setUrlDraft] = useState(value?.src || '');

  useEffect(() => {
    setAlt(value?.alt || '');
    setUrlDraft(value?.src || '');
  }, [value?.src, value?.alt]);

  const { data: files = [], isLoading, refetch } = useQuery({
    queryKey: ['template-images-library', effectiveUserId, 'curated-schema'],
    enabled: open && !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('media_assets')
        .select('id, public_url, storage_path, created_at')
        .eq('user_id', effectiveUserId!)
        .eq('bucket', 'template-images')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || [])
        .filter((row) => row.public_url && isSafeMediaUrl(row.public_url))
        .map((row) => ({ path: row.storage_path, url: row.public_url as string }));
    },
  });

  const selectUrl = (url: string) => {
    if (!isSafeMediaUrl(url)) {
      toast.error('That media URL is not allowed.');
      return;
    }
    setUrlDraft(url);
    onChange({ src: url, ...(alt.trim() ? { alt: alt.trim().slice(0, 200) } : {}) });
    setOpen(false);
  };

  const applyUrlDraft = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    if (!isSafeMediaUrl(trimmed)) {
      toast.error('That media URL is not allowed.');
      return;
    }
    onChange({ src: trimmed, ...(alt.trim() ? { alt: alt.trim().slice(0, 200) } : {}) });
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadMedia({
        file,
        mediaType: mediaKind,
        replacingPublicUrl: value?.src,
      });
      await refetch();
      selectUrl(uploaded.publicUrl);
    } catch (error) {
      toast.error(merchantMediaMessage(error, tCommon));
    } finally {
      setUploading(false);
    }
  };

  return (
    <FieldShell label={label} hint={hint}>
      <div className="flex flex-wrap items-center gap-2">
        {value?.src ? (
          <img
            src={value.src}
            alt={value.alt || ''}
            className="h-14 w-14 rounded-lg border object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0.35';
            }}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-[10px] text-muted-foreground">
            None
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {value?.src ? 'Change' : 'Select'}
        </Button>
        {value?.src ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setUrlDraft('');
              setAlt('');
              onChange(null);
            }}
          >
            Remove
          </Button>
        ) : null}
        {defaultValue !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = defaultValue ? { ...defaultValue } : null;
              setUrlDraft(next?.src || '');
              setAlt(next?.alt || '');
              onChange(next);
            }}
          >
            Reset to default
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          placeholder="https://… image URL"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onBlur={applyUrlDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyUrlDraft();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={applyUrlDraft}>
          Apply URL
        </Button>
      </div>
      <Input
        className="mt-2"
        placeholder="Alt text"
        value={alt}
        onChange={(e) => {
          const nextAlt = e.target.value;
          setAlt(nextAlt);
          if (value?.src) {
            onChange({
              src: value.src,
              ...(nextAlt.trim() ? { alt: nextAlt.trim().slice(0, 200) } : {}),
            });
          }
        }}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>Media library</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-sm font-medium">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void upload(file);
                }}
              />
              {uploading ? 'Uploading…' : 'Upload image'}
            </label>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : files.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No images yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className="aspect-square overflow-hidden rounded-xl border"
                    onClick={() => selectUrl(file.url)}
                  >
                    <img src={file.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </FieldShell>
  );
}

function isFieldVisible(field: EditorFieldSchema, content: ContentSlots): boolean {
  if (!field.visibleWhen) return true;
  const cur = getContentPath(content, field.visibleWhen.key);
  return cur === field.visibleWhen.equals;
}

export function CuratedThemeForm({ schema, content, onChange }: Props) {
  const { effectiveUserId } = useImpersonation();

  const productsQuery = useQuery({
    queryKey: ['curated-theme-products', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, price, image')
        .eq('user_id', effectiveUserId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const products = productsQuery.data || [];

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, EditorFieldSchema[]>();
    for (const field of schema.fields) {
      if (!isFieldVisible(field, content)) continue;
      if (!map.has(field.group)) {
        map.set(field.group, []);
        order.push(field.group);
      }
      map.get(field.group)!.push(field);
    }
    return order.map((g) => ({ group: g, fields: map.get(g)! }));
  }, [schema.fields, content]);

  const setPath = (path: string, value: unknown) => {
    onChange(setContentPath(content, path, value));
  };

  const renderField = (field: EditorFieldSchema) => {
    const value = getContentPath(content, field.key);

    switch (field.type) {
      case 'text':
        return (
          <FieldShell key={field.key} label={field.label} hint={field.helpText}>
            <Input
              value={typeof value === 'string' ? value : value == null ? '' : String(value)}
              placeholder={field.placeholder}
              onChange={(e) =>
                setPath(field.key, softCapText(e.target.value, field.maxLength) || null)
              }
            />
          </FieldShell>
        );
      case 'textarea':
        return (
          <FieldShell key={field.key} label={field.label} hint={field.helpText}>
            <Textarea
              rows={3}
              value={typeof value === 'string' ? value : value == null ? '' : String(value)}
              placeholder={field.placeholder}
              onChange={(e) =>
                setPath(field.key, softCapText(e.target.value, field.maxLength) || null)
              }
            />
          </FieldShell>
        );
      case 'choice':
        return (
          <FieldShell key={field.key} label={field.label} hint={field.helpText}>
            <Select
              value={typeof value === 'string' ? value : ''}
              onValueChange={(v) => setPath(field.key, v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        );
      case 'image':
        return (
          <MediaField
            key={field.key}
            label={field.label}
            hint={field.helpText}
            value={(value as MediaSlot | null | undefined) || null}
            onChange={(next) => setPath(field.key, next)}
            defaultValue={null}
          />
        );
      case 'commerce-note':
        return (
          <div
            key={field.key}
            className="rounded-xl border border-dashed bg-muted/40 px-3 py-3 space-y-2"
          >
            <p className="text-sm font-medium">{field.label}</p>
            {field.helpText ? (
              <p className="text-[11px] text-muted-foreground leading-relaxed">{field.helpText}</p>
            ) : null}
            {field.manageHref ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={field.manageHref}>{field.manageLabel || 'Open Products'}</a>
              </Button>
            ) : field.manageLabel ? (
              <p className="text-xs font-medium text-foreground">{field.manageLabel}</p>
            ) : null}
          </div>
        );
      case 'product':
        return (
          <FieldShell key={field.key} label={field.label} hint={field.helpText}>
            <Select
              value={(typeof value === 'string' && value) || '__auto__'}
              onValueChange={(v) => setPath(field.key, v === '__auto__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Auto-pick from catalog" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Auto-pick from catalog</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} · {Number(p.price).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        );
      case 'string-list': {
        const items = Array.isArray(value) ? (value as string[]) : [];
        return (
          <FieldShell key={field.key} label={field.label} hint={field.helpText}>
            <Textarea
              rows={4}
              value={items.join('\n')}
              onChange={(e) => {
                const next = e.target.value
                  .split('\n')
                  .map((s) => softCapText(s, field.maxLength))
                  .slice(0, field.maxCount || 24);
                // Preserve trailing blank line while typing a new item
                const trimmedEnd = next.length && next[next.length - 1] === '' ? next : next.filter((s, i, a) => s !== '' || i === a.length - 1);
                const cleaned = trimmedEnd.filter((s, i, a) => s.length > 0 || i === a.length - 1);
                setPath(
                  field.key,
                  cleaned.every((s) => !s) ? null : cleaned.map((s) => s),
                );
              }}
            />
          </FieldShell>
        );
      }
      case 'why-cards': {
        const cards = (Array.isArray(value) ? value : []) as WhyCardSlot[];
        const max = field.maxCount || 8;
        return (
          <div key={field.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={cards.length >= max}
                onClick={() =>
                  setPath(field.key, [
                    ...cards,
                    { icon: 'star' as WhyCardIcon, title: 'New card', body: 'Describe this benefit.' },
                  ])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add card
              </Button>
            </div>
            {cards.map((card, idx) => (
              <div key={idx} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Select
                    value={card.icon}
                    onValueChange={(v) => {
                      const next = cards.slice();
                      next[idx] = { ...card, icon: v as WhyCardIcon };
                      setPath(field.key, next);
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WHY_ICON_OPTIONS.map((ic) => (
                        <SelectItem key={ic} value={ic}>
                          {ic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setPath(field.key, cards.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={card.title}
                  onChange={(e) => {
                    const next = cards.slice();
                    next[idx] = { ...card, title: softCapText(e.target.value, 80) };
                    setPath(field.key, next);
                  }}
                  placeholder="Title"
                />
                <Textarea
                  rows={2}
                  value={card.body}
                  onChange={(e) => {
                    const next = cards.slice();
                    next[idx] = { ...card, body: softCapText(e.target.value, 320) };
                    setPath(field.key, next);
                  }}
                  placeholder="Description"
                />
              </div>
            ))}
          </div>
        );
      }
      case 'hero-stats': {
        const stats = (Array.isArray(value) ? value : []) as HeroStatSlot[];
        const max = field.maxCount || 6;
        return (
          <div key={field.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={stats.length >= max}
                onClick={() => setPath(field.key, [...stats, { title: 'Highlight', subtitle: 'Detail' }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {field.helpText ? <p className="text-[11px] text-muted-foreground">{field.helpText}</p> : null}
            {stats.map((stat, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  className="flex-1"
                  value={stat.title}
                  onChange={(e) => {
                    const next = stats.slice();
                    next[idx] = { ...stat, title: softCapText(e.target.value, 40) };
                    setPath(field.key, next);
                  }}
                  placeholder="Title"
                />
                <Input
                  className="flex-1"
                  value={stat.subtitle}
                  onChange={(e) => {
                    const next = stats.slice();
                    next[idx] = { ...stat, subtitle: softCapText(e.target.value, 80) };
                    setPath(field.key, next);
                  }}
                  placeholder="Subtitle"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setPath(field.key, stats.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        );
      }
      case 'social-links': {
        const links = (Array.isArray(value) ? value : []) as SocialLinkSlot[];
        const max = field.maxCount || 8;
        return (
          <div key={field.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={links.length >= max}
                onClick={() =>
                  setPath(field.key, [...links, { label: 'Instagram', url: 'https://' }])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {field.helpText ? <p className="text-[11px] text-muted-foreground">{field.helpText}</p> : null}
            {links.map((link, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  className="w-32"
                  value={link.label}
                  onChange={(e) => {
                    const next = links.slice();
                    next[idx] = { ...link, label: softCapText(e.target.value, 40) };
                    setPath(field.key, next);
                  }}
                  placeholder="Label"
                />
                <Input
                  className="flex-1"
                  value={link.url}
                  onChange={(e) => {
                    const next = links.slice();
                    next[idx] = { ...link, url: softCapText(e.target.value, 2048) };
                    setPath(field.key, next);
                  }}
                  placeholder="https://"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setPath(field.key, links.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        );
      }
      case 'nav-labels': {
        const nav = (value as NavLabelsSlot | null) || {
          shop: '',
          featured: '',
          why: '',
          contact: '',
        };
        const patch = (k: keyof NavLabelsSlot, v: string) =>
          setPath(field.key, { ...nav, [k]: softCapText(v, field.maxLength || 40) });
        return (
          <div key={field.key} className="grid gap-2 sm:grid-cols-2">
            {(['shop', 'featured', 'why', 'contact'] as const).map((k) => (
              <FieldShell key={k} label={k}>
                <Input value={nav[k] || ''} onChange={(e) => patch(k, e.target.value)} />
              </FieldShell>
            ))}
          </div>
        );
      }
      case 'section-controls': {
        const defaultOpts = field.sectionOptions?.length
          ? field.sectionOptions
          : [
              { id: 'marquee', label: 'Marquee' },
              { id: 'featured', label: 'Featured' },
              { id: 'why', label: 'Why us' },
            ];
        const defaultOrder = defaultOpts.map((o) => o.id) as MarketingSectionId[];
        const sections = (value as SectionSlots | null) || {
          order: defaultOrder,
          hidden: [],
        };
        const order = (sections.order.length ? sections.order : defaultOrder) as MarketingSectionId[];
        const hidden = new Set(sections.hidden || []);
        const labelFor = (id: string) =>
          defaultOpts.find((o) => o.id === id)?.label || SECTION_LABELS[id] || id;
        const move = (idx: number, dir: -1 | 1) => {
          const next = order.slice();
          const j = idx + dir;
          if (j < 0 || j >= next.length) return;
          [next[idx], next[j]] = [next[j], next[idx]];
          setPath(field.key, { order: next, hidden: [...hidden] });
        };
        const toggle = (id: MarketingSectionId) => {
          const next = new Set(hidden);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setPath(field.key, { order, hidden: [...next] });
        };
        return (
          <div key={field.key} className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
            {field.helpText ? <p className="text-[11px] text-muted-foreground">{field.helpText}</p> : null}
            {order.map((id, idx) => (
              <div
                key={id}
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
              >
                <span className="text-sm font-medium">{labelFor(id)}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(idx, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(idx, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => toggle(id)}>
                    {hidden.has(id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {groups.map(({ group, fields }) => (
        <section key={group} className="space-y-3">
          <h3 className="text-sm font-semibold">{group}</h3>
          {fields.map((f) => renderField(f))}
        </section>
      ))}
    </div>
  );
}
