import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, LayoutTemplate, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VisualEditor } from './VisualEditor';
import '@/styles/website-builder.css';

type BuilderView = 'gallery' | 'editor';

export default function WebsiteBuilder() {
  const { t } = useTranslation('templates');
  const { t: tCommon } = useTranslation('common');
  const [view, setView] = useState<BuilderView>('gallery');
  const [copiedKey, setCopiedKey] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('profiles')
        .select('store_api_key, store_name')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
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
        onBack={() => setView('gallery')}
      />
    );
  }

  const TemplateActions = ({
    id,
    primaryClassName,
  }: {
    id: string;
    primaryClassName?: string;
  }) => (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">{t('modes.demoHint')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className={`flex-1 ${primaryClassName || ''}`}
          disabled={!profile?.store_api_key}
          onClick={() => window.open(getTemplateUrl(id, { demo: true }), '_blank')}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {t('action.demo')}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={!profile?.store_api_key}
          onClick={() => window.open(getTemplateUrl(id), '_blank')}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('action.live')}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('modes.liveHint')}</p>
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={!profile?.store_api_key}
        onClick={() => {
          navigator.clipboard.writeText(getTemplateUrl(id));
          toast.success(
            id === 'floral'
              ? t('toast.floralUrlCopied')
              : id === 'premium'
                ? t('toast.premiumUrlCopied')
                : t('toast.apiKeyCopied')
          );
        }}
      >
        <Copy className="mr-2 h-4 w-4" />
        {t('action.copyLiveUrl')}
      </Button>
    </div>
  );

  return (
    <div className="sv-builder-home space-y-6 px-1 pb-8">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E3DFF]">
          {t('builder.hubEyebrow')}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t('builder.hubTitle')}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
          {t('builder.hubSubtitle')}
        </p>
      </div>

      <div className="rounded-3xl border bg-gradient-to-br from-[#1A0F2E] to-[#0D0717] p-5 text-white shadow-lg md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <Sparkles className="h-3.5 w-3.5 text-[#C4B5FF]" />
              {t('builder.hubLiveBadge')}
            </div>
            <h2 className="text-xl font-semibold">{t('builder.hubCtaTitle')}</h2>
            <p className="max-w-xl text-sm text-white/65">{t('builder.hubCtaBody')}</p>
          </div>
          <Button
            className="h-11 rounded-full bg-white px-5 text-[#1A0F2E] hover:bg-white/90"
            onClick={() => setView('editor')}
            disabled={!profile?.store_api_key}
          >
            {t('builder.openBuilder')}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-[#6E3DFF]" />
          <h3 className="text-sm font-semibold">{t('apiKeyTitle')}</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t('apiKeyDesc')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 overflow-hidden break-all rounded-xl bg-muted px-3 py-2 font-mono text-xs">
            {profile?.store_api_key || tCommon('loading')}
          </code>
          <Button
            variant="outline"
            size="sm"
            disabled={!profile?.store_api_key}
            onClick={() => {
              if (!profile?.store_api_key) return;
              navigator.clipboard.writeText(profile.store_api_key);
              setCopiedKey(true);
              toast.success(t('toast.apiKeyCopied'));
              setTimeout(() => setCopiedKey(false), 2000);
            }}
          >
            {copiedKey ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                {t('copied')}
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                {tCommon('copy')}
              </>
            )}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold">{t('builder.templatesTitle')}</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="relative h-40 bg-gradient-to-br from-stone-200 via-stone-100 to-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#ffffff88,transparent_55%)]" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">{t('editable.badge')}</p>
                <p className="font-serif text-2xl text-stone-800">{t('editable.name')}</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{t('status.active')}</Badge>
                <Badge variant="outline">{t('badge.editable')}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t('editable.description')}</p>
              <Button className="w-full" onClick={() => setView('editor')}>
                {t('builder.customizeTemplate')}
              </Button>
              <TemplateActions id="elementar" />
            </div>
          </article>

          <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="relative h-40 bg-gradient-to-br from-[#1c2b24] via-[#2a3d34] to-[#0f1612]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#ffffff33,transparent_55%)]" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">{t('premium.badge')}</p>
                <p className="font-serif text-2xl text-white">{t('premium.name')}</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{t('status.active')}</Badge>
                <Badge>{t('badge.predesigned')}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t('premium.description')}</p>
              <TemplateActions id="premium" />
            </div>
          </article>

          <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="relative h-40 bg-gradient-to-br from-[#f3e4e0] via-[#fbf8f5] to-[#efe8e3]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,#c97b8433,transparent_55%)]" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#9e4f5a]">{t('floral.badge')}</p>
                <p className="font-serif text-2xl text-[#1f1714]">{t('floral.name')}</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{t('status.active')}</Badge>
                <Badge>{t('badge.predesigned')}</Badge>
                <Badge variant="outline">{t('floral.niche')}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t('floral.description')}</p>
              <TemplateActions id="floral" primaryClassName="bg-[#9e4f5a] hover:bg-[#824048]" />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
