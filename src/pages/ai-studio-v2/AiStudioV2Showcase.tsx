import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fontHref } from '@/lib/ai-studio/spec';
import {
  COMPOSITION_GALLERY,
  SHOWCASE_CATALOGS,
  SHOWCASE_STORES,
  type ShowcaseBrandId,
} from '@/lib/ai-studio/v2/showcaseData';
import { brandTokensToCssVars } from '@/lib/ai-studio/v2/tokens';
import SiteTreeRenderer from '@/components/templates/ai/v2/SiteTreeRenderer';
import { resolveComposition } from '@/components/templates/ai/v2/registry';
import { useShowcaseCommerce } from './useShowcaseCommerce';
import '@/components/templates/premium/premium.css';
import '@/components/templates/ai/v2/v2.css';
import './showcase.css';

type Tab = 'stores' | 'gallery' | 'checklist';
type Viewport = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_WIDTH: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '834px',
  mobile: '390px',
};

const CHECKLIST_KEYS = [
  'Visual hierarchy',
  'Composition',
  'Typography',
  'Spacing',
  'Imagery',
  'Brand consistency',
  'Product presentation',
  'Mobile',
  'Originality',
  'Premium perception',
] as const;

function loadFonts(heading: string, body: string) {
  const id = 'ai-v2-showcase-fonts';
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = fontHref(heading as never, body as never);
}

function GalleryItem({
  brandId,
  node,
}: {
  brandId: ShowcaseBrandId;
  node: (typeof COMPOSITION_GALLERY)[number]['node'];
}) {
  const catalog = SHOWCASE_CATALOGS[brandId];
  const commerce = useShowcaseCommerce(catalog);
  const brand = SHOWCASE_STORES.find((s) => s.id === brandId)!.brand;

  useEffect(() => {
    loadFonts(brand.tokens.headingFont, brand.tokens.bodyFont);
  }, [brand.tokens.headingFont, brand.tokens.bodyFont]);

  const entry = resolveComposition(node.type, node.variant);
  if (!entry) return <p className="sv2-warn">Missing composition {node.type}:{node.variant}</p>;
  const Cmp = entry.Component;

  return (
    <div
      className="sv2-gallery-frame ai-v2-root"
      style={brandTokensToCssVars(brand)}
      data-density={brand.tokens.density}
      data-type-scale={brand.tokens.typographyScale}
      data-type-role={brand.tokens.typographyRole}
    >
      <Cmp node={node} brand={brand} commerce={commerce} language="en" />
    </div>
  );
}

function StorePreview({
  storeId,
  viewport,
}: {
  storeId: ShowcaseBrandId;
  viewport: Viewport;
}) {
  const store = SHOWCASE_STORES.find((s) => s.id === storeId)!;
  const commerce = useShowcaseCommerce(store.catalog);

  useEffect(() => {
    loadFonts(store.brand.tokens.headingFont, store.brand.tokens.bodyFont);
  }, [store.brand.tokens.headingFont, store.brand.tokens.bodyFont]);

  return (
    <div className="sv2-viewport-shell" data-viewport={viewport}>
      <div className="sv2-viewport-frame" style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: '100%' }}>
        <SiteTreeRenderer document={store.document} brand={store.brand} commerce={commerce} />
      </div>
    </div>
  );
}

function ManualChecklist({ storeId }: { storeId: ShowcaseBrandId }) {
  const store = SHOWCASE_STORES.find((s) => s.id === storeId)!;
  const storageKey = `ai_v2_showcase_checklist_${storeId}`;
  const [scores, setScores] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(scores));
  }, [scores, storageKey]);

  return (
    <div className="sv2-checklist">
      <h3>{store.title}</h3>
      <p className="sv2-muted">{store.compositionNote}</p>
      <ul>
        {CHECKLIST_KEYS.map((key) => (
          <li key={key}>
            <div className="sv2-check-row">
              <strong>{key}</strong>
              <select
                value={scores[key] ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  setScores((prev) => {
                    const next = { ...prev };
                    if (!raw) delete next[key];
                    else next[key] = Number(raw);
                    return next;
                  });
                }}
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <p className="sv2-hint">{store.checklistHints[key]}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * DEV-ONLY visual validation page for AI Studio V2 compositions.
 * Not registered in production builds.
 */
export default function AiStudioV2Showcase() {
  const isDev = import.meta.env.DEV;
  const [tab, setTab] = useState<Tab>('stores');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [storeId, setStoreId] = useState<ShowcaseBrandId>('atelier_no8');

  const groups = useMemo(() => {
    const map = new Map<string, typeof COMPOSITION_GALLERY>();
    for (const item of COMPOSITION_GALLERY) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, []);

  if (!isDev) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="sv2-showcase">
      <header className="sv2-chrome">
        <div>
          <p className="sv2-badge">DEV ONLY · not shipped to merchants</p>
          <h1>AI Studio V2 — Composition Showcase</h1>
          <p className="sv2-lede">
            Validate whether these 18 compositions can produce genuinely different premium storefronts.
            Production behavior is unchanged.
          </p>
        </div>
        <div className="sv2-controls">
          <a className="sv2-gen-link" href="/ai-studio-v2-generate">Generate lab →</a>
          <div className="sv2-tabs">
            {(
              [
                ['stores', 'Complete stores'],
                ['gallery', 'All 18 compositions'],
                ['checklist', 'Manual checklist'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="sv2-viewport-toggles">
            <span>Viewport</span>
            {(['desktop', 'tablet', 'mobile'] as const).map((v) => (
              <button key={v} type="button" className={viewport === v ? 'active' : ''} onClick={() => setViewport(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tab === 'stores' && (
        <section className="sv2-panel">
          <div className="sv2-store-picker">
            {SHOWCASE_STORES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={storeId === s.id ? 'active' : ''}
                onClick={() => setStoreId(s.id)}
              >
                <strong>{s.title}</strong>
                <span>{s.brief}</span>
              </button>
            ))}
          </div>
          <article className="sv2-store-meta">
            <h2>{SHOWCASE_STORES.find((s) => s.id === storeId)?.title}</h2>
            <p>{SHOWCASE_STORES.find((s) => s.id === storeId)?.compositionNote}</p>
            <p className="sv2-muted">
              Sequence:{' '}
              {SHOWCASE_STORES.find((s) => s.id === storeId)
                ?.document.pages.home.nodes.filter((n) => n.visible !== false)
                .map((n) => `${n.type}:${n.variant}`)
                .join(' → ')}
            </p>
          </article>
          <StorePreview storeId={storeId} viewport={viewport} />
        </section>
      )}

      {tab === 'gallery' && (
        <section className="sv2-panel">
          <p className="sv2-lede">
            Each composition is rendered with realistic brand content. Switch viewport above to stress responsive
            behavior.
          </p>
          {groups.map(([group, items]) => (
            <div key={group} className="sv2-group">
              <h2>{group}</h2>
              {items.map((item) => (
                <div key={`${item.type}:${item.variant}`} className="sv2-gallery-item">
                  <div className="sv2-gallery-label">
                    <strong>{item.label}</strong>
                    <code>
                      {item.type}/{item.variant}
                    </code>
                    <span>{SHOWCASE_CATALOGS[item.brandId].storeName}</span>
                  </div>
                  <div className="sv2-viewport-shell" data-viewport={viewport}>
                    <div className="sv2-viewport-frame" style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: '100%' }}>
                      <GalleryItem brandId={item.brandId} node={item.node} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {tab === 'checklist' && (
        <section className="sv2-panel sv2-checklist-panel">
          <p className="sv2-lede">
            Manual validation framework only — not an AI critic. Scores persist in localStorage for this browser.
          </p>
          <div className="sv2-store-picker">
            {SHOWCASE_STORES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={storeId === s.id ? 'active' : ''}
                onClick={() => setStoreId(s.id)}
              >
                <strong>{s.title}</strong>
              </button>
            ))}
          </div>
          <ManualChecklist storeId={storeId} />
        </section>
      )}
    </div>
  );
}
