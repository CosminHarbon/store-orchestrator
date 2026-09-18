#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Phase 5B core-composition Design-DNA defaults self-test
 * (no vitest, no LLM required).
 * Run: npx --yes tsx scripts/ai-studio-v5b-core-composition-defaults-selftest.ts
 *
 * Phase 5A found that hero, productGrid, and productRail — the three highest-frequency,
 * most visible compositions — had NO deterministic content.layout default, unlike the
 * seven Phase 4 sections (editorialSplit, productSpotlight, brandStatement, newsletter,
 * collections, testimonials, reviews). Phase 5B closes that gap with five new resolvers
 * (strategyDefaults.ts) and converts LAYOUT_DEFAULT_RESOLVERS from a type-only key to a
 * `${type}/${variant}` key, since hero and productGrid each register multiple variants
 * with different (sometimes entirely absent) layout vocabularies.
 *
 * Covers:
 *  1. Variant safety: every resolved default is valid for its EXACT (type, variant)
 *  2. No layout leaks between productGrid variants (editorial vs. luxury_image_first)
 *  3. No layout leaks between hero variants (editorial_split / luxury_minimal / product_focus)
 *  4. Invalid cross-composition layouts remain rejected (isValidLayout)
 *  5. Explicit architect authoring always wins, for all three families
 *  6. productGrid: materially different strategy inputs resolve differently + precedence
 *  7. productGrid: fallback/default matches the renderer's own pre-existing hardcoded default
 *  8. productRail: rhythm resolves the two layouts correctly (one clean discriminator)
 *  9. productRail: fallback/default matches the renderer's own pre-existing hardcoded default
 * 10. hero: each variant's baseline default matches the renderer's own hardcoded fallback
 * 11. hero: all three variants genuinely have a within-variant choice (no invented one);
 *     productGrid/luxury_image_first genuinely has none, and is correctly left unregistered
 * 12. Live fixture wiring: the two minimal fixture edits (Villa Pelle / BLOCK FORM hero)
 *     resolve identically to their previous hand-authored values; BLOCK FORM / Auric rails
 *     (already unset) exercise both productRail branches with zero fixture edits
 */
import {
  applyLayoutDefaults,
  heroEditorialSplitLayoutDefault,
  heroLuxuryMinimalLayoutDefault,
  heroProductFocusLayoutDefault,
  productGridEditorialLayoutDefault,
  productRailHorizontalLayoutDefault,
  type StrategyInput,
  type LayoutDefaultNode,
} from '../shared/ai-studio-v2/strategyDefaults';
import { isValidLayout, allowedLayouts, COMPOSITION_LAYOUTS } from '../shared/ai-studio-v2/compositionLayouts';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const compositionsSource = fs.readFileSync(
  path.join(here, '../src/components/templates/ai/v2/compositions.tsx'),
  'utf8'
);

/* Strategy fixtures spanning the relevant enum values ------------------- */

const s = (overrides: Partial<StrategyInput>): StrategyInput => ({
  density: 'medium',
  asymmetry: 'medium',
  rhythm: 'even',
  typographyRole: 'balanced',
  imageryRole: 'balanced',
  ...overrides,
});

/* 1/4. Variant safety + invalid-layout rejection ------------------------ */

assert(
  JSON.stringify(allowedLayouts('hero', 'editorial_split')) === JSON.stringify(['split', 'asymmetric']),
  'hero/editorial_split allows exactly split|asymmetric'
);
assert(
  JSON.stringify(allowedLayouts('hero', 'luxury_minimal')) === JSON.stringify(['quiet', 'cinematic']),
  'hero/luxury_minimal allows exactly quiet|cinematic'
);
assert(
  JSON.stringify(allowedLayouts('hero', 'product_focus')) === JSON.stringify(['stage', 'stacked']),
  'hero/product_focus allows exactly stage|stacked'
);
assert(
  JSON.stringify(allowedLayouts('productGrid', 'editorial')) ===
    JSON.stringify(['standardEditorial', 'featureFirst', 'asymmetricFeature', 'dense']),
  'productGrid/editorial allows exactly standardEditorial|featureFirst|asymmetricFeature|dense'
);
assert(
  JSON.stringify(allowedLayouts('productRail', 'horizontal')) === JSON.stringify(['uniform', 'alternatingOversized']),
  'productRail/horizontal allows exactly uniform|alternatingOversized'
);

for (const [key, values] of Object.entries(COMPOSITION_LAYOUTS)) {
  const [type, variant] = key.split('/');
  for (const v of values as readonly string[]) {
    assert(isValidLayout(type, variant, v), `${key}: '${v}' is accepted as valid for its own composition`);
  }
}

assert(!isValidLayout('hero', 'editorial_split', 'quiet'), "a layout valid on hero/luxury_minimal ('quiet') is rejected on hero/editorial_split");
assert(!isValidLayout('hero', 'luxury_minimal', 'split'), "a layout valid on hero/editorial_split ('split') is rejected on hero/luxury_minimal");
assert(!isValidLayout('hero', 'product_focus', 'asymmetric'), "a layout valid on hero/editorial_split ('asymmetric') is rejected on hero/product_focus");
assert(!isValidLayout('productGrid', 'luxury_image_first', 'featureFirst'), "a layout valid on productGrid/editorial ('featureFirst') is rejected on productGrid/luxury_image_first");
assert(isValidLayout('productGrid', 'luxury_image_first', undefined), 'productGrid/luxury_image_first: absent content.layout is still valid (undefined is always valid, even for a composition with no documented layout vocabulary)');
assert(!isValidLayout('productGrid', 'editorial', 'stagee'), "a typo'd productGrid layout value is rejected");
assert(!isValidLayout('productRail', 'horizontal', 'alternating'), "a truncated/typo'd productRail layout value is rejected");

/* 2. No layout leaks between productGrid variants ------------------------ */

const luxuryImageFirstUnset: LayoutDefaultNode[] = [{ type: 'productGrid', variant: 'luxury_image_first', content: {} }];
assert(
  applyLayoutDefaults(luxuryImageFirstUnset, s({ density: 'high', asymmetry: 'high' }))[0].content?.layout === undefined,
  'productGrid/luxury_image_first is never given a content.layout by applyLayoutDefaults, even under density=high + asymmetry=high (it has no registered resolver and no documented layout vocabulary at all)'
);
for (const value of ['dense', 'asymmetricFeature', 'featureFirst', 'standardEditorial']) {
  assert(
    !isValidLayout('productGrid', 'luxury_image_first', value),
    `productGrid/editorial's own '${value}' layout is correctly rejected on productGrid/luxury_image_first — no leakage between productGrid variants`
  );
}

/* 3. No layout leaks between hero variants -------------------------------- */

const heroVariantLayouts: Record<string, readonly string[]> = {
  editorial_split: allowedLayouts('hero', 'editorial_split') || [],
  luxury_minimal: allowedLayouts('hero', 'luxury_minimal') || [],
  product_focus: allowedLayouts('hero', 'product_focus') || [],
};
for (const [ownVariant, ownValues] of Object.entries(heroVariantLayouts)) {
  for (const [otherVariant, otherValues] of Object.entries(heroVariantLayouts)) {
    if (otherVariant === ownVariant) continue;
    for (const value of ownValues) {
      if (otherValues.includes(value)) continue; // no accidental vocabulary overlap exists today, but skip defensively if it ever did
      assert(
        !isValidLayout('hero', otherVariant, value),
        `hero/${ownVariant}'s '${value}' layout is correctly rejected on hero/${otherVariant} — no leakage between hero variants`
      );
    }
  }
}

// Resolver-level leak guard: applyLayoutDefaults must never write a hero/product_focus or
// hero/luxury_minimal value onto a hero/editorial_split node, even under identical strategy input.
const splitUnset: LayoutDefaultNode[] = [{ type: 'hero', variant: 'editorial_split', content: {} }];
const luxuryUnset: LayoutDefaultNode[] = [{ type: 'hero', variant: 'luxury_minimal', content: {} }];
const stageUnset: LayoutDefaultNode[] = [{ type: 'hero', variant: 'product_focus', content: {} }];
const heavyStrategy = s({ asymmetry: 'high', imageryRole: 'dominant' });
assert(
  ['split', 'asymmetric'].includes(applyLayoutDefaults(splitUnset, heavyStrategy)[0].content?.layout as string),
  'hero/editorial_split only ever resolves to its own vocabulary'
);
assert(
  ['quiet', 'cinematic'].includes(applyLayoutDefaults(luxuryUnset, heavyStrategy)[0].content?.layout as string),
  'hero/luxury_minimal only ever resolves to its own vocabulary'
);
assert(
  ['stage', 'stacked'].includes(applyLayoutDefaults(stageUnset, heavyStrategy)[0].content?.layout as string),
  'hero/product_focus only ever resolves to its own vocabulary'
);

/* 5. Explicit authoring always wins, for all three families -------------- */

const explicitCases: Array<[LayoutDefaultNode, StrategyInput, string]> = [
  [{ type: 'hero', variant: 'editorial_split', content: { layout: 'split' } }, s({ asymmetry: 'high' }), 'split'],
  [{ type: 'hero', variant: 'luxury_minimal', content: { layout: 'quiet' } }, s({ imageryRole: 'dominant' }), 'quiet'],
  [{ type: 'hero', variant: 'product_focus', content: { layout: 'stage' } }, s({ imageryRole: 'dominant' }), 'stage'],
  [{ type: 'productGrid', variant: 'editorial', content: { layout: 'standardEditorial' } }, s({ density: 'high', asymmetry: 'high' }), 'standardEditorial'],
  [{ type: 'productRail', variant: 'horizontal', content: { layout: 'uniform' } }, s({ rhythm: 'rapid_contrast' }), 'uniform'],
];
for (const [node, strategy, expected] of explicitCases) {
  const result = applyLayoutDefaults([node], strategy)[0];
  assert(
    result.content?.layout === expected,
    `explicit content.layout='${expected}' on ${node.type}/${node.variant} always wins over the strategy default, even one that would otherwise resolve differently`
  );
}

/* 6. productGrid: materially different strategy inputs resolve differently + precedence */

assert(productGridEditorialLayoutDefault(s({ density: 'medium', asymmetry: 'medium' })) === 'featureFirst', 'neutral density+asymmetry resolves to featureFirst (the safe default)');
assert(productGridEditorialLayoutDefault(s({ density: 'high', asymmetry: 'medium' })) === 'dense', 'density=high alone resolves to dense');
assert(productGridEditorialLayoutDefault(s({ density: 'medium', asymmetry: 'high' })) === 'asymmetricFeature', 'asymmetry=high alone resolves to asymmetricFeature');
assert(
  productGridEditorialLayoutDefault(s({ density: 'high', asymmetry: 'high' })) === 'asymmetricFeature',
  'when density=high AND asymmetry=high compete, asymmetry wins (documented precedence: the more structurally decisive signal is checked first, same precedent as editorialSplitLayoutDefault/productSpotlightLayoutDefault checking typographyRole before imageryRole)'
);
assert(
  productGridEditorialLayoutDefault(s({ density: 'high', asymmetry: 'medium' })) !==
    productGridEditorialLayoutDefault(s({ density: 'medium', asymmetry: 'high' })),
  'density-driven and asymmetry-driven productGrid defaults are materially different outcomes, not a collapsed fingerprint'
);
assert(
  !['dense', 'asymmetricFeature'].includes(productGridEditorialLayoutDefault(s({ density: 'low', asymmetry: 'low' }))),
  'low density + low asymmetry never resolves to the two structurally distinct layouts — only the safe default'
);

const gridUnset: LayoutDefaultNode[] = [{ type: 'productGrid', variant: 'editorial', content: {} }];
assert(
  applyLayoutDefaults(gridUnset, s({ density: 'high', asymmetry: 'medium' }))[0].content?.layout === 'dense',
  'applyLayoutDefaults fills productGrid/editorial content.layout from creativeStrategy when the architect left it unset'
);

/* 7. productGrid: fallback matches the renderer's own pre-existing hardcoded default ----- */

const gridFnStart = compositionsSource.indexOf('export function ProductGridEditorial');
const gridFnEnd = compositionsSource.indexOf('export function ProductGridLuxuryImageFirst');
assert(gridFnStart > -1 && gridFnEnd > gridFnStart, 'ProductGridEditorial is found in compositions.tsx for structural inspection');
const gridFnSource = compositionsSource.slice(gridFnStart, gridFnEnd);
assert(gridFnSource.includes("layoutOf(node, 'featureFirst')"), "ProductGridEditorial's own hardcoded fallback is 'featureFirst' — productGridEditorialLayoutDefault's baseline case must match it exactly, or an unset+neutral-strategy node would render differently after Phase 5B than before it");
assert(
  applyLayoutDefaults(gridUnset, s({ density: 'medium', asymmetry: 'medium' }))[0].content?.layout === 'featureFirst',
  "an unset productGrid/editorial node with neutral (medium/medium) strategy resolves to 'featureFirst', pixel-identical to pre-Phase-5B behavior"
);
// standardEditorial is deliberately never produced by the resolver — see its doc comment.
for (const density of ['low', 'medium', 'high'] as const) {
  for (const asymmetry of ['low', 'medium', 'high'] as const) {
    assert(
      productGridEditorialLayoutDefault(s({ density, asymmetry })) !== 'standardEditorial',
      `productGridEditorialLayoutDefault never resolves 'standardEditorial' (density=${density}, asymmetry=${asymmetry}) — it is structurally identical to the base grid and only ever a deliberate architect choice, never a strategy-implied one`
    );
  }
}

/* 8/9. productRail: rhythm resolves correctly + fallback matches renderer default -------- */

assert(productRailHorizontalLayoutDefault(s({ rhythm: 'sparse_pause' })) === 'uniform', 'sparse_pause resolves to uniform');
assert(productRailHorizontalLayoutDefault(s({ rhythm: 'even' })) === 'uniform', 'even resolves to uniform');
assert(productRailHorizontalLayoutDefault(s({ rhythm: 'rapid_contrast' })) === 'alternatingOversized', 'rapid_contrast resolves to alternatingOversized');
assert(productRailHorizontalLayoutDefault(s({ rhythm: 'long_short_long' })) === 'alternatingOversized', 'long_short_long resolves to alternatingOversized');

const railFnStart = compositionsSource.indexOf('export function ProductRailHorizontal');
const railFnEnd = compositionsSource.indexOf('/**\n * Phase 4B');
assert(railFnStart > -1 && railFnEnd > railFnStart, 'ProductRailHorizontal is found in compositions.tsx for structural inspection');
const railFnSource = compositionsSource.slice(railFnStart, railFnEnd);
assert(railFnSource.includes("layoutOf(node, 'uniform')"), "ProductRailHorizontal's own hardcoded fallback is 'uniform' — productRailHorizontalLayoutDefault's baseline case must match it exactly");

const railUnset: LayoutDefaultNode[] = [{ type: 'productRail', variant: 'horizontal', content: {} }];
assert(
  applyLayoutDefaults(railUnset, s({ rhythm: 'even' }))[0].content?.layout === 'uniform',
  "an unset productRail/horizontal node with rhythm='even' resolves to 'uniform', pixel-identical to pre-Phase-5B behavior"
);
assert(
  applyLayoutDefaults(railUnset, s({ rhythm: 'rapid_contrast' }))[0].content?.layout === 'alternatingOversized',
  'applyLayoutDefaults fills productRail/horizontal content.layout from creativeStrategy when the architect left it unset'
);

/* 10. hero: each variant's baseline matches the renderer's own hardcoded fallback -------- */

const heroFnBounds: Array<[string, string, string]> = [
  ['HeroEditorialSplit', 'HeroLuxuryMinimal', "layoutOf(node, 'split')"],
  ['HeroLuxuryMinimal', 'HeroProductFocus', "layoutOf(node, 'quiet')"],
  ['HeroProductFocus', 'ProductGridEditorial', "layoutOf(node, 'stage')"],
];
for (const [startFn, endFn, expectedFallback] of heroFnBounds) {
  const start = compositionsSource.indexOf(`export function ${startFn}`);
  const end = compositionsSource.indexOf(`export function ${endFn}`);
  assert(start > -1 && end > start, `${startFn} is found in compositions.tsx for structural inspection`);
  assert(
    compositionsSource.slice(start, end).includes(expectedFallback),
    `${startFn}'s own hardcoded fallback is ${expectedFallback} — the matching hero resolver's baseline case must equal it exactly`
  );
}
assert(heroEditorialSplitLayoutDefault(s({ asymmetry: 'low' })) === 'split', 'hero/editorial_split baseline (asymmetry not high) resolves to split');
assert(heroEditorialSplitLayoutDefault(s({ asymmetry: 'high' })) === 'asymmetric', 'hero/editorial_split asymmetry=high resolves to asymmetric');
assert(heroLuxuryMinimalLayoutDefault(s({ imageryRole: 'supporting' })) === 'quiet', 'hero/luxury_minimal baseline (imageryRole not dominant) resolves to quiet');
assert(heroLuxuryMinimalLayoutDefault(s({ imageryRole: 'dominant' })) === 'cinematic', 'hero/luxury_minimal imageryRole=dominant resolves to cinematic');
assert(heroProductFocusLayoutDefault(s({ imageryRole: 'balanced' })) === 'stage', 'hero/product_focus baseline (imageryRole not dominant) resolves to stage');
assert(heroProductFocusLayoutDefault(s({ imageryRole: 'dominant' })) === 'stacked', 'hero/product_focus imageryRole=dominant resolves to stacked');

/* 11. hero variants genuinely have a real choice; productGrid/luxury_image_first genuinely has none */

for (const variant of ['editorial_split', 'luxury_minimal', 'product_focus']) {
  const values = allowedLayouts('hero', variant) || [];
  assert(values.length === 2, `hero/${variant} genuinely registers 2 distinct content.layout values — Phase 5B connects a REAL within-variant choice here, not an invented one`);
}
assert(
  allowedLayouts('productGrid', 'luxury_image_first') === undefined,
  'productGrid/luxury_image_first has NO documented content.layout vocabulary at all — Phase 5B correctly leaves it unregistered in LAYOUT_DEFAULT_RESOLVERS rather than inventing a choice that does not exist'
);

/* 12. Live fixture wiring — the two minimal edits + the two already-unset rail nodes ----- */

const luxuryFashionFixture = V2_VARIETY_FIXTURES.find((f) => f.id === 'luxury_fashion');
const villaPelleHero = luxuryFashionFixture?.document.pages.home.nodes.find((n) => n.id === 'hero_01');
assert(
  villaPelleHero?.content?.layout === 'cinematic',
  "Villa Pelle hero_01 (no longer hand-authored — Phase 5B fixture edit) resolves to 'cinematic' via the new default (imageryRole='dominant'), identical to its previous explicit value"
);

const streetwearFixture2 = V2_VARIETY_FIXTURES.find((f) => f.id === 'streetwear');
const blockFormHero = streetwearFixture2?.document.pages.home.nodes.find((n) => n.id === 'hero_01');
assert(
  blockFormHero?.content?.layout === 'asymmetric',
  "BLOCK FORM hero_01 (no longer hand-authored — Phase 5B fixture edit) resolves to 'asymmetric' via the new default (asymmetry='high'), identical to its previous explicit value"
);
const blockFormRail = streetwearFixture2?.document.pages.home.nodes.find((n) => n.id === 'rail_01');
assert(
  blockFormRail?.content?.layout === 'alternatingOversized',
  "BLOCK FORM rail_01 (already unset — zero fixture edit needed) resolves to 'alternatingOversized' via the new default (rhythm='rapid_contrast'), a genuinely NEW visible structural difference vs. pre-Phase-5B (uniform filmstrip)"
);

const electronicsFixture2 = V2_VARIETY_FIXTURES.find((f) => f.id === 'electronics');
const auricRail = electronicsFixture2?.document.pages.home.nodes.find((n) => n.id === 'rail_01');
assert(
  auricRail?.content?.layout === 'uniform',
  "Auric rail_01 (already unset — zero fixture edit needed) resolves to 'uniform' via the new default (rhythm='even'), confirming the neutral-rhythm baseline renders unchanged"
);

console.log(
  failed === 0
    ? '\nAll AI Studio V2 Phase 5B core-composition self-tests passed.'
    : `\n${failed} self-test(s) FAILED.`
);
process.exit(failed === 0 ? 0 : 1);
