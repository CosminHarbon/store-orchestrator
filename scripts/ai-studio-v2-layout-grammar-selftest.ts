/**
 * AI Studio V2 Phase 5B.1 — layout grammar self-test (no vitest).
 * Run: npx --yes tsx scripts/ai-studio-v2-layout-grammar-selftest.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPOSITION_TYPES } from '../src/lib/ai-studio/v2/siteTree.ts';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures.ts';
import {
  ALL_TYPOGRAPHY_ROLE_IDS,
  CANDIDATE_GRAMMARS,
  CANONICAL_STRATEGIES,
  EXPERIMENTAL_GRAMMARS,
  GRAMMAR_STATUS,
  LAYOUT_GRAMMAR_IDS,
  SHARED_CATALOG,
  SHARED_DOCUMENT,
  assertValidCompositionIds,
  buildLayoutPlan,
  planForDocument,
  resolveGrammarFromStrategy,
  resolveGrammarFromUnknownSpec,
  resolveVariation,
  seedComparisonMatrix,
  typographyFor,
  variationIsStructurallyDifferent,
  type LayoutGrammarId,
} from '../src/lib/ai-studio/v2/layoutGrammar/index.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const EXPECTED: Record<LayoutGrammarId, LayoutGrammarId> = {
  editorial_asymmetric: 'editorial_asymmetric',
  cinematic_full_bleed: 'cinematic_full_bleed',
  product_monument: 'product_monument',
  typographic_campaign: 'typographic_campaign',
  immersive_catalog: 'immersive_catalog',
  warm_storytelling: 'warm_storytelling',
};

function main() {
  for (const id of LAYOUT_GRAMMAR_IDS) {
    const r1 = resolveGrammarFromStrategy(CANONICAL_STRATEGIES[id]);
    const r2 = resolveGrammarFromStrategy(CANONICAL_STRATEGIES[id]);
    assert(r1.grammarId === EXPECTED[id], `${id} canonical strategy resolves to itself (got ${r1.grammarId})`);
    assert(r1.grammarId === r2.grammarId && r1.reason === r2.reason, `${id} resolution is deterministic`);
    assert(r1.influencingFields.length > 0, `${id} reports influencing fields`);
    assert(r1.unsupportedFields.includes('silhouettePlan'), `${id} flags dead silhouettePlan`);
  }

  const incomplete = resolveGrammarFromUnknownSpec({
    creativeMode: 'balanced',
    artDirection: { density: 'sparse', archetype: 'quiet_luxury_editorial' },
  });
  assert(!!incomplete.strategy.pageComposition, 'legacy spec infers a CreativeStrategy');
  assert(LAYOUT_GRAMMAR_IDS.includes(incomplete.resolution.grammarId), 'legacy spec resolves to a known grammar');
  assert(incomplete.resolution.fallback === 'inferred_strategy', 'legacy spec uses inferred_strategy fallback');

  const empty = resolveGrammarFromUnknownSpec(undefined);
  assert(empty.resolution.fallback === 'default_editorial' || LAYOUT_GRAMMAR_IDS.includes(empty.resolution.grammarId), 'empty spec does not crash');

  for (const id of LAYOUT_GRAMMAR_IDS) {
    const a = resolveVariation(id, 'seed-a');
    const a2 = resolveVariation(id, 'seed-a');
    const b = resolveVariation(id, 'seed-b');
    assert(JSON.stringify(a) === JSON.stringify(a2), `${id} seed-a is stable`);
    assert(variationIsStructurallyDifferent(a, b), `${id} seed-b is structurally different from seed-a`);
    assert(a.heroGeometry !== b.heroGeometry, `${id} seed changes hero geometry`);
    assert(a.mediaSide !== b.mediaSide, `${id} seed changes media side`);
    const matrix = seedComparisonMatrix(id);
    assert(matrix.length >= 5, `${id} seed matrix has ${matrix.length} structural axis diffs (need >= 5)`);

    const type = typographyFor(id);
    for (const role of ALL_TYPOGRAPHY_ROLE_IDS) {
      assert(!!type.roles[role], `${id} has typography role ${role}`);
      assert(type.roles[role].maxCh > 0 && type.roles[role].minPx > 0, `${id} ${role} has scale + measure`);
    }
  }

  for (const id of CANDIDATE_GRAMMARS) {
    assert(GRAMMAR_STATUS[id] === 'candidate', `${id} is a candidate`);
    const nav = typographyFor(id).roles.navigation;
    const price = typographyFor(id).roles.price;
    const action = typographyFor(id).roles.action;
    assert(nav.minPx >= 14, `${id} navigation minPx ${nav.minPx} >= 14`);
    assert(price.minPx >= 16, `${id} price minPx ${price.minPx} >= 16`);
    assert(action.minPx >= 13, `${id} action minPx ${action.minPx} >= 13`);
  }
  for (const id of EXPERIMENTAL_GRAMMARS) {
    assert(GRAMMAR_STATUS[id] === 'experimental', `${id} marked experimental`);
    const { plan } = planForDocument({
      document: SHARED_DOCUMENT,
      catalog: SHARED_CATALOG,
      strategy: CANONICAL_STRATEGIES[id],
      seed: 'seed-a',
      grammarOverride: id,
      viewport: 'desktop',
    });
    assert(plan.grammarId === id, `${id} still plans (kept for comparison)`);
  }

  for (const vp of ['desktop', 'tablet', 'compact', 'mobile', 'phone'] as const) {
    for (const id of CANDIDATE_GRAMMARS) {
      const { plan, page } = planForDocument({
        document: SHARED_DOCUMENT,
        catalog: SHARED_CATALOG,
        strategy: CANONICAL_STRATEGIES[id],
        seed: 'seed-a',
        grammarOverride: id,
        viewport: vp,
      });
      assert(plan.grammarId === id, `${id} ${vp} plan uses requested grammar`);
      assert(plan.chapters.length >= 3, `${id} ${vp} has chapters`);
      assert(plan.heroGeometry.length > 0, `${id} ${vp} hero geometry`);
      assert(plan.productPresentation.length > 0, `${id} ${vp} product treatments`);
      assert(plan.overflowStrategy === 'clip_root', `${id} ${vp} overflow strategy`);
      assert(plan.mobile.readingOrder.length > 20, `${id} ${vp} mobile recomposition documented`);
      assert(page.products.length >= 4, `${id} ${vp} catalog connected`);
      const invalid = assertValidCompositionIds(plan.compositionIds);
      assert(invalid.length === 0, `${id} ${vp} composition ids valid (${invalid.join(',')})`);
      for (const ch of plan.chapters) {
        assert(ch.motion.reducedMotionSafe === true, `${id} chapter ${ch.id} is reduced-motion safe`);
      }
    }
  }

  const override = buildLayoutPlan({
    strategy: CANONICAL_STRATEGIES.immersive_catalog,
    grammarOverride: 'editorial_asymmetric',
    seed: 'seed-a',
    nodeTypes: [...COMPOSITION_TYPES],
  });
  assert(override.grammarId === 'editorial_asymmetric', 'override wins over strategy');
  assert(override.resolution.influencingFields.includes('grammarOverride'), 'override recorded');

  const srcDir = resolve(import.meta.dirname, '../src/components/templates/ai/v2/grammar');
  const grammarsSrc = readFileSync(resolve(srcDir, 'Grammars.tsx'), 'utf8');
  const primitivesSrc = readFileSync(resolve(srcDir, 'primitives.tsx'), 'utf8');
  const bound = grammarsSrc + primitivesSrc;
  assert(bound.includes('commerce.openProduct'), 'product open handler remains connected');
  assert(bound.includes('commerce.addToCart'), 'add-to-cart handler remains connected');
  assert(bound.includes('commerce.openCatalog'), 'catalog handler remains connected');
  assert(bound.includes('commerce.setCartOpen'), 'cart handler remains connected');
  assert(bound.includes('lg-nav-toggle'), 'mobile menu toggle present');
  assert(bound.includes('lg-mon-identity'), 'monument identity block present');
  assert(grammarsSrc.includes('Experimental / rejected'), 'experimental grammars are labeled');
  assert(!bound.includes('Math.random'), 'no Math.random in grammar pages');

  const css = readFileSync(resolve(srcDir, 'grammar.css'), 'utf8') + readFileSync(resolve(srcDir, 'grammar-5b2.css'), 'utf8');
  assert(css.includes('overflow-x: clip'), 'root clips horizontal overflow');
  assert(css.includes('prefers-reduced-motion'), 'reduced-motion CSS present');
  assert(css.includes(':focus-visible'), 'keyboard focus styles present');
  assert(css.includes("data-viewport='mobile'"), 'mobile recomposition is explicit, not only 1fr');
  assert(css.includes("data-viewport='phone'"), '360px phone viewport rules present');
  assert(css.includes("data-viewport='compact'"), '768px compact viewport rules present');
  assert(css.includes('.lg-mon-identity'), 'monument identity is styled in flow');
  assert(css.includes('.lg-nav-toggle'), 'nav toggle styled');
  assert(css.includes('.lg-cin-sequence'), 'cinematic sequence styled');

  const renderer = readFileSync(resolve(srcDir, 'GrammarRenderer.tsx'), 'utf8');
  assert(!renderer.includes('Math.random'), 'no Math.random in renderer');

  const app = readFileSync(resolve(import.meta.dirname, '../src/App.tsx'), 'utf8');
  assert(app.includes('ai-studio-v2-layout-grammars'), 'DEV route registered');
  assert(app.includes('import.meta.env.DEV && AiStudioV2LayoutGrammars'), 'route is DEV-only');

  const siteTree = readFileSync(resolve(import.meta.dirname, '../src/components/templates/ai/v2/SiteTreeRenderer.tsx'), 'utf8');
  assert(siteTree.includes('nodes.map'), 'live SiteTreeRenderer left stacked (not rewired)');

  for (const fixture of V2_VARIETY_FIXTURES) {
    const r = resolveGrammarFromUnknownSpec(fixture.designSpec);
    assert(LAYOUT_GRAMMAR_IDS.includes(r.resolution.grammarId), `variety fixture ${fixture.id} resolves`);
  }

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nlayout-grammar selftest passed');
}

main();
