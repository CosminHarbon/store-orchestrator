import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Eye, RotateCcw, Save } from 'lucide-react';
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
import { CuratedThemePreviewFrame } from './CuratedThemePreviewFrame';
import { CuratedThemeForm } from './CuratedThemeForm';
import { NOVATEE_EDITOR_SCHEMA } from '@/lib/curated-themes/novateeEditorSchema';

type Props = {
  onBack: () => void;
};

export function NovateeThemeEditor({ onBack }: Props) {
  const { effectiveUserId } = useImpersonation();
  const qc = useQueryClient();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [draft, setDraft] = useState<StorefrontContentConfig | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [discardOpen, setDiscardOpen] = useState(false);

  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);

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
    queryKey: ['curated-theme-draft', effectiveUserId, 'novatee'],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const existing = await loadCuratedThemeDraft(effectiveUserId!, 'novatee');
      if (existing) return existing;
      return ensureCuratedThemeDraft({
        userId: effectiveUserId!,
        themeId: 'novatee',
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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    return {
      storeApiKey: key,
      apiBase: `${supabaseUrl}/functions/v1/store-api`,
      hostedCheckoutOrigin: window.location.origin,
    };
  }, [profileQuery.data?.store_api_key]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveUserId || !draft) throw new Error('Nothing to save');
      return saveCuratedThemeDraft({
        userId: effectiveUserId,
        themeId: 'novatee',
        storeName: profileQuery.data?.store_name || 'My Store',
        config: draft,
      });
    },
    onSuccess: (saved) => {
      setDraft(saved);
      setSavedSnapshot(JSON.stringify(saved));
      toast.success('Draft saved');
      void qc.invalidateQueries({ queryKey: ['curated-theme-draft', effectiveUserId, 'novatee'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save draft'),
  });

  const discard = useCallback(() => {
    if (!savedSnapshot) {
      setDraft(createDraftConfig('novatee'));
      return;
    }
    setDraft(JSON.parse(savedSnapshot) as StorefrontContentConfig);
    setDiscardOpen(false);
  }, [savedSnapshot]);

  const openFullPreview = () => {
    if (!runtime) {
      toast.error('Store API key required');
      return;
    }
    setFullPreviewOpen(true);
  };

  if (loadQuery.isLoading || !draft) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading Novatee draft…
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
            <h1 className="text-2xl font-semibold tracking-tight">{NOVATEE_MANIFEST.name}</h1>
            <Badge variant="secondary">Draft</Badge>
            {dirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Customize content slots. Products, prices, and checkout stay on live commerce. Publishing to
            your live storefront is not enabled yet for curated runtimes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!dirty} onClick={() => setDiscardOpen(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Discard changes
          </Button>
          <Button
            variant="outline"
            onClick={openFullPreview}
            disabled={!runtime}
          >
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
          <Button variant="secondary" disabled title="Publish requires a hosted curated-runtime go-live contract (not available yet).">
            Publish
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,420px)_1fr]">
        <div className="max-h-[calc(100vh-8rem)] space-y-4 overflow-y-auto rounded-2xl border bg-card p-4">
          <CuratedThemeForm
            schema={NOVATEE_EDITOR_SCHEMA}
            content={draft.content}
            onChange={(content) =>
              // Keep raw editor values while typing — do NOT run persist sanitizers here
              // (they trim trailing spaces and break Space / multi-word input).
              setDraft((prev) => (prev ? { ...prev, content, status: 'draft' } : prev))
            }
          />
        </div>
        <div className="rounded-2xl border bg-muted/30 p-3 md:p-4">
          <CuratedThemePreviewFrame
            themeId="novatee"
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
            <DialogTitle>Novatee preview</DialogTitle>
            <DialogDescription>
              Live catalog via store-api — does not publish your storefront.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/40 p-4">
            <CuratedThemePreviewFrame
              themeId="novatee"
              config={draft}
              runtime={runtime}
              device={device}
              onDeviceChange={setDevice}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
