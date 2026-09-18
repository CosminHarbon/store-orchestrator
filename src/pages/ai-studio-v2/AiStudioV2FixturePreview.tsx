import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fontHref } from '@/lib/ai-studio/spec';
import { brandDesignSystemFromSpec } from '@/lib/ai-studio/v2/designSpec';
import { V2_VARIETY_FIXTURES } from '@/lib/ai-studio/v2/fixtures';
import { SHOWCASE_CATALOGS, type ShowcaseBrandId } from '@/lib/ai-studio/v2/showcaseData';
import type { SiteNode } from '@/lib/ai-studio/v2/siteTree';
import SiteTreeRenderer from '@/components/templates/ai/v2/SiteTreeRenderer';
import { useShowcaseCommerce } from './useShowcaseCommerce';
import '@/components/templates/premium/premium.css';
import '@/components/templates/ai/v2/v2.css';

/**
 * DEV-ONLY static QA page.
 *
 * Renders the exact hand-authored V2_VARIETY_FIXTURES documents (the same fixtures the
 * expressiveness selftest asserts against) through the REAL SiteTreeRenderer, registry and
 * CSS - no LLM call, no Supabase Edge Function call, no generation pipeline, no persistence.
 * Pick a fixture, resize the viewport (DevTools device toolbar or the window itself) to
 * exercise responsive.mobile - that is the entire surface of this page.
 *
 * Commerce/catalog data reuses the same SHOWCASE_CATALOGS + useShowcaseCommerce demo data
 * already powering /ai-studio-v2-generate and /ai-studio-v2-showcase, matched to each
 * fixture by creative theme (the same pairing phase3Briefs.ts already encodes via
 * previewCatalogId, just keyed by V2_VARIETY_FIXTURES id instead of Phase3BriefId).
 */

const FIXTURE_CATALOG: Record<string, ShowcaseBrandId> = {
  luxury_fashion: 'atelier_no8',
  modern_skincare: 'aurelia',
  streetwear: 'northline',
  electronics: 'forma_audio',
  artisan_food: 'maison_alba',
};

const FIXTURE_LABELS: Record<string, string> = {
  luxury_fashion: 'luxury_fashion — Villa Pelle',
  streetwear: 'streetwear — BLOCK FORM',
  modern_skincare: 'modern_skincare — Lumen Lab',
  electronics: 'electronics — Auric',
  artisan_food: 'artisan_food — Hearth & Grove',
};

function loadFonts(heading: string, body: string) {
  const id = 'ai-v2-fixture-preview-fonts';
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = fontHref(heading, body);
}

function nodeSummaryLine(n: SiteNode): string {
  const layout = typeof n.content?.layout === 'string' ? n.content.layout : null;
  const hidden = n.visible === false ? ' (hidden)' : '';
  return `${n.id} — ${n.type}/${n.variant}${layout ? ` layout=${layout}` : ''}${hidden}`;
}

export default function AiStudioV2FixturePreview() {
  const isDev = import.meta.env.DEV;
  const [fixtureId, setFixtureId] = useState<string>('luxury_fashion');

  const fixture = useMemo(
    () => V2_VARIETY_FIXTURES.find((f) => f.id === fixtureId) ?? V2_VARIETY_FIXTURES[0],
    [fixtureId]
  );
  const brand = useMemo(() => brandDesignSystemFromSpec(fixture.designSpec), [fixture]);
  const catalog = SHOWCASE_CATALOGS[FIXTURE_CATALOG[fixture.id] ?? 'atelier_no8'];
  const commerce = useShowcaseCommerce(catalog);

  useEffect(() => {
    loadFonts(brand.tokens.headingFont, brand.tokens.bodyFont);
  }, [brand.tokens.headingFont, brand.tokens.bodyFont]);

  // Router-level `import.meta.env.DEV` gate in App.tsx already keeps this out of
  // production builds entirely; this is a defense-in-depth guard on the component itself,
  // matching the existing AiStudioV2Showcase convention.
  if (!isDev) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#efefef' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#111',
          color: '#fff',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
        }}
      >
        <strong style={{ background: '#f5a623', color: '#111', padding: '2px 8px', borderRadius: 4 }}>
          DEV QA — static fixture preview (no LLM/API calls)
        </strong>
        <label>
          Fixture:{' '}
          <select
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value)}
            style={{
              color: '#111',
              background: '#fff',
              font: 'inherit',
              padding: '4px 6px',
              borderRadius: 3,
              border: '1px solid #555',
            }}
          >
            {V2_VARIETY_FIXTURES.map((f) => (
              <option key={f.id} value={f.id}>
                {FIXTURE_LABELS[f.id] || f.id}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary style={{ cursor: 'pointer' }}>
            SiteTree — {fixture.id} ({fixture.document.pages.home.nodes.length} nodes)
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxWidth: 640 }}>
            {fixture.document.pages.home.nodes.map((n) => (
              <li key={n.id}>{nodeSummaryLine(n)}</li>
            ))}
          </ul>
        </details>
      </header>
      <SiteTreeRenderer document={fixture.document} brand={brand} commerce={commerce} />
    </div>
  );
}
