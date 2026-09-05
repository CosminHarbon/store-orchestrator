import { useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fontHref } from '@/lib/ai-studio/spec';
import {
  LAYOUT_GRAMMAR_IDS,
  CANONICAL_STRATEGIES,
  brandFor,
  catalogFor,
  documentFor,
  planForDocument,
  type BrandingMode,
  type LayoutGrammarId,
  type GrammarViewport,
} from '@/lib/ai-studio/v2/layoutGrammar';
import GrammarRenderer, { grammarFontFamilies } from '@/components/templates/ai/v2/grammar/GrammarRenderer';
import { useShowcaseCommerce } from './useShowcaseCommerce';
import './layout-grammars.css';

const VIEWPORTS: GrammarViewport[] = ['desktop', 'tablet', 'mobile'];
const SEEDS = ['seed-a', 'seed-b'] as const;

const FRAME_WIDTH: Record<GrammarViewport, number> = {
  desktop: 1440,
  tablet: 834,
  mobile: 390,
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
        style={{ width: FRAME_WIDTH[viewport], maxWidth: '100%' }}
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

  return (
    <aside className="lg-show-meta">
      <h2>{grammarId.replace(/_/g, ' ')}</h2>
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

  const grammar = (params.get('grammar') as LayoutGrammarId) || 'editorial_asymmetric';
  const viewport = (params.get('viewport') as GrammarViewport) || 'desktop';
  const seed = params.get('seed') || 'seed-a';
  const branding = (params.get('branding') as BrandingMode) || 'neutral';
  const mode = (params.get('mode') as 'single' | 'pair' | 'compare' | 'sheet') || 'pair';
  const capture = params.get('capture') === '1';

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const safeGrammar = (LAYOUT_GRAMMAR_IDS as readonly string[]).includes(grammar)
    ? (grammar as LayoutGrammarId)
    : 'editorial_asymmetric';
  const safeViewport = (VIEWPORTS as readonly string[]).includes(viewport) ? viewport : 'desktop';
  const safeSeed = SEEDS.includes(seed as (typeof SEEDS)[number]) ? seed : 'seed-a';
  const safeBranding: BrandingMode = branding === 'niche' ? 'niche' : 'neutral';
  const safeMode = ['single', 'pair', 'compare', 'sheet'].includes(mode) ? mode : 'pair';

  return (
    <div className={`lg-show ${capture ? 'is-capture' : ''}`}>
      {capture ? null : (
      <header className="lg-show-chrome">
        <span className="lg-show-badge">DEV · Phase 5B.1</span>
        <h1>Layout grammar prototypes</h1>
        <p>
          Same semantic SiteDocument and catalog in Neutral mode. Grammars are generative systems, not six skins.
          Not connected to live generation.
        </p>
        <div className="lg-show-controls">
          <label>
            Grammar
            <select value={safeGrammar} onChange={(e) => set('grammar', e.target.value)}>
              {LAYOUT_GRAMMAR_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Viewport
            <select value={safeViewport} onChange={(e) => set('viewport', e.target.value)}>
              {VIEWPORTS.map((v) => (
                <option key={v} value={v}>
                  {v} ({FRAME_WIDTH[v]}px)
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
              <option value="pair">Desktop + mobile</option>
              <option value="single">Single viewport</option>
              <option value="compare">All six (screenshot)</option>
              <option value="sheet">Contact sheet</option>
            </select>
          </label>
        </div>
      </header>
      )}

      {safeMode === 'single' ? (
        <div className="lg-show-stage">
          <Preview grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />
          {capture ? null : <Meta grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />}
        </div>
      ) : null}

      {safeMode === 'pair' ? (
        <div className="lg-show-pair">
          <div>
            <h3>Desktop 1440</h3>
            <Preview grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport="desktop" />
          </div>
          <div>
            <h3>Mobile 390</h3>
            <Preview grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport="mobile" />
          </div>
          <Meta grammarId={safeGrammar} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />
        </div>
      ) : null}

      {safeMode === 'compare' ? (
        <div className="lg-show-compare">
          {LAYOUT_GRAMMAR_IDS.map((id) => (
            <section key={id} className="lg-show-compare-block">
              <h2>{id}</h2>
              <Preview grammarId={id} branding={safeBranding} seed={safeSeed} viewport={safeViewport} />
            </section>
          ))}
        </div>
      ) : null}

      {safeMode === 'sheet' ? (
        <div className="lg-show-sheet">
          {LAYOUT_GRAMMAR_IDS.map((id) => (
            <section key={id}>
              <h2>{id}</h2>
              <div className="lg-show-sheet-row">
                <Preview grammarId={id} branding="neutral" seed="seed-a" viewport="desktop" />
                <Preview grammarId={id} branding="neutral" seed="seed-b" viewport="desktop" />
                <Preview grammarId={id} branding="neutral" seed="seed-a" viewport="mobile" />
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
