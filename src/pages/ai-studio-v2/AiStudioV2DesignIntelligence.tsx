import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fontHref } from '@/lib/ai-studio/spec';
import {
  CANONICAL_STRATEGIES,
  NEUTRAL_BRAND,
  VIEWPORT_WIDTH_PX,
  planForDocument,
  type GrammarViewport,
  type LayoutPlan,
} from '@/lib/ai-studio/v2/layoutGrammar';
import GrammarRenderer, { grammarFontFamilies } from '@/components/templates/ai/v2/grammar/GrammarRenderer';
import {
  INTELLIGENCE_FIXTURE_IDS,
  buildDesignIntelligencePlan,
  catalogFromIntelligenceInput,
  documentFromIntelligence,
  fixtureById,
  intelligenceInputFromShowcase,
  type IntelligenceFixtureId,
} from '@/lib/ai-studio/v2/designIntelligence';
import { SHOWCASE_CATALOGS } from '@/lib/ai-studio/v2/showcaseData';
import { useIntelligenceCommerce } from './useIntelligenceCommerce';
import './design-intelligence.css';

const VIEWPORTS: GrammarViewport[] = ['desktop', 'tablet', 'mobile'];

function loadFonts(families: string[]) {
  const id = 'ai-v2-intel-fonts';
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const unique = [...new Set(families.filter(Boolean))];
  const [a, b] = [unique[0] || 'DM Sans', unique[1] || unique[0] || 'Manrope'];
  link.href = fontHref(a as never, b as never);
}

function Preview({
  fixtureId,
  assignment,
  viewport,
  onPlan,
}: {
  fixtureId: IntelligenceFixtureId | 'forma_audio_showcase';
  assignment: 'naive' | 'intelligent';
  viewport: GrammarViewport;
  onPlan?: (plan: LayoutPlan) => void;
}) {
  const input = useMemo(() => {
    if (fixtureId === 'forma_audio_showcase') {
      return intelligenceInputFromShowcase(SHOWCASE_CATALOGS.forma_audio, {
        merchant: {
          storeName: SHOWCASE_CATALOGS.forma_audio.storeName,
          tagline: SHOWCASE_CATALOGS.forma_audio.tagline,
          description: SHOWCASE_CATALOGS.forma_audio.tagline,
          featuredProductId: SHOWCASE_CATALOGS.forma_audio.products[0]?.id,
        },
      });
    }
    return fixtureById(fixtureId);
  }, [fixtureId]);

  const plan = useMemo(() => buildDesignIntelligencePlan(input), [input]);
  const catalog = useMemo(() => catalogFromIntelligenceInput(input), [input]);
  const documentTree = useMemo(() => documentFromIntelligence(input, plan), [input, plan]);
  const commerce = useIntelligenceCommerce(catalog);
  const grammarId = assignment === 'intelligent' ? plan.selectedGrammarId : 'product_monument';
  const brand = NEUTRAL_BRAND;
  const strategy = grammarId ? CANONICAL_STRATEGIES[grammarId] : null;

  useEffect(() => {
    if (!grammarId) return;
    loadFonts([...grammarFontFamilies(grammarId), brand.tokens.headingFont, brand.tokens.bodyFont]);
  }, [grammarId, brand.tokens.headingFont, brand.tokens.bodyFont]);

  return (
    <div className="di-preview-shell" data-viewport={viewport} data-assignment={assignment} data-outcome={plan.outcome}>
      <div
        className="di-preview-frame lg-capture"
        data-capture={`${fixtureId}__${assignment}__${viewport}`}
        style={{ width: VIEWPORT_WIDTH_PX[viewport], maxWidth: '100%' }}
      >
        {assignment === 'intelligent' && !grammarId ? (
          <div className="di-fallback-preview lg-root" data-fallback-preview="1" data-outcome={plan.outcome}>
            <p className="di-unknown-flag">I do not know which grammar to use.</p>
            <p>
              Outcome <strong>{plan.outcome}</strong> · fallback <strong>{plan.safeFallback}</strong>
            </p>
            <p>{plan.selectionReason}</p>
            {plan.clarificationRequests.length ? (
              <ul>
                {plan.clarificationRequests.map((q) => (
                  <li key={q.id}>{q.question}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <GrammarRenderer
            document={documentTree}
            brand={brand}
            commerce={commerce}
            grammarOverride={grammarId || 'product_monument'}
            strategy={strategy || CANONICAL_STRATEGIES.product_monument}
            seed="seed-a"
            viewport={viewport}
            intelligence={assignment === 'intelligent' ? plan : null}
            onPlan={onPlan}
          />
        )}
      </div>
    </div>
  );
}

function Panel({ fixtureId }: { fixtureId: IntelligenceFixtureId | 'forma_audio_showcase' }) {
  const input = useMemo(() => {
    if (fixtureId === 'forma_audio_showcase') {
      return intelligenceInputFromShowcase(SHOWCASE_CATALOGS.forma_audio, {
        merchant: {
          storeName: SHOWCASE_CATALOGS.forma_audio.storeName,
          tagline: SHOWCASE_CATALOGS.forma_audio.tagline,
          description: SHOWCASE_CATALOGS.forma_audio.tagline,
          featuredProductId: SHOWCASE_CATALOGS.forma_audio.products[0]?.id,
        },
      });
    }
    return fixtureById(fixtureId);
  }, [fixtureId]);
  const plan = useMemo(() => buildDesignIntelligencePlan(input), [input]);
  const documentTree = useMemo(() => documentFromIntelligence(input, plan), [input, plan]);
  const catalog = useMemo(() => catalogFromIntelligenceInput(input), [input]);
  const layoutPlan = plan.selectedGrammarId
    ? planForDocument({
        document: documentTree,
        catalog,
        strategy: CANONICAL_STRATEGIES[plan.selectedGrammarId],
        seed: 'seed-a',
        grammarOverride: plan.selectedGrammarId,
        viewport: 'desktop',
      }).plan
    : null;
  const primary = input.products.find((p) => p.id === plan.catalog.primaryProductId);
  const unknown = plan.outcome !== 'selected' || plan.archetype.band === 'unknown';

  return (
    <aside className="di-panel" data-inspector="1" data-outcome={plan.outcome}>
      <div className={`di-outcome di-outcome-${plan.outcome}`} data-unknown={unknown ? '1' : '0'}>
        {unknown ? <strong className="di-unknown-flag">I do not know.</strong> : null}
        <div>
          Outcome <b>{plan.outcome}</b>
          {plan.selectedGrammarId ? ` · ${plan.selectedGrammarId}` : ` · fallback ${plan.safeFallback}`}
        </div>
        <p>{plan.selectionReason}</p>
      </div>
      <h2>Design intelligence</h2>
      <dl>
        <dt>Archetype</dt>
        <dd>
          {plan.archetype.archetype} · {plan.archetype.confidence} · {plan.archetype.band}
        </dd>
        <dt>Raw / ceiling</dt>
        <dd>
          raw {plan.archetype.rawScore} · {plan.archetype.independentGroupCount} independent groups · ceiling{' '}
          {plan.archetype.confidenceCeiling}
        </dd>
        <dt>Evidence groups</dt>
        <dd>
          {plan.archetype.evidenceGroups
            .filter((g) => g.independent)
            .map((g) => `${g.id}[${g.hits.join(', ')}]`)
            .join(' · ') || 'none independent'}
        </dd>
        <dt>Ambiguity</dt>
        <dd>{plan.archetype.ambiguity || '—'}</dd>
        <dt>Contradictions</dt>
        <dd>{plan.archetype.contradictions.join(' · ') || '—'}</dd>
        <dt>Missing data</dt>
        <dd>{plan.archetype.missing.join(', ') || 'none'}</dd>
        <dt>Catalog</dt>
        <dd>
          {plan.catalog.totalProducts} products · {plan.catalog.catalogShape} · {plan.catalog.productDepth} · coverage{' '}
          {plan.catalog.imageCoverage}
        </dd>
        <dt>Primary</dt>
        <dd>{primary?.title || plan.catalog.primaryProductId || 'none'}</dd>
        <dt>Selection certainty</dt>
        <dd>
          {plan.catalog.selectionConfidence} · dominant {plan.catalog.isDominantProduct ? 'yes' : 'no'}
        </dd>
        <dt>Hero suitability</dt>
        <dd>{plan.catalog.heroSuitability}</dd>
        <dt>Narrative suitability</dt>
        <dd>{plan.catalog.narrativeSuitability}</dd>
        <dt>Evidence completeness</dt>
        <dd>{plan.catalog.evidenceCompleteness}</dd>
        <dt>Primary evidence</dt>
        <dd>{plan.catalog.primaryEvidence.map((e) => e.signal).join(' · ') || '—'}</dd>
        <dt>Supporting</dt>
        <dd>
          {plan.catalog.supportingProductIds
            .map((id) => input.products.find((p) => p.id === id)?.title || id)
            .join(', ') || '—'}
        </dd>
        <dt>Selected grammar</dt>
        <dd>{plan.selectedGrammarId || 'none'}</dd>
        <dt>Why selected</dt>
        <dd>{plan.selectionReason}</dd>
        <dt>Tradeoff</dt>
        <dd>{plan.grammarTradeoff || '—'}</dd>
        <dt>Safe fallback</dt>
        <dd>
          {plan.safeFallback} · {plan.page.fallbackStrategy}
        </dd>
        <dt>Plan confidence</dt>
        <dd>{plan.confidence}</dd>
      </dl>

      <h3>Grammar scoring</h3>
      <ul className="di-scores">
        {plan.grammar.map((g) => (
          <li key={g.grammarId} data-accepted={g.accepted ? '1' : '0'} data-selected={g.grammarId === plan.selectedGrammarId ? '1' : '0'}>
            <strong>{g.grammarId}</strong> final {g.score} · weighted {g.breakdown.weighted}{' '}
            {g.experimental ? ' (experimental)' : ''} {g.accepted ? 'accepted' : 'rejected'}
            <div>
              structural {g.breakdown.structural} · semantic {g.breakdown.semantic} · asset {g.breakdown.asset} · brand{' '}
              {g.breakdown.brand} · commerce {g.breakdown.commerce} · penalties {g.breakdown.penalties}
            </div>
            <div>
              gates:{' '}
              {g.gates.map((gate) => `${gate.id}${gate.passed ? '✓' : '✗'}`).join(' · ') || '—'}
            </div>
            {g.failedGates.length ? <div>failed gates: {g.failedGates.join(', ')}</div> : null}
            {g.rejectionReason ? <div>why rejected: {g.rejectionReason}</div> : <div>{g.reasons.join(' ')}</div>}
            {g.riskFlags.length ? <div>risks: {g.riskFlags.join(', ')}</div> : null}
          </li>
        ))}
      </ul>

      <h3>Clarification requests</h3>
      {plan.clarificationRequests.length ? (
        <ul className="di-clarify">
          {plan.clarificationRequests.map((q) => (
            <li key={q.id}>
              <strong>{q.id}</strong> {q.question}
              <div>
                {q.reason} · missing {q.missingEvidence.join(', ') || '—'} · unlocks {q.unlocks.join(', ')} · {q.answerType}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>None — structured data already answers the open decisions.</p>
      )}

      <h3>Assets</h3>
      <ul className="di-assets">
        {plan.assets.map((a) => (
          <li key={a.id}>
            <strong>{a.id}</strong> → {a.role} role {a.roleConfidence} · ownership {a.ownershipConfidence} · owned by{' '}
            {a.productId || 'none'} {a.width}×{a.height} {a.resolutionSuitability}
          </li>
        ))}
      </ul>

      <h3>Narrative eligibility</h3>
      <ul>
        {plan.narrative.map((n) => (
          <li key={n.purpose} data-eligible={n.eligible ? '1' : '0'}>
            <strong>{n.purpose}</strong> {n.eligible ? 'eligible' : 'rejected'} ({n.confidence}) — {n.reason}
            {n.missingEvidence.length ? ` missing: ${n.missingEvidence.join(', ')}` : ''}
          </li>
        ))}
      </ul>

      <h3>Rejected chapters</h3>
      <ul>
        {plan.page.rejected.map((n) => (
          <li key={n.purpose}>
            {n.purpose}: {n.reason} → fallback {n.fallback || 'none'}
          </li>
        ))}
      </ul>

      <h3>PageNarrativePlan</h3>
      <ol>
        {plan.page.chapters.map((c) => (
          <li key={c.id}>
            {c.id} {c.purpose} products[{c.productIds.join(',')}] assets[{c.assetIds.join(',')}] {c.copySource}:{c.copyRef}{' '}
            {c.ecommerceAction} ({c.confidence})
          </li>
        ))}
      </ol>

      <h3>LayoutPlan</h3>
      <p>
        {layoutPlan
          ? `${layoutPlan.grammarId} · ${layoutPlan.heroGeometry} · ${layoutPlan.chapters.map((c) => c.kind).join(' → ')}`
          : `none — ${plan.outcome} uses ${plan.safeFallback}`}
      </p>

      <h3>Naive vs intelligence</h3>
      <p className="di-naive">
        Naive Form={plan.naive.formAssetProductId || '—'} Make={plan.naive.makeAssetProductId || '—'} Use=
        {plan.naive.useAssetProductId || '—'}
      </p>
      <ul>
        {plan.naive.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <h3>Warnings</h3>
      <ul>
        {plan.warnings.map((w) => (
          <li key={`${w.code}:${w.message}`}>
            {w.code}: {w.message}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function AiStudioV2DesignIntelligence() {
  const [params, setParams] = useSearchParams();
  const [layoutPlan, setLayoutPlan] = useState<LayoutPlan | null>(null);
  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  const fixtureParam = params.get('fixture') || 'headphones_technology';
  const fixtureId = (
    fixtureParam === 'forma_audio_showcase' || INTELLIGENCE_FIXTURE_IDS.includes(fixtureParam as IntelligenceFixtureId)
      ? fixtureParam
      : 'headphones_technology'
  ) as IntelligenceFixtureId | 'forma_audio_showcase';
  const viewport = (params.get('viewport') as GrammarViewport) || 'desktop';
  const assignment = (params.get('assignment') as 'naive' | 'intelligent' | 'compare') || 'compare';
  const pane = params.get('pane') || '';
  const capture = params.get('capture') === '1';

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const showNaive = pane === 'naive' || assignment === 'naive' || (assignment === 'compare' && pane !== 'intelligent' && pane !== 'inspector');
  const showIntelligent =
    pane === 'intelligent' || assignment === 'intelligent' || (assignment === 'compare' && pane !== 'naive' && pane !== 'inspector');
  const showPanel = pane === 'inspector' || (!capture && assignment === 'compare') || (!capture && pane === '');

  return (
    <div className={`di-show ${capture ? 'is-capture' : ''}`}>
      {capture ? null : (
        <header className="di-chrome">
          <span className="di-badge">DEV · Phase 5C.1</span>
          <h1>Design intelligence inspector</h1>
          <p>
            Deterministic catalog analysis. No LLM, vision, auth, or publish. Layout-grammar showcase remains the naive
            5B.2 checkpoint.
          </p>
          <div className="di-controls">
            <label>
              Fixture
              <select value={fixtureId} onChange={(e) => set('fixture', e.target.value)}>
                {INTELLIGENCE_FIXTURE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
                <option value="forma_audio_showcase">forma_audio showcase (5B.2 niche)</option>
              </select>
            </label>
            <label>
              Assignment
              <select value={assignment} onChange={(e) => set('assignment', e.target.value)}>
                <option value="compare">compare naive vs intelligence</option>
                <option value="naive">naive (5B.2 Form/Make/Use)</option>
                <option value="intelligent">design intelligence</option>
              </select>
            </label>
            <label>
              Viewport
              <select value={viewport} onChange={(e) => set('viewport', e.target.value)}>
                {VIEWPORTS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
      )}

      <div
        className={`di-stage ${pane === 'inspector' ? 'is-inspector' : ''} ${assignment === 'compare' && !pane ? 'is-compare' : ''}`}
      >
        {pane === 'inspector' || (showPanel && pane !== 'naive' && pane !== 'intelligent') ? (
          <Panel fixtureId={fixtureId} />
        ) : null}
        {showNaive && pane !== 'inspector' ? (
          <section>
            {capture ? null : <h3>Naive assignment</h3>}
            <Preview fixtureId={fixtureId} assignment="naive" viewport={viewport} />
          </section>
        ) : null}
        {showIntelligent && pane !== 'inspector' ? (
          <section>
            {capture ? null : <h3>Design-intelligence assignment</h3>}
            <Preview fixtureId={fixtureId} assignment="intelligent" viewport={viewport} onPlan={setLayoutPlan} />
          </section>
        ) : null}
      </div>
      {layoutPlan && !capture ? (
        <p className="di-layout-note">
          Live LayoutPlan: {layoutPlan.grammarId} · {layoutPlan.heroGeometry}
        </p>
      ) : null}
    </div>
  );
}
