#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Phase 5D.3 commerceModel low-priority tiebreaker self-test
 * (no vitest, no LLM required).
 * Run: npx --yes tsx scripts/ai-studio-v5d-commerce-model-selftest.ts
 *
 * Phase 5D.1/5D.2 audited CreativeStrategy.commerceModel and found it read by no
 * deterministic code. Phase 5D.3 gives it exactly ONE consequence: a strictly
 * lowest-priority tiebreaker inside the two existing content.layout resolvers
 * (productSpotlightLayoutDefault, productGridEditorialLayoutDefault) — never
 * reordering their pre-existing typographyRole/imageryRole/asymmetry/density checks,
 * never selecting which commerce section family exists (that remains architect-owned),
 * and never touching productRailHorizontalLayoutDefault, collectionsLayoutDefault, hero,
 * nav/footer, or the renderer.
 *
 * Covers:
 *  A. productSpotlight: commerceModel only acts once typographyRole/imageryRole are
 *     neutral; single_artifact/spec_story -> structuredFeature; no-op values fall through
 *  B. productGrid/editorial: commerceModel only acts once asymmetry/density are neutral;
 *     dense_catalogue -> dense; collection_first is deliberately excluded (no-op)
 *  C. explicit content.layout always wins over any commerceModel value
 *  D. all 5 canonical fixtures resolve identically to their pre-5D.3 values
 *  E. generation-time-only boundary: applyLayoutDefaults is reachable only from
 *     buildDocument in the edge function, never from refine/SiteOps/critique/publish
 */
import { readFileSync } from 'node:fs';
import {
  applyLayoutDefaults,
  productSpotlightLayoutDefault,
  productGridEditorialLayoutDefault,
  type StrategyInput,
  type LayoutDefaultNode,
} from '../shared/ai-studio-v2/strategyDefaults';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/* Strategy fixture builder — neutral baseline mirrors the Phase 5B selftest's own `s()`
 * convention (density/asymmetry/rhythm/typographyRole/imageryRole all at their least
 * decisive value); commerceModel defaults to 'flagship_then_rail', the intentional no-op
 * baseline this phase adds no branch for. */
const s = (overrides: Partial<StrategyInput>): StrategyInput => ({
  density: 'medium',
  asymmetry: 'medium',
  rhythm: 'even',
  typographyRole: 'balanced',
  imageryRole: 'balanced',
  commerceModel: 'flagship_then_rail',
  ...overrides,
});

/* A. productSpotlightLayoutDefault ---------------------------------------- */

assert(
  productSpotlightLayoutDefault(s({ commerceModel: 'single_artifact' })) === 'structuredFeature',
  'A1: neutral typographyRole/imageryRole + commerceModel=single_artifact -> structuredFeature'
);
assert(
  productSpotlightLayoutDefault(s({ commerceModel: 'spec_story' })) === 'structuredFeature',
  'A2: neutral typographyRole/imageryRole + commerceModel=spec_story -> structuredFeature'
);
assert(
  productSpotlightLayoutDefault(s({ imageryRole: 'dominant', commerceModel: 'single_artifact' })) === 'imageDominant',
  'A3: imageryRole=dominant beats commerceModel=single_artifact -> imageDominant (Villa Pelle shape)'
);
assert(
  productSpotlightLayoutDefault(
    s({ typographyRole: 'dominant_structural', commerceModel: 'single_artifact' })
  ) === 'structuredFeature',
  'A4a: typographyRole=dominant_structural + commerceModel=single_artifact -> structuredFeature'
);
assert(
  productSpotlightLayoutDefault(
    s({ typographyRole: 'dominant_structural', commerceModel: 'flagship_then_rail' })
  ) === 'structuredFeature',
  'A4b: typographyRole=dominant_structural wins independently of commerceModel (flagship_then_rail is a no-op) -> structuredFeature'
);
assert(
  productSpotlightLayoutDefault(s({ commerceModel: 'flagship_then_rail' })) === 'feature',
  'A5: neutral signals + commerceModel=flagship_then_rail (no-op) -> feature'
);
assert(
  productSpotlightLayoutDefault(s({ commerceModel: 'shoppable_editorial' })) === 'feature',
  'A6: neutral signals + commerceModel=shoppable_editorial (no-op) -> feature'
);
assert(
  productSpotlightLayoutDefault(s({ commerceModel: 'collection_first' })) === 'feature',
  'A7: neutral signals + commerceModel=collection_first (no-op) -> feature'
);

/* B. productGridEditorialLayoutDefault ------------------------------------ */

assert(
  productGridEditorialLayoutDefault(s({ commerceModel: 'dense_catalogue' })) === 'dense',
  'B8: asymmetry=medium, density=medium, commerceModel=dense_catalogue -> dense'
);
assert(
  productGridEditorialLayoutDefault(s({ asymmetry: 'high', commerceModel: 'dense_catalogue' })) === 'asymmetricFeature',
  'B9: asymmetry=high beats commerceModel=dense_catalogue -> asymmetricFeature'
);
assert(
  productGridEditorialLayoutDefault(s({ density: 'high', commerceModel: 'dense_catalogue' })) === 'dense',
  'B10: density=high wins first (same output as commerceModel would give, but via the existing branch) -> dense'
);
assert(
  productGridEditorialLayoutDefault(s({ commerceModel: 'collection_first' })) === 'featureFirst',
  'B11: asymmetry=medium, density=medium, commerceModel=collection_first (deliberately excluded) -> featureFirst'
);
assert(
  productGridEditorialLayoutDefault(s({ commerceModel: 'flagship_then_rail' })) === 'featureFirst',
  'B12: asymmetry=medium, density=medium, commerceModel=flagship_then_rail (no-op) -> featureFirst'
);
assert(
  productGridEditorialLayoutDefault(s({ commerceModel: 'shoppable_editorial' })) === 'featureFirst',
  'B13: asymmetry=medium, density=medium, commerceModel=shoppable_editorial (no-op) -> featureFirst'
);

/* C. explicit content.layout always wins ---------------------------------- */

const explicitSpotlight: LayoutDefaultNode[] = [
  { type: 'productSpotlight', variant: 'feature', content: { layout: 'feature' } },
];
assert(
  applyLayoutDefaults(explicitSpotlight, s({ commerceModel: 'single_artifact' }))[0].content?.layout === 'feature',
  "C14: explicit productSpotlight content.layout='feature' + commerceModel=single_artifact -> remains 'feature'"
);

const explicitGrid: LayoutDefaultNode[] = [
  { type: 'productGrid', variant: 'editorial', content: { layout: 'standardEditorial' } },
];
assert(
  applyLayoutDefaults(explicitGrid, s({ commerceModel: 'dense_catalogue' }))[0].content?.layout === 'standardEditorial',
  "C15: explicit productGrid content.layout='standardEditorial' + commerceModel=dense_catalogue -> remains 'standardEditorial'"
);

/* D. Fixture invariants ---------------------------------------------------- */

function findNode(fixtureId: string, nodeId: string) {
  const fixture = V2_VARIETY_FIXTURES.find((f) => f.id === fixtureId);
  if (!fixture) return undefined;
  return fixture.document.pages.home.nodes.find((n) => n.id === nodeId);
}

const villaSpotlight = findNode('luxury_fashion', 'spotlight_01');
assert(
  villaSpotlight?.content?.layout === 'imageDominant',
  `D16: Villa Pelle spotlight_01 still resolves 'imageDominant' (got '${villaSpotlight?.content?.layout}')`
);

// D17: full resolution-equivalence sweep over every commerce node in all 5 canonical
// fixtures — the exact commerceModel + explicit/unset layout matrix from the Phase 5D.2
// audit, asserted against current build() output rather than hand-copied expectations, so
// this fails loudly if generation output ever drifts from the audited baseline.
const EXPECTED: Array<{ fixtureId: string; nodeId: string; layout: string | undefined }> = [
  { fixtureId: 'luxury_fashion', nodeId: 'spotlight_01', layout: 'imageDominant' },
  { fixtureId: 'luxury_fashion', nodeId: 'products_01', layout: 'alternatingOversized' },
  { fixtureId: 'modern_skincare', nodeId: 'spotlight_01', layout: 'feature' },
  { fixtureId: 'modern_skincare', nodeId: 'products_01', layout: undefined }, // luxury_image_first: no resolver
  { fixtureId: 'streetwear', nodeId: 'spotlight_01', layout: 'structuredFeature' },
  { fixtureId: 'streetwear', nodeId: 'products_01', layout: 'dense' },
  { fixtureId: 'streetwear', nodeId: 'rail_01', layout: 'alternatingOversized' },
  { fixtureId: 'streetwear', nodeId: 'collections_01', layout: 'stacked' },
];
for (const { fixtureId, nodeId, layout } of EXPECTED) {
  const node = findNode(fixtureId, nodeId);
  assert(
    node !== undefined && node.content?.layout === layout,
    `D17: ${fixtureId}/${nodeId} resolves content.layout=${JSON.stringify(layout)} (got ${JSON.stringify(node?.content?.layout)})`
  );
}

const auricGrid = findNode('electronics', 'products_01');
assert(
  auricGrid?.content?.layout === 'asymmetricFeature',
  `D17: Auric products_01 remains explicit 'asymmetricFeature' (got '${auricGrid?.content?.layout}')`
);
const auricCollections = findNode('electronics', 'collections_01');
assert(
  auricCollections?.content?.layout === 'stacked',
  `D17: Auric collections_01 remains explicit 'stacked' (got '${auricCollections?.content?.layout}')`
);
const hearthGrid = findNode('artisan_food', 'products_01');
assert(
  hearthGrid?.content?.layout === 'standardEditorial',
  `D17: Hearth & Grove products_01 remains explicit 'standardEditorial' (got '${hearthGrid?.content?.layout}')`
);

/* E. Boundary safety -------------------------------------------------------- */

const edgeSrc = readFileSync(new URL('../supabase/functions/_shared/aiStudioV2.ts', import.meta.url), 'utf8');
const refineSrc = readFileSync(new URL('../supabase/functions/ai-studio-refine/index.ts', import.meta.url), 'utf8');
const siteOpsSrc = readFileSync(new URL('../src/lib/ai-studio/v2/siteOps.ts', import.meta.url), 'utf8');
const critiqueSrc = readFileSync(new URL('../supabase/functions/_shared/aiStudioV2Critique.ts', import.meta.url), 'utf8');
const publishSrc = readFileSync(new URL('../supabase/functions/ai-studio-publish/index.ts', import.meta.url), 'utf8');

assert(
  /function buildDocument[\s\S]{0,2000}applyLayoutDefaults\(/.test(edgeSrc),
  'E18: production applyLayoutDefaults call lives inside buildDocument (generation-time only)'
);
assert(
  (edgeSrc.match(/applyLayoutDefaults\(/g) || []).length === 1,
  'E18: applyLayoutDefaults is called exactly once in the edge function (inside buildDocument, reused by all 3 generation/repair passes)'
);
assert(!refineSrc.includes('applyLayoutDefaults'), 'E19: ai-studio-refine (SiteOps edit endpoint) does not call applyLayoutDefaults');
assert(!siteOpsSrc.includes('applyLayoutDefaults'), 'E20: siteOps.ts does not import or call applyLayoutDefaults');
assert(!critiqueSrc.includes('applyLayoutDefaults'), 'E21: aiStudioV2Critique.ts does not call applyLayoutDefaults');
assert(!publishSrc.includes('applyLayoutDefaults'), 'E22: ai-studio-publish does not call applyLayoutDefaults');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nPhase 5D.3 commerce-model self-tests passed.');
