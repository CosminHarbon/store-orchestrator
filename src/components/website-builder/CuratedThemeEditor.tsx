import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ExternalLink, Eye, RotateCcw, Save, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useImpersonation } from '@/hooks/useImpersonation';
import { supabase } from '@/integrations/supabase/client';
import { NOVATEE_MANIFEST } from '@/lib/curated-themes/novatee';
import { FOUNDATION_MANIFEST } from '@/lib/curated-themes/foundation';
import type { CuratedThemeId } from '@/lib/curated-themes/themeIds';
import { FOUNDATION_EDITOR_SCHEMA } from '@/lib/curated-themes/foundationEditorSchema';
import { STORE_API_BASE, CHECKOUT_APP_ORIGIN } from '@/lib/storefront/api';
import {
  createDraftConfig,
  validateStorefrontContentConfig,
  type StorefrontContentConfig,
} from '@/lib/curated-themes/storefrontContentConfig';
import {
  ensureCuratedThemeDraft,
  loadCuratedThemeDraft,
  saveCuratedThemeDraft,
} from '@/lib/curated-themes/draftPersistence';
import { submitDesignRequest } from '@/lib/website-builder/designRequests';
import { trackWebsiteBuilderEvent } from '@/lib/website-builder/analytics';
import { CuratedThemePreviewFrame } from './CuratedThemePreviewFrame';
import { CuratedThemeForm } from './CuratedThemeForm';
import { NOVATEE_EDITOR_SCHEMA } from '@/lib/curated-themes/novateeEditorSchema';

type Props = {
  themeId: CuratedThemeId;
  onBack: () => void;
};

const MANIFESTS = {
  novatee: NOVATEE_MANIFEST,
  foundation: FOUNDATION_MANIFEST,
} as const;

const SCHEMAS = {
  novatee: NOVATEE_EDITOR_SCHEMA,
  foundation: FOUNDATION_EDITOR_SCHEMA,
} as const;

export function CuratedThemeEditor({ themeId, onBack }: Props) {
  const manifest = MANIFESTS[themeId];
  const editorSchema = SCHEMAS[themeId];

  const { effectiveUserId } = useImpersonation();
  const qc = useQueryClient();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [draft, setDraft] = useState<StorefrontContentConfig | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [humanTeamSentOpen, setHumanTeamSentOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['profile', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('store_api_key, store_name')
        .eq('user_id', effectiveUserId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const loadQuery = useQuery({
    queryKey: ['curated-theme-draft', effectiveUserId, themeId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const existing = await loadCuratedThemeDraft(effectiveUserId!, themeId);
      if (existing) return existing;
      return ensureCuratedThemeDraft({
        userId: effectiveUserId!,
        themeId,
        storeName: profileQuery.data?.store_name || 'My Store',
      });
    },
  });

  useEffect(() => {
    if (!loadQuery.data) return;
    const validated = validateStorefrontContentConfig(loadQuery.data);
    setDraft(validated);
    setSavedSnapshot(JSON.stringify(validated));
  }, [loadQuery.data]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return JSON.stringify(draft) !== savedSnapshot;
  }, [draft, savedSnapshot]);

  const runtime = useMemo(() => {
    const key = profileQuery.data?.store_api_key;
    if (!key) return null;
    return {
      storeApiKey: key,
      apiBase: STORE_API_BASE,
      hostedCheckoutOrigin: CHECKOUT_APP_ORIGIN || window.location.origin,
      returnOrigin: window.location.origin,
    };
  }, [profileQuery.data?.store_api_key]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveUserId || !draft) throw new Error('Nothing to save');
      return saveCuratedThemeDraft({
        userId: effectiveUserId,
        themeId,
        config: draft,
      });
    },
    onSuccess: (saved) => {
      setDraft(saved);
      setSavedSnapshot(JSON.stringify(saved));
      toast.success('Draft saved');
      void qc.invalidateQueries({ queryKey: ['curated-theme-draft', effectiveUserId, themeId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save draft'),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveUserId || !draft) throw new Error('Nothing to publish');
      if (dirty) {
        const saved = await saveCuratedThemeDraft({
          userId: effectiveUserId,
          themeId,
          config: draft,
        });
        setDraft(saved);
        setSavedSnapshot(JSON.stringify(saved));
      }
      const styleHint =
        themeId === 'foundation'
          ? ['editorial', 'minimal', 'modern']
          : ['bold', 'modern', 'playful'];
      return submitDesignRequest({
        userId: effectiveUserId,
        storeName: profileQuery.data?.store_name || null,
        selectedStyles: styleHint,
        inspirationText: `Merchant selected the ${manifest.name} template direction as inspiration.`,
        inspirationUrls: [],
        notes: `Template publish request · themeId=${themeId}. Please create the final storefront for this merchant. Curated draft was saved; do not treat this as an automated live publish.`,
        inspirationMediaUrls: [],
      });
    },
    onSuccess: () => {
      trackWebsiteBuilderEvent('template_selected', { template_id: themeId });
      void qc.invalidateQueries({ queryKey: ['design-request', effectiveUserId] });
      void qc.invalidateQueries({ queryKey: ['curated-theme-draft', effectiveUserId, themeId] });
      setHumanTeamSentOpen(true);
    },
    onError: (e: Error) => toast.error(e.message || 'Could not send design to our team'),
  });

  const discard = useCallback(() => {
    if (!savedSnapshot) {
      setDraft(createDraftConfig(themeId));
      return;
    }
    setDraft(JSON.parse(savedSnapshot) as StorefrontContentConfig);
    setDiscardOpen(false);
  }, [savedSnapshot, themeId]);

  const openFullPreview = () => {
    if (!runtime) {
      toast.error('Store API key required for live preview.');
      return;
    }
    setFullPreviewOpen(true);
  };

  if (loadQuery.isLoading || !draft) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading {manifest.name} draft…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-1 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to templates
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{manifest.name}</h1>
            <Badge variant="secondary">Draft</Badge>
            {dirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Customize this direction as inspiration. Products, prices and checkout stay on live
            commerce. When you publish, our human design team builds the final store for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!dirty} onClick={() => setDiscardOpen(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Discard changes
          </Button>
          <Button variant="outline" onClick={openFullPreview} disabled={!runtime}>
            <Eye className="mr-2 h-4 w-4" />
            Preview storefront
          </Button>
          <Button
            className="bg-[#6E3DFF] hover:bg-[#5b30e0]"
            disabled={saveMutation.isPending || !dirty}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? 'Saving…' : 'Save draft'}
          </Button>
          <Button
            className="bg-[#1A0F2E] hover:bg-[#1A0F2E]/90"
            disabled={publishMutation.isPending || !effectiveUserId}
            onClick={() => publishMutation.mutate()}
          >
            {publishMutation.isPending ? 'Sending…' : 'Publish'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,420px)_1fr]">
        <div className="max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto rounded-2xl border bg-card p-4">
          <CuratedThemeForm
            schema={editorSchema}
            content={draft.content}
            onChange={(content) =>
              setDraft((prev) => (prev ? { ...prev, content, status: 'draft' } : prev))
            }
          />
        </div>
        <div className="rounded-2xl border bg-muted/30 p-3 md:p-4">
          <CuratedThemePreviewFrame
            themeId={themeId}
            config={draft}
            runtime={runtime}
            device={device}
            onDeviceChange={setDevice}
          />
          <p className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
            Preview uses your real catalog via store-api. Cart can open hosted checkout in this frame.
          </p>
        </div>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your draft will revert to the last saved version. This does not affect your live storefront.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={fullPreviewOpen} onOpenChange={setFullPreviewOpen}>
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogHeader className="border-b px-4 py-3 text-left">
            <DialogTitle>{manifest.name} preview</DialogTitle>
            <DialogDescription>
              Live catalog via store-api — does not publish your storefront.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/40 p-4">
            <CuratedThemePreviewFrame
              themeId={themeId}
              config={draft}
              runtime={runtime}
              device={device}
              onDeviceChange={setDevice}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={humanTeamSentOpen} onOpenChange={setHumanTeamSentOpen}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:rounded-3xl">
          <div className="bg-gradient-to-br from-[#F4F0FF] via-white to-white px-6 py-8 text-center sm:px-8 sm:py-10">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#6E3DFF] text-white shadow-lg shadow-[#6E3DFF]/30">
              <UsersRound className="h-7 w-7" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E3DFF]">
              Design request sent
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#1A0F2E] sm:text-3xl">
              Design sent to our human team
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              They will create it for you and be right back. Your {manifest.name} choices are saved as
              inspiration — your live storefront stays unchanged until the team delivers.
            </p>
            <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm text-[#1A0F2E]/85">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6E3DFF]" />
                Human designers — not automated AI generation
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6E3DFF]" />
                Built on your products, Netopia, eAWB and Oblio
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6E3DFF]" />
                We&apos;ll notify you when it&apos;s ready to review
              </li>
            </ul>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                className="h-11 rounded-full bg-[#6E3DFF] px-6 hover:bg-[#5b30e0]"
                onClick={() => {
                  setHumanTeamSentOpen(false);
                  onBack();
                }}
              >
                Back to templates
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-full"
                onClick={() => setHumanTeamSentOpen(false)}
              >
                Keep editing draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** @deprecated Prefer CuratedThemeEditor with themeId="novatee" */
export function NovateeThemeEditor({ onBack }: { onBack: () => void }) {
  return <CuratedThemeEditor themeId="novatee" onBack={onBack} />;
}
