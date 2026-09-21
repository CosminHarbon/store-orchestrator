/**
 * React Query + polling for Cursor AI Store Builder (Phase 3).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelRun,
  completeRun,
  createReplacementSession,
  CursorGatewayError,
  fetchBuilderStatus,
  followupEdit,
  getPreviewToken,
  getRun,
  newIdempotencyKey,
  restoreVersion,
  startGeneration,
  type ConversationMessage,
  type GatewayStatus,
  type VersionSummary,
} from '@/lib/ai-store-builder/cursorGateway';
import { mapGatewayError, pipelineToUiStage, type UiStage } from '@/lib/ai-store-builder/builderState';
import { deriveVersionLabel } from '@/lib/ai-store-builder/versionLabels';

const STATUS_KEY = ['cursor-ai-store-builder', 'status'] as const;
const POLL_MS = 4000;

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export type BuilderViewMode = 'empty' | 'studio';

type ActiveRun = {
  runId: string;
  runType: 'initial' | 'followup';
  prompt: string;
};

export function useCursorAiStoreBuilder(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');
  const sendLock = useRef(false);
  const lastDraftRef = useRef<string | null>(null);

  const statusQuery = useQuery({
    queryKey: STATUS_KEY,
    enabled,
    queryFn: fetchBuilderStatus,
    refetchInterval: (q) => {
      const s = q.state.data as GatewayStatus | undefined;
      if (s?.session?.active_run_id || activeRun) return POLL_MS;
      return false;
    },
    staleTime: 2_000,
  });

  const status = statusQuery.data;
  const session = status?.session ?? null;
  const versions: VersionSummary[] = status?.versions ?? [];
  const conversation: ConversationMessage[] = session?.conversation ?? [];
  const productCount = status?.product_count ?? 0;
  const entitlement = status?.entitlement;
  const draftId = session?.current_draft_version_id ?? null;
  const hasDraft = Boolean(draftId);
  const viewMode: BuilderViewMode = hasDraft || conversation.length > 0 || Boolean(activeRun)
    ? 'studio'
    : 'empty';

  const uiStage: UiStage = pipelineToUiStage(
    // Don't keep a sticky "Cancelled" banner after the run is gone — treat as idle.
    !activeRun &&
      !session?.active_run_id &&
      session?.pipeline_status === 'cancelled'
      ? null
      : ((session?.pipeline_status as import('@/lib/ai-store-builder/builderState').PipelineStatus) ??
          null),
    {
      runType: activeRun?.runType || (conversation.length > 1 ? 'followup' : 'initial'),
    },
  );

  // Drop stale allowance / cancel banners once the backend says we can run again.
  useEffect(() => {
    if (!entitlement) return;
    if (entitlement.available && !entitlement.exhausted) {
      setLocalError((prev) =>
        prev && /usage limit|cancelled/i.test(prev) ? null : prev,
      );
    }
  }, [entitlement?.available, entitlement?.exhausted]);

  // Recover active run on mount / status refresh
  useEffect(() => {
    if (!session?.active_run_id) return;
    if (activeRun?.runId === session.active_run_id) return;
    setActiveRun({
      runId: session.active_run_id,
      runType: hasDraft ? 'followup' : 'initial',
      prompt: '',
    });
  }, [session?.active_run_id, activeRun?.runId, hasDraft]);

  // Poll get_run → complete_run while active
  useEffect(() => {
    if (!activeRun || !enabled) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const { run, cursor } = await getRun(activeRun.runId);
        const remote = String(cursor?.status || '').toUpperCase();
        const local = String(run?.status || '').toLowerCase();

        if (['error', 'cancelled', 'expired'].includes(local) || ['ERROR', 'CANCELLED', 'EXPIRED'].includes(remote)) {
          if (!cancelled) {
            setActiveRun(null);
            setLocalError(mapGatewayError(run?.error_category || local).message);
            void qc.invalidateQueries({ queryKey: STATUS_KEY });
          }
          return;
        }

        const finished =
          local === 'finished' || remote === 'FINISHED' || ['validating', 'storing_artifact', 'ready'].includes(String(session?.pipeline_status || ''));

        // Prefer complete_run once Cursor reports FINISHED (or local finished).
        if (remote === 'FINISHED' || local === 'finished') {
          const done = await completeRun(activeRun.runId);
          if (cancelled) return;
          if (done.pending) return;
          if (done.ok && done.version_id) {
            setActiveRun(null);
            setLocalError(null);
            await qc.invalidateQueries({ queryKey: STATUS_KEY });
            // Preview URL refreshed via draft effect below
            return;
          }
          if (!done.ok && !done.pending) {
            setActiveRun(null);
            setLocalError(mapGatewayError(done.error || done.error_category).message);
            await qc.invalidateQueries({ queryKey: STATUS_KEY });
          }
        } else if (finished && session?.pipeline_status === 'ready') {
          setActiveRun(null);
          await qc.invalidateQueries({ queryKey: STATUS_KEY });
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof CursorGatewayError && e.code === 'not_found') {
          setActiveRun(null);
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeRun, enabled, qc, session?.pipeline_status]);

  // Keep previous preview URL until a new ready version is available
  useEffect(() => {
    if (!draftId || !enabled) return;
    if (draftId === lastDraftRef.current && previewUrl) return;
    // While a follow-up is running, do not swap iframe yet
    if (activeRun && previewUrl && draftId === lastDraftRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const tok = await getPreviewToken(draftId, 300);
        if (cancelled) return;
        if (tok.preview_url) {
          // Only advance iframe when version changes (or first load)
          if (draftId !== previewVersionId || !previewUrl) {
            setPreviewUrl(tok.preview_url);
            setPreviewVersionId(draftId);
            lastDraftRef.current = draftId;
          } else if (draftId !== lastDraftRef.current) {
            setPreviewUrl(tok.preview_url);
            setPreviewVersionId(draftId);
            lastDraftRef.current = draftId;
          }
        }
      } catch {
        /* keep previous preview */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, enabled, activeRun, previewUrl, previewVersionId]);

  // When run completes and draft advances, refresh preview
  useEffect(() => {
    if (!draftId || activeRun) return;
    if (draftId === lastDraftRef.current && previewVersionId === draftId) return;
    let cancelled = false;
    (async () => {
      try {
        const tok = await getPreviewToken(draftId, 300);
        if (cancelled || !tok.preview_url) return;
        setPreviewUrl(tok.preview_url);
        setPreviewVersionId(draftId);
        lastDraftRef.current = draftId;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, activeRun, previewVersionId]);

  const refreshPreview = useCallback(async () => {
    const id = previewVersionId || draftId;
    if (!id) return;
    const tok = await getPreviewToken(id, 300);
    if (tok.preview_url) {
      // Cache-bust same version reload
      const url = tok.preview_url.includes('?')
        ? `${tok.preview_url}&_=${Date.now()}`
        : `${tok.preview_url}?_=${Date.now()}`;
      setPreviewUrl(url);
      setPreviewVersionId(id);
    }
  }, [previewVersionId, draftId]);

  const sendPrompt = useCallback(
    async (promptRaw: string) => {
      const prompt = promptRaw.trim();
      if (!prompt || sendLock.current || sending || activeRun) return;
      if (entitlement?.exhausted || entitlement?.available === false) {
        setLocalError(
          mapGatewayError(
            entitlement?.exhausted ? 'ai_budget_exhausted' : 'ai_entitlement_disabled',
          ).message,
        );
        return;
      }
      sendLock.current = true;
      setSending(true);
      setLocalError(null);

      try {
        const isFollowup = Boolean(session?.has_agent || draftId);
        const key = newIdempotencyKey(isFollowup ? 'fu' : 'init');

        if (isFollowup && session?.needs_design_sync) {
          const sha =
            session.runtime_commit_sha ||
            (typeof import.meta !== 'undefined' &&
            import.meta.env?.VITE_CURSOR_RUNTIME_SHA
              ? String(import.meta.env.VITE_CURSOR_RUNTIME_SHA)
              : '');
          if (!sha) {
            // Still try followup — gateway returns needs_reseed with sha
            try {
              await followupEdit({ prompt, idempotency_key: key });
            } catch (e) {
              if (e instanceof CursorGatewayError && e.payload.needs_reseed) {
                const reseedSha = String(e.payload.runtime_commit_sha || '');
                if (!reseedSha) throw e;
                await createReplacementSession({
                  runtime_commit_sha: reseedSha,
                  replacement_reason: 'design_sync',
                  force: true,
                });
                const started = await startGeneration({
                  prompt,
                  idempotency_key: newIdempotencyKey('resync'),
                });
                setActiveRun({
                  runId: started.run_id,
                  runType: 'initial',
                  prompt,
                });
                await qc.invalidateQueries({ queryKey: STATUS_KEY });
                return;
              }
              throw e;
            }
          } else {
            await createReplacementSession({
              runtime_commit_sha: sha,
              replacement_reason: 'design_sync',
              force: true,
            });
            const started = await startGeneration({
              prompt,
              idempotency_key: newIdempotencyKey('resync'),
            });
            setActiveRun({ runId: started.run_id, runType: 'initial', prompt });
            await qc.invalidateQueries({ queryKey: STATUS_KEY });
            return;
          }
        }

        if (isFollowup && session?.has_agent && !session.needs_design_sync) {
          try {
            const started = await followupEdit({ prompt, idempotency_key: key });
            setActiveRun({
              runId: started.run_id,
              runType: 'followup',
              prompt,
            });
          } catch (e) {
            if (e instanceof CursorGatewayError && e.code === 'run_already_active') {
              const rid = String(e.payload.active_run_id || e.payload.run_id || '');
              if (rid) {
                setActiveRun({ runId: rid, runType: 'followup', prompt });
                return;
              }
            }
            if (e instanceof CursorGatewayError && e.payload.needs_reseed) {
              const reseedSha = String(e.payload.runtime_commit_sha || session.runtime_commit_sha || '');
              if (!reseedSha) throw e;
              await createReplacementSession({
                runtime_commit_sha: reseedSha,
                replacement_reason: 'design_sync',
                force: true,
              });
              const started = await startGeneration({
                prompt,
                idempotency_key: newIdempotencyKey('resync'),
              });
              setActiveRun({ runId: started.run_id, runType: 'initial', prompt });
              await qc.invalidateQueries({ queryKey: STATUS_KEY });
              return;
            }
            throw e;
          }
        } else {
          try {
            const started = await startGeneration({ prompt, idempotency_key: key });
            setActiveRun({
              runId: started.run_id,
              runType: 'initial',
              prompt,
            });
          } catch (e) {
            if (e instanceof CursorGatewayError && e.code === 'run_already_active') {
              const rid = String(e.payload.active_run_id || e.payload.run_id || '');
              if (rid) {
                setActiveRun({ runId: rid, runType: 'initial', prompt });
                return;
              }
            }
            throw e;
          }
        }
        await qc.invalidateQueries({ queryKey: STATUS_KEY });
      } catch (e) {
        const msg =
          e instanceof CursorGatewayError
            ? e.message
            : e instanceof Error
              ? e.message
              : mapGatewayError('unknown').message;
        setLocalError(msg);
      } finally {
        sendLock.current = false;
        setSending(false);
      }
    },
    [sending, activeRun, session, draftId, qc, entitlement],
  );

  const cancel = useCallback(async () => {
    const runId = activeRun?.runId || session?.active_run_id;
    if (!runId) return;
    try {
      await cancelRun(runId);
      setLocalError(mapGatewayError('cancelled').message);
    } catch {
      setLocalError(mapGatewayError('cancel_failed').message);
    }
    setActiveRun(null);
    await qc.invalidateQueries({ queryKey: STATUS_KEY });
  }, [activeRun, session?.active_run_id, qc]);

  const restore = useCallback(
    async (versionId: string) => {
      setLocalError(null);
      try {
        await restoreVersion(versionId);
        lastDraftRef.current = null; // force preview refresh to restored version
        await qc.invalidateQueries({ queryKey: STATUS_KEY });
        const tok = await getPreviewToken(versionId, 300);
        if (tok.preview_url) {
          setPreviewUrl(tok.preview_url);
          setPreviewVersionId(versionId);
          lastDraftRef.current = versionId;
        }
      } catch (e) {
        setLocalError(
          e instanceof CursorGatewayError ? e.message : 'Could not restore version.',
        );
      }
    },
    [qc],
  );

  /** Preview an older version without changing the draft pointer. */
  const previewVersion = useCallback(async (versionId: string) => {
    setLocalError(null);
    try {
      const tok = await getPreviewToken(versionId, 300);
      if (tok.preview_url) {
        setPreviewUrl(tok.preview_url);
        setPreviewVersionId(versionId);
      }
    } catch (e) {
      setLocalError(
        e instanceof CursorGatewayError ? e.message : 'Could not load that version.',
      );
    }
  }, []);

  const backToCurrentDraft = useCallback(async () => {
    if (!draftId) return;
    setLocalError(null);
    try {
      const tok = await getPreviewToken(draftId, 300);
      if (tok.preview_url) {
        setPreviewUrl(tok.preview_url);
        setPreviewVersionId(draftId);
        lastDraftRef.current = draftId;
      }
    } catch {
      /* keep current preview */
    }
  }, [draftId]);

  const busy = sending || Boolean(activeRun) || Boolean(session?.active_run_id);
  const viewingOlder =
    Boolean(previewVersionId) && Boolean(draftId) && previewVersionId !== draftId;

  /**
   * Explicit Start over: create replacement session/agent.
   * Previous versions are retained; new draft only after a successful generation.
   */
  const startOver = useCallback(async () => {
    if (busy || sendLock.current) return;
    const sha =
      session?.runtime_commit_sha ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CURSOR_RUNTIME_SHA
        ? String(import.meta.env.VITE_CURSOR_RUNTIME_SHA)
        : '');
    if (!sha) {
      setLocalError('Cannot start over — runtime revision unknown. Refresh and try again.');
      return;
    }
    setLocalError(null);
    setSending(true);
    try {
      await createReplacementSession({
        runtime_commit_sha: sha,
        replacement_reason: 'start_over',
        force: true,
      });
      setActiveRun(null);
      setPreviewUrl(null);
      setPreviewVersionId(null);
      lastDraftRef.current = null;
      await qc.invalidateQueries({ queryKey: STATUS_KEY });
    } catch (e) {
      setLocalError(
        e instanceof CursorGatewayError ? e.message : 'Could not start over safely.',
      );
    } finally {
      setSending(false);
    }
  }, [busy, session?.runtime_commit_sha, qc]);

  const labeledVersions = versions.map((v) => ({
    ...v,
    display_label:
      v.display_label ||
      deriveVersionLabel(v.prompt, {
        isInitial: !v.parent_version_id,
      }),
  }));

  return {
    status,
    session,
    conversation,
    versions: labeledVersions,
    productCount,
    entitlement,
    adminDebug: status?.admin_debug ?? null,
    viewMode,
    uiStage,
    busy,
    sending,
    activeRun,
    localError,
    previewUrl,
    previewVersionId: previewVersionId || draftId,
    device,
    setDevice,
    mobileTab,
    setMobileTab,
    viewingOlder,
    sendPrompt,
    cancel,
    restore,
    previewVersion,
    backToCurrentDraft,
    startOver,
    refreshPreview,
    refetchStatus: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
    isLoading: statusQuery.isLoading,
    isFetching: statusQuery.isFetching,
  };
}
