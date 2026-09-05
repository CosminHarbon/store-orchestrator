import { useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fontHref } from '@/lib/ai-studio/spec';
import {
  CANDIDATE_GRAMMARS,
  CANONICAL_STRATEGIES,
  EXPERIMENTAL_GRAMMARS,
  GRAMMAR_STATUS,
  LAYOUT_GRAMMAR_IDS,
  SEED_STRUCTURE_NOTES,
  VIEWPORT_WIDTH_PX,
  brandFor,
  catalogFor,
  documentFor,
  planForDocument,
  seedComparisonMatrix,
  type BrandingMode,
  type GrammarStatus,
  type GrammarViewport,
  type LayoutGrammarId,
} from '@/lib/ai-studio/v2/layoutGrammar';
import GrammarRenderer, { grammarFontFamilies } from '@/components/templates/ai/v2/grammar/GrammarRenderer';
import { useShowcaseCommerce } from './useShowcaseCommerce';
import './layout-grammars.css';

const VIEWPORTS: GrammarViewport[] = ['desktop', 'tablet', 'compact', 'mobile', 'phone'];
const SEEDS = ['seed-a', 'seed-b'] as const;
const MODES = ['review', 'pair', 'single', 'matrix', 'compare', 'sheet'] as const;
type ShowcaseMode = (typeof MODES)[number];

const STATUS_LABEL: Record<GrammarStatus, string> = {
  candidate: 'candidate',
  needs_revision: 'needs revision',
  experimental: 'rejected / experimental',
};

function loadFonts(families: string[]) {
  const id = 'ai-v2-grammar-fonts';
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
  if (unique.length > 2) {
    const extraId = 'ai-v2-grammar-fonts-extra';
    let extra = document.getElementById(extraId) as HTMLLinkElement | null;
    if (!extra) {
      extra = document.createElement('link');
      extra.id = extraId;
      extra.rel = 'stylesheet';
      document.head.appendChild(extra);
    }
    extra.href = `https://fonts.googleapis.com/css2?${unique
      .slice(2)
      .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
      .join('&')}&display=swap`;
  }
}

function StatusPill({ id }: { id: LayoutGrammarId }) {
  const status = GRAMMAR_STATUS[id];
  return (
    <span className={`lg-show-status is-${status}`} data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function Preview({
  grammarId,
  branding,
  seed,
  viewport,
}: {
  grammarId: LayoutGrammarId;
  branding: BrandingMode;
  seed: string;
  viewport: GrammarViewport;
}) {
  const documentTree = useMemo(() => documentFor(branding, grammarId), [branding, grammarId]);
  const catalog = useMemo(() => catalogFor(branding, grammarId), [branding, grammarId]);
  const brand = useMemo(() => brandFor(branding, grammarId), [branding, grammarId]);
  const commerce = useShowcaseCommerce(catalog);
  const strategy = CANONICAL_STRATEGIES[grammarId];

  useEffect(() => {
    loadFonts([...grammarFontFamilies(grammarId), brand.tokens.headingFont, brand.tokens.bodyFont]);
  }, [grammarId, brand.tokens.headingFont, brand.tokens.bodyFont]);

  return (
    <div className="lg-show-shell" data-viewport={viewport}>
      <div
        className="lg-show-frame lg-capture"
        data-capture={`${grammarId}__${branding}__${seed}__${viewport}`}
        style={{ width: VIEWPORT_WIDTH_PX[viewport], maxWidth: '100%' }}
      >
        <GrammarRenderer
          document={documentTree}
          brand={brand}
          commerce={commerce}
          grammarOverride={grammarId}
          strategy={strategy}
          seed={seed}
          viewport={viewport}
        />
      </div>
    </div>
  );
}

function Meta({
  grammarId,
  branding,
  seed,
  viewport,
}: {
  grammarId: LayoutGrammarId;
  branding: BrandingMode;
  seed: string;
  viewport: GrammarViewport;
}) {
  const documentTree = documentFor(branding, grammarId);
  const catalog = catalogFor(branding, grammarId);
  const { plan } = planForDocument({
    document: documentTree,
    catalog,
    strategy: CANONICAL_STRATEGIES[grammarId],
    seed,
    grammarOverride: grammarId,
    viewport,
  });
  const roles = plan.typography.roles;
  const diffs = seedComparisonMatrix(grammarId);
  const notes = SEED_STRUCTURE_NOTES[grammarId];

  return (
    <aside className="lg-show-meta">
      <h2>{grammarId.replace(/_/g, ' ')}</h2>
      <StatusPill id={grammarId} />
      <dl>
        <dt>Grammar</dt>
        <dd>{plan.grammarId}</dd>
        <dt>Why</dt>
        <dd>{plan.resolution.reason}</dd>
        <dt>Influencing fields</dt>
        <dd>{plan.resolution.influencingFields.join(', ')}</dd>
        <dt>Fallback</dt>
        <dd>{plan.resolution.fallback}</dd>
        <dt>Seed</dt>
        <dd>
          {plan.variation.seed} ({plan.variation.seedHash})
        </dd>
        <dt>Seed A structure</dt>
        <dd>{notes.seedA}</dd>
        <dt>Seed B structure</dt>
        <dd>{notes.seedB}</dd>
        <dt>Seed A vs B axes</dt>
        <dd>
          {diffs.map((d) => (
            <div key={d.axis}>
              {d.axis}: {d.seedA} → {d.seedB}
            </div>
          ))}
        </dd>
        <dt>Hero</dt>
        <dd>{plan.heroGeometry}</dd>
        <dt>Grid / width / overlap</dt>
        <dd>
          {plan.variation.gridRatio} · {plan.variation.contentWidth} · {plan.variation.overlap}
        </dd>
        <dt>Product treatments</dt>
        <dd>{plan.productPresentation.join(', ')}</dd>
        <dt>Chapters</dt>
        <dd>{plan.chapters.map((c) => `${c.kind}:${c.geometry}`).join(' → ')}</dd>
        <dt>Typography</dt>
        <dd>
          {plan.typography.displayFont} / {plan.typography.bodyFont} · ratio {plan.typography.scaleRatio}
        </dd>
        <dt>Roles</dt>
        <dd>
          {Object.entries(roles)
            .map(([k, r]) => `${k}: ${r.minPx}–${r.maxPx}px / ${r.maxCh}ch`)
            .join(' · ')}
        </dd>
        <dt>Mobile</dt>
        <dd>{plan.mobile.readingOrder}</dd>
        <dt>Dead fields</dt>
        <dd>{plan.resolution.unsupportedFields.join(', ')}</dd>
      </dl>
    </aside>
  );
}

export default function AiStudioV2LayoutGrammars() {
  const [params, setParams] = useSearchParams();
  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  const grammar = (params.get('grammar') as LayoutGrammarId) || 'cinematic_full_bleed';
  const viewport = (params.get('viewport') as GrammarViewport) || 'desktop';
  const seed = params.get('seed') || 'seed-a';
  const branding = (params.get('branding') as BrandingMode) || 'neutral';
  const mode = (params.get('mode') as ShowcaseMode) || 'review';
  const capture = params.get('capture') === '1';

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const safeGrammar = (LAYOUT_GRAMMAR_IDS as readonly string[]).includes(grammar)
    ? (grammar as LayoutGrammarId)
    : 'cinematic_full_bleed';
  const safeViewport = (VIEWPORTS as readonly string[]).includes(viewport) ? viewport : 'desktop';
  const safeSeed = SEEDS.includes(seed as (typeof SEEDS)[number]) ? seed : 'seed-a';
  const safeBranding: BrandingMode = branding === 'niche' ? 'niche' : 'neutral';
  const safeMode = (MODES as readonly string[]).includes(mode) ? mode : 'review';

  return (
    <div className={`lg-show ${capture ? 'is-capture' : ''}`}>
      {capture ? null : (
        <header className="lg-show-chrome">
          <span className="lg-show-badge">DEV · Phase 5B.2</span>
          <h1>Layout grammar candidates</h1>
          <p>
            Four approved systems first. Same semantic SiteDocument in Neutral mode. Catalog and Warm remain
            experimental. Not connected to live generation.
          </p>
          <div className="lg-show-controls">
            <label>
              Grammar
              <select value={safeGrammar} onChange={(e) => set('grammar', e.target.value)}>
                <optgroup label="Candidates">
                  {CANDIDATE_GRAMMARS.map((id) => (
                    <option key={id} value={id}>
                      {id} · {STATUS_LABEL[GRAMMAR_STATUS[id]]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Rejected / experimental">
                  {EXPERIMENTAL_GRAMMARS.map((id) => (
                    <option key={id} value={id}>
                      {id} · {STATUS_LABEL[GRAMMAR_STATUS[id]]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Viewport
              <select value={safeViewport} onChange={(e) => set('viewport', e.target.value)}>
                {VIEWPORTS.map((v) => (
                  <option key={v} value={v}>
                    {v} ({VIEWPORT_WIDTH_PX[v]}px)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seed
              <select value={safeSeed} onChange={(e) => set('seed', e.target.value)}>
                {SEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Branding
              <select value={safeBranding} onChange={(e) => set('branding', e.target.value)}>
                <option value="neutral">Shared neutral</option>
                <option value="niche">Niche-specific</option>
              </select>
            </label>
            <label>
              Mode
              <select value={safeMode} onChange={(e) => set('mode', e.target.value)}>
                <option value="review">Review four candidates</option>
                <option value="pair">Desktop + tablet + mobile</option>
                <option value="single">Single viewport</option>
                <option value="matrix">Seed A vs B</option>
                <option value="compare">All six</option>
                <option value="sheet">Contact sheet</option>
              </select>
            </label>
          </div>
        </header>
      )}

      {safeMode === 'single' ? (
        <div className="lg-show-stage">
          <Preview grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />
          {capture ? null : (
            <Meta grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />
          )}
        </div>
      ) : null}

      {safeMode === 'pair' ? (
        <div className="lg-show-pair lg-show-pair-4">
          {(['desktop', 'tablet', 'mobile', 'phone'] as const).map((vp) => (
            <div key={vp}>
              <h3>
                {vp} {VIEWPORT_WIDTH_PX[vp]}
              </h3>
              <Preview grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport={vp} />
            </div>
          ))}
          {capture ? null : (
            <Meta grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />
          )}
        </div>
      ) : null}

      {safeMode === 'review' ? (
        <div className="lg-show-review">
          {CANDIDATE_GRAMMARS.map((id) => (
            <section key={id} className="lg-show-review-block">
              <header>
                <h2>{id.replace(/_/g, ' ')}</h2>
                <StatusPill id={id} />
              </header>
              <div className="lg-show-review-row">
                <div>
                  <h3>Desktop 1440 · {safeSeed}</h3>
                  <Preview grammarId={id} branding={safeBranding} seed={safeSeed} viewport="desktop" />
                </div>
                <div>
                  <h3>Tablet 1024</h3>
                  <Preview grammarId={id} branding={safeBranding} seed={safeSeed} viewport="tablet" />
                </div>
                <div>
                  <h3>Mobile 390</h3>
                  <Preview grammarId={id} branding={safeBranding} seed={safeSeed} viewport="mobile" />
                </div>
                <div>
                  <h3>Phone 360</h3>
                  <Preview grammarId={id} branding={safeBranding} seed={safeSeed} viewport="phone" />
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {safeMode === 'matrix' ? (
        <div className="lg-show-matrix">
          {CANDIDATE_GRAMMARS.map((id) => (
            <section key={id}>
              <header>
                <h2>{id.replace(/_/g, ' ')}</h2>
                <StatusPill id={id} />
              </header>
              <p className="lg-show-seed-note">
                A: {SEED_STRUCTURE_NOTES[id].seedA} · B: {SEED_STRUCTURE_NOTES[id].seedB}
              </p>
              <div className="lg-show-matrix-row">
                <div>
                  <h3>Seed A · desktop</h3>
                  <Preview grammarId={id} branding={safeBranding} seed="seed-a" viewport="desktop" />
                </div>
                <div>
                  <h3>Seed B · desktop</h3>
                  <Preview grammarId={id} branding={safeBranding} seed="seed-b" viewport="desktop" />
                </div>
                <div>
                  <h3>Seed A · mobile</h3>
                  <Preview grammarId={id} branding={safeBranding} seed="seed-a" viewport="mobile" />
                </div>
                <div>
                  <h3>Seed B · mobile</h3>
                  <Preview grammarId={id} branding={safeBranding} seed="seed-b" viewport="mobile" />
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {safeMode === 'compare' ? (
        <div className="lg-show-compare">
          {[...CANDIDATE_GRAMMARS, ...EXPERIMENTAL_GRAMMARS].map((id) => (
            <section key={id} className="lg-show-compare-block">
              <h2>
                {id} <StatusPill id={id} />
              </h2>
              <Preview grammarId={id} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />
            </section>
          ))}
        </div>
      ) : null}

      {safeMode === 'sheet' ? (
        <div className="lg-show-sheet">
          {CANDIDATE_GRAMMARS.map((id) => (
            <section key={id}>
              <h2>
                {id} <StatusPill id={id} />
              </h2>
              <div className="lg-show-sheet-row">
                <Preview grammarId={id} branding="neutral" seed="seed-a" viewport="desktop" />
                <Preview grammarId={id} branding="neutral" seed="seed-b" viewport="desktop" />
                <Preview grammarId={id} branding="neutral" seed="seed-a" viewport="mobile" />
                <Preview grammarId={id} branding="neutral" seed="seed-a" viewport="phone" />
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
