import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fontHref } from '@/lib/ai-studio/spec';
import type { BrandDesignSystem, DesignSpec } from '@/lib/ai-studio/v2/designSpec';
import { brandDesignSystemFromSpec } from '@/lib/ai-studio/v2/designSpec';
import { PHASE3_BRIEFS, type Phase3BriefId } from '@/lib/ai-studio/v2/phase3Briefs';
import { SHOWCASE_CATALOGS } from '@/lib/ai-studio/v2/showcaseData';
import {
  streamV2Generate,
  V2_STATUS_LABELS,
  type V2GenerationMeta,
  type V2StreamEvent,
} from '@/lib/ai-studio/v2/generateClient';
import {
  streamV2Critique,
  persistV2DraftDocument,
  type CritiqueStreamEvent,
} from '@/lib/ai-studio/v2/critiqueClient';
import {
  meetsCritiqueStopThreshold,
  CRITIQUE_STOP_THRESHOLD,
  type CritiqueScoreCard,
} from '@/lib/ai-studio/v2/critiqueScoreCard';
import { hashRenderRelevantSiteTree } from '@/lib/ai-studio/v2/expectedRenderManifest';
import { applySiteOps, type SiteOps } from '@/lib/ai-studio/v2/siteOps';
import { validateSiteOpsAgainstDocument } from '@/lib/ai-studio/v2/validateSiteOps';
import {
  captureDesktopAndMobile,
  type CapturedScreenshot,
} from '@/lib/ai-studio/v2/screenshot';
import {
  CRITIC_FAULT_FIXTURES,
  faultFixtureById,
  type CriticFaultId,
} from '@/lib/ai-studio/v2/criticFaultFixtures';
import {
  evaluateFaultAcceptance,
  type FaultAcceptanceResult,
} from '@/lib/ai-studio/v2/evaluateFaultAcceptance';
import { brandTokensToCssVars } from '@/lib/ai-studio/v2/tokens';
import type { AssetPlan } from '@/lib/ai-studio/v2/assetResolver';
import { auditCopyFallbacks } from '@/lib/ai-studio/v2/copyFallbackAudit';
import type { SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import { validateSiteTree } from '@/lib/ai-studio/v2/validateSiteTree';
import SiteTreeRenderer from '@/components/templates/ai/v2/SiteTreeRenderer';
import { useShowcaseCommerce } from './useShowcaseCommerce';
import '@/components/templates/premium/premium.css';
import '@/components/templates/ai/v2/v2.css';
import './generate-lab.css';
import './critic-faults.css';

type Tab = 'preview' | 'designSpec' | 'siteTree' | 'critique' | 'meta';

type CritiqueCycleRecord = {
  cycle: number;
  beforeScore: number | null;
  afterScore: number | null;
  beforeDistinctiveness: number | null;
  afterDistinctiveness: number | null;
  decision: string;
  opsCount: number;
  costUsd?: number;
  latencyMs?: number;
  scorecard?: CritiqueScoreCard;
  ops?: SiteOps;
  stopReason?: string;
  calibrationNotes?: string[];
  screenshotMetas?: Array<Record<string, unknown>>;
  faultId?: CriticFaultId;
  faultAcceptance?: FaultAcceptanceResult;
};

type ShotDebug = {
  desktop: CapturedScreenshot;
  mobile: CapturedScreenshot;
  faultId: CriticFaultId;
};

function JsonPanel({ value }: { value: unknown }) {
  return <pre className="v2gen-json">{JSON.stringify(value, null, 2)}</pre>;
}

export default function AiStudioV2GenerateLab() {
  const previewRef = useRef<HTMLDivElement>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [briefId, setBriefId] = useState<Phase3BriefId>('test1_luxury_fashion');
  const [tab, setTab] = useState<Tab>('preview');
  const [status, setStatus] = useState('idle');
  const [statusStep, setStatusStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [designSpec, setDesignSpec] = useState<DesignSpec | null>(null);
  const [siteDocument, setSiteDocument] = useState<SiteDocument | null>(null);
  const [brandSystem, setBrandSystem] = useState<BrandDesignSystem | null>(null);
  const [generationMeta, setGenerationMeta] = useState<V2GenerationMeta | null>(null);
  const [llm, setLlm] = useState('');
  const [scorecard, setScorecard] = useState<CritiqueScoreCard | null>(null);
  const [critiqueHistory, setCritiqueHistory] = useState<CritiqueCycleRecord[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [faultId, setFaultId] = useState<CriticFaultId>('none');
  const [shotDebug, setShotDebug] = useState<ShotDebug | null>(null);
  const [calibrationNotes, setCalibrationNotes] = useState<string[]>([]);
  const [faultAcceptance, setFaultAcceptance] = useState<FaultAcceptanceResult | null>(null);
  const [assetPlan, setAssetPlan] = useState<AssetPlan | null>(null);
  /** Which brief produced the generation currently on screen. */
  const [resultBriefId, setResultBriefId] = useState<Phase3BriefId | null>(null);

  const copyAudit = useMemo(
    () => (siteDocument ? auditCopyFallbacks(siteDocument) : null),
    [siteDocument]
  );

  const brief = PHASE3_BRIEFS.find((b) => b.id === briefId)!;
  const resultBrief = resultBriefId ? PHASE3_BRIEFS.find((b) => b.id === resultBriefId)! : null;
  const briefOutOfSync = Boolean(resultBrief) && resultBriefId !== briefId;
  /**
   * The preview renders the generation that exists, so its catalog must follow the brief
   * that produced it — not the dropdown. Otherwise switching briefs silently repaints the
   * previous generation with another brand's products.
   */
  const catalog = SHOWCASE_CATALOGS[(resultBrief ?? brief).previewCatalogId];
  const commerce = useShowcaseCommerce(catalog);
  const fault = faultFixtureById(faultId);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(Boolean(session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!brandSystem) return;
    const id = 'ai-v2-gen-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = fontHref(
      brandSystem.tokens.headingFont as never,
      brandSystem.tokens.bodyFont as never
    );
  }, [brandSystem]);

  const resolvedBrand = useMemo(() => {
    if (brandSystem) return brandSystem;
    if (designSpec) return brandDesignSystemFromSpec(designSpec);
    return null;
  }, [brandSystem, designSpec]);

  const validation = useMemo(() => {
    if (!siteDocument) return null;
    return validateSiteTree(siteDocument);
  }, [siteDocument]);

  const runGenerate = useCallback(async () => {
    // Pin the brief for this run: the result must be attributable to the brief that produced it.
    const runBrief = brief;
    if (import.meta.env.DEV) {
      console.log('[GenerateLab] selectedBriefId =', runBrief.id);
      console.log('[GenerateLab] selected previewCatalogId =', runBrief.previewCatalogId);
      console.log('[GenerateLab] sending prompt =', `${runBrief.prompt.slice(0, 120)}…`);
    }

    setGenerating(true);
    setError(null);
    setStatus('generating');
    setDesignSpec(null);
    setSiteDocument(null);
    setBrandSystem(null);
    setGenerationMeta(null);
    setResultBriefId(null);
    setAssetPlan(null);
    setScorecard(null);
    setCritiqueHistory([]);
    setScorecard(null);
    setCalibrationNotes([]);
    setFaultAcceptance(null);
    setShotDebug(null);
    setShotDebug(null);
    setCalibrationNotes([]);
    setLlm('');

    const started = Date.now();
    try {
      const last = await streamV2Generate(runBrief.prompt, (event, data: V2StreamEvent) => {
        if (data.step) {
          setStatusStep(data.step);
          setStatus(data.message || V2_STATUS_LABELS[data.step] || data.step);
        }
        if (data.validationRetry) {
          setStatus(data.message || 'Retrying design direction with constrained format…');
        }
        if (data.designSpec) setDesignSpec(data.designSpec as DesignSpec);
        if (data.brandSystem) setBrandSystem(data.brandSystem as BrandDesignSystem);
        if (data.document) setSiteDocument(data.document as SiteDocument);
        if (data.generationMeta) setGenerationMeta(data.generationMeta as V2GenerationMeta);
        if (data.llm) setLlm(data.llm);
        if (data.conversationId) setConversationId(data.conversationId);
        if (event === 'error' || data.error) {
          setError(data.message || data.error || 'Generation failed');
        }
      });

      const elapsed = Date.now() - started;
      if (last.designSpec) setDesignSpec(last.designSpec as DesignSpec);
      if (last.document) setSiteDocument(last.document as SiteDocument);
      if (last.brandSystem) setBrandSystem(last.brandSystem as BrandDesignSystem);
      if (last.generationMeta) setGenerationMeta(last.generationMeta as V2GenerationMeta);
      if (last.llm) setLlm(last.llm);
      if (last.conversationId) setConversationId(last.conversationId);
      setResultBriefId(runBrief.id);
      if (import.meta.env.DEV) {
        const spec = last.designSpec as DesignSpec | undefined;
        console.log('[GenerateLab] generation returned storeName =', spec?.brand?.storeName);
        console.log('[GenerateLab] generation returned archetype =', spec?.artDirection?.archetype);
        console.log('[GenerateLab] generation returned creativeStrategy =', spec?.creativeStrategy);
      }
      setStatus(`Generated in ${(elapsed / 1000).toFixed(1)}s — use Refine visually when ready`);
      setTab('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('failed');
    } finally {
      setGenerating(false);
    }
  }, [brief]);

  const runRefineVisually = useCallback(async () => {
    if (!designSpec || !siteDocument || !resolvedBrand || !previewRef.current) {
      setError('Generate a storefront first, then open the Preview tab.');
      return;
    }

    setRefining(true);
    setError(null);
    setTab('preview');

    let workingDoc = siteDocument;
    let previousScorecard: CritiqueScoreCard | null = scorecard;
    const history: CritiqueCycleRecord[] = [...critiqueHistory];
    const lastValidDoc = siteDocument;
    const activeFault = faultId;
    const calibrationMode = activeFault !== 'none';

    try {
      for (let cycle = 1; cycle <= CRITIQUE_STOP_THRESHOLD.maxCycles; cycle += 1) {
        setStatusStep('capturing');
        setStatus(`Cycle ${cycle}: capturing desktop + mobile…`);

        await new Promise((r) => setTimeout(r, 280));
        if (!previewRef.current) throw new Error('Preview element missing for screenshot');

        let screenshots: { desktop: CapturedScreenshot; mobile: CapturedScreenshot };
        try {
          screenshots = await captureDesktopAndMobile(previewRef.current);
        } catch (captureErr) {
          setError(
            `Screenshot capture failed — keeping last valid draft. ${
              captureErr instanceof Error ? captureErr.message : String(captureErr)
            }`
          );
          setStatus('capture failed');
          setSiteDocument(lastValidDoc);
          return;
        }

        setShotDebug({
          desktop: screenshots.desktop,
          mobile: screenshots.mobile,
          faultId: activeFault,
        });

        setStatusStep('critiquing');
        setStatus(`Cycle ${cycle}: visual critic reviewing pixels…`);

        const beforeScore = previousScorecard?.overall.score ?? null;
        const beforeDistinct = previousScorecard?.distinctiveness.score ?? null;
        const beforeHash = hashRenderRelevantSiteTree(workingDoc);

        let last: CritiqueStreamEvent;
        try {
          last = await streamV2Critique(
            {
              designSpec,
              document: workingDoc,
              brandSystem: resolvedBrand,
              screenshots: [screenshots.desktop, screenshots.mobile],
              cycle,
              previousScorecard,
              conversationId,
            },
            (event, data) => {
              if (data.message) setStatus(data.message);
              if (data.step) setStatusStep(data.step);
              if (data.scorecard) setScorecard(data.scorecard);
              if (data.calibrationNotes) setCalibrationNotes(data.calibrationNotes);
              if (data.llm) setLlm(data.llm);
              if (event === 'error' || data.error) {
                setError(data.message || data.error || 'Critique failed');
              }
            }
          );
        } catch (critiqueErr) {
          setError(
            `Visual critic failed — keeping last valid draft. ${
              critiqueErr instanceof Error ? critiqueErr.message : String(critiqueErr)
            }`
          );
          setStatus('critique failed');
          setSiteDocument(workingDoc);
          return;
        }

        if (!last.scorecard) {
          setError('Critic returned no scorecard — keeping last valid draft.');
          return;
        }

        const card = last.scorecard;
        setScorecard(card);
        if (last.calibrationNotes) setCalibrationNotes(last.calibrationNotes);

        let acceptance: FaultAcceptanceResult | undefined;
        if (calibrationMode) {
          acceptance = evaluateFaultAcceptance(activeFault, card);
          setFaultAcceptance(acceptance);
        } else {
          setFaultAcceptance(null);
        }

        const afterScore = card.overall.score;
        const afterDistinct = card.distinctiveness.score;

        let appliedOps: SiteOps = [];
        let stopReason =
          (calibrationMode ? 'calibration_fault_fixture' : last.stopReason) || undefined;
        let treeChanged = false;

        // Mandatory: limited_by_registry / pass / edge stop with no_safe_ops → no further cycles
        const edgeSaysStop =
          Boolean(last.stop) ||
          card.decision === 'pass' ||
          card.decision === 'limited_by_registry' ||
          last.stopReason === 'no_safe_ops' ||
          last.stopReason === 'limited_by_registry' ||
          last.stopReason === 'critic_pass' ||
          last.stopReason === 'threshold_met';

        if (!calibrationMode && last.ops?.length) {
          const validated = validateSiteOpsAgainstDocument(workingDoc, last.ops);
          appliedOps = validated.ops;

          if (
            previousScorecard &&
            beforeDistinct != null &&
            afterDistinct < beforeDistinct - 1.4 &&
            (beforeScore == null || afterScore - beforeScore < 1)
          ) {
            setStatus(
              `Cycle ${cycle}: skipped SiteOps — would reduce distinctiveness without enough quality gain`
            );
            history.push({
              cycle,
              beforeScore,
              afterScore,
              beforeDistinctiveness: beforeDistinct,
              afterDistinctiveness: afterDistinct,
              decision: card.decision,
              opsCount: 0,
              costUsd: last.costUsd,
              latencyMs: last.latencyMs,
              scorecard: card,
              ops: [],
              stopReason: 'distinctiveness_guard',
              calibrationNotes: last.calibrationNotes,
              screenshotMetas: last.screenshotMetas,
              faultId: activeFault,
            });
            setCritiqueHistory([...history]);
            previousScorecard = card;
            break;
          }

          if (appliedOps.length) {
            try {
              const next = applySiteOps(workingDoc, appliedOps);
              const treeCheck = validateSiteTree(next);
              if (!treeCheck.ok || !treeCheck.document) {
                throw new Error(
                  treeCheck.issues.map((i) => i.message).join('; ') || 'invalid tree'
                );
              }
              const afterHash = hashRenderRelevantSiteTree(treeCheck.document);
              if (afterHash === beforeHash) {
                stopReason = 'no_render_affecting_change';
                appliedOps = [];
                setStatus(
                  `Cycle ${cycle}: SiteOps produced no render-affecting SiteTree change — stopping`
                );
              } else {
                treeChanged = true;
                workingDoc = treeCheck.document;
                setSiteDocument(workingDoc);
                try {
                  await persistV2DraftDocument(workingDoc);
                } catch {
                  /* non-fatal in lab */
                }
                await new Promise((r) => setTimeout(r, 400));
              }
            } catch (applyErr) {
              setError(
                `SiteOps apply failed — keeping last valid draft. ${
                  applyErr instanceof Error ? applyErr.message : String(applyErr)
                }`
              );
              setSiteDocument(workingDoc);
              return;
            }
          }
        }

        if (!calibrationMode && !treeChanged) {
          // Zero validated/applied ops OR hash unchanged → mandatory stop
          if (!stopReason || stopReason === 'continue') {
            stopReason =
              card.decision === 'limited_by_registry'
                ? 'limited_by_registry'
                : appliedOps.length === 0
                  ? 'no_safe_ops'
                  : 'no_render_affecting_change';
          }
        }

        history.push({
          cycle,
          beforeScore,
          afterScore,
          beforeDistinctiveness: beforeDistinct,
          afterDistinctiveness: afterDistinct,
          decision: card.decision,
          opsCount: appliedOps.length,
          costUsd: last.costUsd,
          latencyMs: last.latencyMs,
          scorecard: card,
          ops: appliedOps,
          stopReason,
          calibrationNotes: last.calibrationNotes,
          screenshotMetas: last.screenshotMetas,
          faultId: activeFault,
          faultAcceptance: acceptance,
        });
        setCritiqueHistory([...history]);
        previousScorecard = card;

        const shouldStopLoop =
          calibrationMode ||
          edgeSaysStop ||
          !treeChanged ||
          meetsCritiqueStopThreshold(card) ||
          stopReason === 'no_safe_ops' ||
          stopReason === 'no_render_affecting_change' ||
          stopReason === 'limited_by_registry' ||
          stopReason === 'distinctiveness_guard';

        if (shouldStopLoop) {
          setStatus(
            calibrationMode
              ? `Calibration fault "${activeFault}" → overall ${afterScore}, decision ${card.decision}${
                  acceptance
                    ? ` · harness ${acceptance.passed ? 'PASS' : 'FAIL'}`
                    : ''
                }`
              : `Refine stopped after ${cycle} cycle(s) — overall ${afterScore}, stopReason=${stopReason || 'done'}`
          );
          setTab('critique');
          break;
        }

        // Cycle N+1 only if cycle N applied real render-affecting SiteOps
        if (cycle === CRITIQUE_STOP_THRESHOLD.maxCycles) {
          setStatus(`Max ${CRITIQUE_STOP_THRESHOLD.maxCycles} cycles reached`);
          setTab('critique');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('refine failed');
      setSiteDocument(lastValidDoc);
    } finally {
      setRefining(false);
    }
  }, [
    designSpec,
    siteDocument,
    resolvedBrand,
    scorecard,
    critiqueHistory,
    conversationId,
    faultId,
  ]);

  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  if (signedIn === null) {
    return (
      <div className="v2gen-page">
        <h1>AI Studio V2 — Generate Lab</h1>
        <p className="v2gen-sub">Loading session…</p>
      </div>
    );
  }

  if (signedIn === false) {
    return (
      <div className="v2gen-page">
        <h1>AI Studio V2 — Generate Lab</h1>
        <p className="v2gen-warn">
          Sign in to run V2 generation (uses your Supabase session + edge function).
        </p>
      </div>
    );
  }

  const busy = generating || refining;
  const canRefine = Boolean(siteDocument && designSpec && resolvedBrand) && !busy;

  return (
    <div className="v2gen-page">
      <header className="v2gen-header">
        <div>
          <h1>AI Studio V2 — Generate Lab</h1>
          <p className="v2gen-sub">Phase 3 generate · Phase 4 critic calibration</p>
        </div>
        <div className="v2gen-actions">
          <a className="v2gen-link" href="/ai-studio-v2-showcase">
            Showcase
          </a>
          <select
            value={briefId}
            onChange={(e) => setBriefId(e.target.value as Phase3BriefId)}
            disabled={busy}
          >
            {PHASE3_BRIEFS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <button type="button" className="v2gen-btn" onClick={runGenerate} disabled={busy}>
            {generating ? 'Generating…' : 'Generate V2'}
          </button>
          <button
            type="button"
            className="v2gen-btn v2gen-btn-secondary"
            onClick={runRefineVisually}
            disabled={!canRefine}
          >
            {refining ? 'Critiquing…' : 'Refine visually'}
          </button>
        </div>
      </header>

      <section className="v2gen-brief">
        <h2>Brief — {brief.label}</h2>
        <p>{brief.prompt}</p>
        {briefOutOfSync && resultBrief ? (
          <p className="v2gen-warn">
            Nothing below has been regenerated yet. Preview, DesignSpec and Meta still belong to{' '}
            {resultBrief.label}, and the preview catalog stays pinned to it. Press Generate V2 to
            run {brief.label}.
          </p>
        ) : resultBrief ? (
          <p className="v2gen-meta">Showing the {resultBrief.label} generation.</p>
        ) : null}
      </section>

      <div className="v2gen-fault-bar">
        <label htmlFor="v2-fault">DEV critic fault fixture</label>
        <select
          id="v2-fault"
          value={faultId}
          onChange={(e) => setFaultId(e.target.value as CriticFaultId)}
          disabled={busy}
        >
          {CRITIC_FAULT_FIXTURES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        {fault.expectedCriticSignals.length ? (
          <p className="v2gen-fault-hint">
            Expect signals: {fault.expectedCriticSignals.join(', ')}. A 9–10 PASS means
            calibration failed.
          </p>
        ) : (
          <p className="v2gen-fault-hint">
            No fault — live render. Screenshot debug preview appears after capture.
          </p>
        )}
      </div>

      <section className="v2gen-status">
        <span className={`v2gen-pill ${busy ? 'active' : ''}`}>{statusStep || '—'}</span>
        <span>{status}</span>
        {llm ? <span className="v2gen-meta">Models: {llm}</span> : null}
        {scorecard ? (
          <span className="v2gen-meta">
            Score {scorecard.overall.score} · Distinct {scorecard.distinctiveness.score} ·{' '}
            {scorecard.decision}
          </span>
        ) : null}
        {calibrationNotes.length ? (
          <p className="v2gen-warn">Calibration guards: {calibrationNotes.join(' · ')}</p>
        ) : null}
        {faultAcceptance ? (
          <p className={faultAcceptance.passed ? 'v2gen-meta' : 'v2gen-warn'}>
            Fault harness {faultAcceptance.passed ? 'PASS' : 'FAIL'}:{' '}
            {faultAcceptance.checks.map((c) => `${c.name}=${c.ok ? 'ok' : 'no'}`).join(' · ')}
          </p>
        ) : null}
        {generationMeta?.contentProvenanceWarnings?.length ? (
          <p className="v2gen-warn">
            Content provenance: {generationMeta.contentProvenanceWarnings.length} flagged
            claim(s) — see Meta tab.
          </p>
        ) : null}
        {validation && !validation.ok ? (
          <p className="v2gen-error">SiteTree validation failed — preview may be incomplete.</p>
        ) : null}
        {error ? <p className="v2gen-error">{error}</p> : null}
      </section>

      {shotDebug ? (
        <section className="v2gen-shot-debug">
          <h3>Critic input screenshots (ephemeral DEV preview — exact bytes sent)</h3>
          <figure>
            <img src={shotDebug.desktop.dataUrl} alt="Desktop screenshot submitted to critic" />
            <figcaption>
              desktop {shotDebug.desktop.meta.widthPx}×{shotDebug.desktop.meta.heightPx} · ~
              {shotDebug.desktop.meta.approxBytes}B · {shotDebug.desktop.meta.mimeType}
              {shotDebug.faultId !== 'none' ? ` · fault=${shotDebug.faultId}` : ''}
            </figcaption>
          </figure>
          <figure>
            <img src={shotDebug.mobile.dataUrl} alt="Mobile screenshot submitted to critic" />
            <figcaption>
              mobile {shotDebug.mobile.meta.widthPx}×{shotDebug.mobile.meta.heightPx} · ~
              {shotDebug.mobile.meta.approxBytes}B · {shotDebug.mobile.meta.mimeType}
            </figcaption>
          </figure>
        </section>
      ) : null}

      <nav className="v2gen-tabs">
        {(['preview', 'designSpec', 'siteTree', 'critique', 'meta'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t === 'designSpec'
              ? 'DesignSpec'
              : t === 'siteTree'
                ? 'SiteTree'
                : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="v2gen-panel">
        <div
          className="v2gen-preview-host"
          style={{ display: tab === 'preview' ? 'block' : 'none' }}
        >
          {!siteDocument || !resolvedBrand ? (
            <p className="v2gen-empty">Generate to see the rendered storefront.</p>
          ) : (
            <div
              ref={previewRef}
              className={`v2gen-preview ai-v2-root ${fault.className}`.trim()}
              style={brandTokensToCssVars(resolvedBrand)}
              data-density={resolvedBrand.tokens.density}
              data-fault={faultId}
            >
              <SiteTreeRenderer
                document={siteDocument}
                brand={resolvedBrand}
                commerce={commerce}
                onAssetPlan={setAssetPlan}
              />
            </div>
          )}
        </div>

        {tab === 'designSpec' &&
          (designSpec ? (
            <JsonPanel value={designSpec} />
          ) : (
            <p className="v2gen-empty">No DesignSpec yet.</p>
          ))}

        {tab === 'siteTree' &&
          (siteDocument ? (
            <JsonPanel value={siteDocument} />
          ) : (
            <p className="v2gen-empty">No SiteTree yet.</p>
          ))}

        {tab === 'critique' &&
          (scorecard || critiqueHistory.length ? (
            <JsonPanel
              value={{
                stopThreshold: CRITIQUE_STOP_THRESHOLD,
                latestScorecard: scorecard,
                calibrationNotes,
                shotMeta: shotDebug
                  ? {
                      desktop: shotDebug.desktop.meta,
                      mobile: shotDebug.mobile.meta,
                      faultId: shotDebug.faultId,
                    }
                  : null,
                faultAcceptance,
                cycles: critiqueHistory.map((c) => ({
                  cycle: c.cycle,
                  faultId: c.faultId,
                  decision: c.decision,
                  beforeScore: c.beforeScore,
                  afterScore: c.afterScore,
                  beforeDistinctiveness: c.beforeDistinctiveness,
                  afterDistinctiveness: c.afterDistinctiveness,
                  opsCount: c.opsCount,
                  costUsd: c.costUsd,
                  latencyMs: c.latencyMs,
                  stopReason: c.stopReason,
                  calibrationNotes: c.calibrationNotes,
                  screenshotMetas: c.screenshotMetas,
                  faultAcceptance: c.faultAcceptance,
                  ops: c.ops,
                  scorecard: c.scorecard,
                })),
              }}
            />
          ) : (
            <p className="v2gen-empty">
              Run Refine visually after generation to see critique cycles.
            </p>
          ))}

        {tab === 'meta' &&
          (generationMeta || designSpec || critiqueHistory.length ? (
            <JsonPanel
              value={{
                brief: {
                  selectedBriefId: briefId,
                  generatedBriefId: resultBriefId,
                  outOfSync: briefOutOfSync,
                  previewCatalogId: (resultBrief ?? brief).previewCatalogId,
                  sentPromptHead: resultBrief ? `${resultBrief.prompt.slice(0, 100)}…` : null,
                  returnedStoreName: designSpec?.brand?.storeName,
                },
                creativeMode: designSpec?.creativeMode,
                creativeStrategy: designSpec?.creativeStrategy,
                silhouettePlan: generationMeta?.silhouettePlan,
                architectureFingerprint: generationMeta?.architectureFingerprint,
                architectureNotes: generationMeta?.architectureNotes,
                assetSummary: assetPlan?.summary,
                copyFallbacks: copyAudit,
                costUsd: generationMeta?.tasks?.reduce((s, t) => s + (t.costUsd || 0), 0),
                totalLatencyMs: generationMeta?.totalLatencyMs,
                generation: generationMeta,
                critiqueCycles: critiqueHistory,
              }}
            />
          ) : (
            <p className="v2gen-empty">Generation metadata appears after a successful run.</p>
          ))}
      </div>

      {designSpec?.designIntent?.coreConcept ? (
        <section className="v2gen-intent">
          <h3>Design intent</h3>
          <p>{designSpec.designIntent.coreConcept}</p>
        </section>
      ) : null}
      {designSpec?.creativeStrategy ? (
        <section className="v2gen-intent">
          <h3>Creative strategy (Phase 5A)</h3>
          <p>
            {designSpec.creativeStrategy.pageComposition} · hero {designSpec.creativeStrategy.heroPhilosophy} ·
            commerce {designSpec.creativeStrategy.commerceEntry}/{designSpec.creativeStrategy.commerceModel} ·
            rhythm {designSpec.creativeStrategy.rhythm} · density {designSpec.creativeStrategy.density} ·
            type {designSpec.creativeStrategy.typographyRole} · image {designSpec.creativeStrategy.imageryRole}
          </p>
          <p className="v2gen-muted">{designSpec.creativeStrategy.distinctivenessBrief}</p>
          {generationMeta?.architectureFingerprint ? (
            <pre className="v2gen-json" style={{ maxHeight: 220, overflow: 'auto' }}>
              {JSON.stringify(
                {
                  silhouettePlan: generationMeta.silhouettePlan,
                  fingerprint: generationMeta.architectureFingerprint,
                },
                null,
                2
              )}
            </pre>
          ) : (
            <p className="v2gen-muted">
              No architectureFingerprint in generation meta.{' '}
              {generationMeta
                ? 'The edge function returned meta without a fingerprint — check validationWarnings for "architectureFingerprint skipped".'
                : 'No generationMeta received yet.'}
            </p>
          )}
        </section>
      ) : designSpec ? (
        <section className="v2gen-intent">
          <h3>Creative strategy (Phase 5A)</h3>
          <p className="v2gen-muted">
            DesignSpec has no creativeStrategy. The generation Edge Function is running pre-Phase-5A code —
            redeploy <code>ai-studio-generate</code>.
          </p>
        </section>
      ) : null}
      {assetPlan ? (
        <section className="v2gen-intent">
          <h3>Asset diagnostics (DEV)</h3>
          <p>
            {assetPlan.summary.uniqueImageCount} unique image
            {assetPlan.summary.uniqueImageCount === 1 ? '' : 's'} across{' '}
            {assetPlan.summary.singleImageSlotCount} single-image slot
            {assetPlan.summary.singleImageSlotCount === 1 ? '' : 's'} ·{' '}
            {assetPlan.summary.duplicateImageCount} repeat
            {assetPlan.summary.duplicateImageCount === 1 ? '' : 's'} ·{' '}
            {assetPlan.summary.fallbackImageCount} empty ·{' '}
            {assetPlan.summary.provenance.merchant} merchant / {assetPlan.summary.provenance.demo} demo /{' '}
            {assetPlan.summary.provenance.fallback} fallback
            {copyAudit ? ` · ${copyAudit.count} missing copy fields (${copyAudit.omittedCount} omitted, ${copyAudit.functionalCount} functional fallback)` : ''}
          </p>
          <pre className="v2gen-json" style={{ maxHeight: 260, overflow: 'auto' }}>
            {assetPlan.summary.nodes
              .filter((n) => n.slot !== 'none')
              .map((n) =>
                n.slot === 'multi'
                  ? `${n.nodeId} [${n.binding}] -> ${(n.productIds || []).join(', ') || '—'}`
                  : `${n.nodeId} -> ${n.productId || n.imageId || '—'} (${n.source}/${n.provenance ?? 'none'})`
              )
              .join('\n')}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
