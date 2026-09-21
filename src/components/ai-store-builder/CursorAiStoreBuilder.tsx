import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  History,
  Monitor,
  RotateCcw,
  Smartphone,
  Sparkles,
  Tablet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useCursorAiStoreBuilder } from '@/hooks/useCursorAiStoreBuilder';
import { trackAiBuilderEvent } from '@/lib/ai-store-builder/analytics';
import '@/styles/cursor-ai-store-builder.css';
import EmptyState from './EmptyState';
import ChatPanel from './ChatPanel';
import PreviewPane from './PreviewPane';
import VersionHistory from './VersionHistory';
import UsageBadge from './UsageBadge';
import AdminDebug from './AdminDebug';
import ProgressBanner from './ProgressBanner';

type Props = {
  onBack: () => void;
};

export default function CursorAiStoreBuilder({ onBack }: Props) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const builder = useCursorAiStoreBuilder();

  useEffect(() => {
    trackAiBuilderEvent('ai_builder_opened');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('is_superadmin_user');
      if (!cancelled) setIsSuperadmin(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Funnel: generation / edit completion from draft + busy transitions
  useEffect(() => {
    if (!builder.activeRun) return;
    trackAiBuilderEvent(
      builder.activeRun.runType === 'followup' ? 'ai_edit_started' : 'ai_generation_started',
    );
  }, [builder.activeRun?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (builder.localError && !builder.busy) {
      trackAiBuilderEvent('ai_generation_failed');
    }
  }, [builder.localError, builder.busy]);

  useEffect(() => {
    if (!builder.busy && builder.session?.current_draft_version_id && builder.conversation.length) {
      const last = builder.conversation[builder.conversation.length - 1];
      if (last?.role === 'assistant') {
        const isFollowup = builder.conversation.filter((m) => m.role === 'user').length > 1;
        trackAiBuilderEvent(isFollowup ? 'ai_edit_completed' : 'ai_generation_completed');
      }
    }
  }, [builder.session?.current_draft_version_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (builder.isLoading) {
    return (
      <div className="sv-cursor-builder items-center justify-center p-8 text-sm text-muted-foreground">
        Loading AI Store Builder…
      </div>
    );
  }

  if (builder.viewMode === 'empty') {
    return (
      <div className="sv-cursor-builder">
        <div className="sv-cursor-builder__topbar">
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to website builder">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <span className="sv-cursor-builder__brand">
            <Sparkles className="sv-cursor-builder__brand-mark h-4 w-4" />
            AI Store Builder
          </span>
          <UsageBadge
            available={builder.entitlement?.available}
            exhausted={builder.entitlement?.exhausted}
            low={builder.entitlement?.low}
            runsUsed={builder.entitlement?.runs_used}
            maxRuns={builder.entitlement?.max_runs}
          />
        </div>
        {builder.localError && (
          <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {builder.localError}
          </div>
        )}
        {builder.busy && (
          <ProgressBanner stage={builder.uiStage} busy={builder.busy} onCancel={builder.cancel} />
        )}
        <EmptyState
          prompt={prompt}
          onPromptChange={setPrompt}
          onGenerate={() => void builder.sendPrompt(prompt)}
          productCount={builder.productCount}
          busy={builder.busy}
          onAddProducts={() => navigate('/products')}
        />
        {isSuperadmin && <AdminDebug data={builder.adminDebug} />}
      </div>
    );
  }

  return (
    <div className="sv-cursor-builder">
      <div className="sv-cursor-builder__topbar">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to website builder">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <span className="sv-cursor-builder__brand">
          <Sparkles className="sv-cursor-builder__brand-mark h-4 w-4" />
          AI Store Builder
        </span>
        <span className="sv-cursor-builder__draft-pill">Draft</span>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          Your live storefront has not changed.
        </span>
        <UsageBadge
          available={builder.entitlement?.available}
          exhausted={builder.entitlement?.exhausted}
          low={builder.entitlement?.low}
          runsUsed={builder.entitlement?.runs_used}
          maxRuns={builder.entitlement?.max_runs}
        />

        <div className="sv-cursor-builder__device" aria-label="Preview device">
          {(
            [
              ['desktop', Monitor, 'Desktop'],
              ['tablet', Tablet, 'Tablet'],
              ['mobile', Smartphone, 'Mobile'],
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              data-active={builder.device === mode ? 'true' : 'false'}
              onClick={() => builder.setDevice(mode)}
              title={label}
              aria-label={label}
              aria-pressed={builder.device === mode}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="sv-cursor-builder__actions">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-full">
                <History className="mr-1 h-3.5 w-3.5" />
                Versions
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Version history</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <VersionHistory
                  versions={builder.versions}
                  currentDraftId={builder.session?.current_draft_version_id}
                  viewingVersionId={builder.previewVersionId}
                  onPreview={(id) => void builder.previewVersion(id)}
                  onRestore={(id) => {
                    trackAiBuilderEvent('ai_version_restored');
                    void builder.restore(id);
                  }}
                  busy={builder.busy}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            disabled={builder.busy}
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                !window.confirm(
                  'Start over with a new AI session? Your previous drafts stay saved.',
                )
              ) {
                return;
              }
              void builder.startOver();
            }}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Start over
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" disabled title="Coming in a later phase">
            Publishing coming next
          </Button>
        </div>
      </div>

      <div className="sv-cursor-mobile-tabs">
        <button
          type="button"
          data-active={builder.mobileTab === 'chat' ? 'true' : 'false'}
          onClick={() => builder.setMobileTab('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          data-active={builder.mobileTab === 'preview' ? 'true' : 'false'}
          onClick={() => builder.setMobileTab('preview')}
        >
          Preview
        </button>
      </div>

      <div className="sv-cursor-builder__body">
        <ChatPanel
          messages={builder.conversation}
          busy={builder.busy}
          stage={builder.uiStage}
          onSend={(t) => void builder.sendPrompt(t)}
          onCancel={() => void builder.cancel()}
          error={builder.localError}
          hidden={builder.mobileTab === 'preview'}
          exhausted={Boolean(builder.entitlement?.exhausted)}
        />
        {isSuperadmin && builder.mobileTab === 'chat' && (
          <AdminDebug data={builder.adminDebug} />
        )}
        <PreviewPane
          previewUrl={builder.previewUrl}
          device={builder.device}
          busy={builder.busy}
          viewingOlder={builder.viewingOlder}
          onRefresh={() => void builder.refreshPreview()}
          onRestoreViewed={() => {
            if (builder.previewVersionId) {
              trackAiBuilderEvent('ai_version_restored');
              void builder.restore(builder.previewVersionId);
            }
          }}
          onBackToCurrent={() => void builder.backToCurrentDraft()}
          hidden={builder.mobileTab === 'chat'}
        />
      </div>
    </div>
  );
}
