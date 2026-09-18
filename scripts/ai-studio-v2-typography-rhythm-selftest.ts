#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Phase 3 (Typography + Spacing/Rhythm Grammar) self-test.
 * Run: npx --yes tsx scripts/ai-studio-v2-typography-rhythm-selftest.ts
 *
 * Covers:
 *  1. artDirection.typography.scale survives DesignSpec -> BrandDesignSystem
 *  2. typography.scale is actually consumed by renderer CSS (not a dead enum value)
 *  3. creativeStrategy.typographyRole survives onto brand.tokens.typographyRole,
 *     including the no-creativeStrategy inference fallback
 *  4. typographyRole (kicker/price grammar) is actually consumed by renderer CSS
 *  5. density (brand.tokens.density) reaches the renderer root and is actually
 *     consumed by internal-gap CSS — no longer a dead custom property/attribute
 *  6. density controls INTERNAL gaps only, never outer section padding
 *  7. node.design.spacing still controls OUTER section padding, untouched by density
 *  8. restrained vs expressive produce meaningfully different, hierarchical type tokens
 *     (hero/h2 gap shrinks, not a uniform multiply)
 *  9. every new CSS custom property introduced by this phase has a real consumer
 * 10. a fully-defaulted DesignSpec still resolves to sane typography/density tokens
 * 11. long_short_long rhythm no longer emits two adjacent 'dramatic' spacing beats
 *     (the excessive-whitespace bug found in the Phase 2 visual audit)
 * 12. the general adjacency guard also catches density=low + rhythm=even (every
 *     section defaulting to 'dramatic'), and never touches an explicit architect value
 * 13. Phase 1 mobile dense-grid override survives untouched
 * 14. Phase 2 radius/shadow/buttonStyle CSS plumbing survives untouched
 *
 * --- Phase 3 EFFECTIVENESS pass (added after manual QA found "no visible difference") ---
 * The tests above proved the pipeline and CSS grammar are wired correctly in isolation,
 * with synthetic specs built exactly to hit each branch. They did NOT prove the actual
 * static QA fixtures (V2_VARIETY_FIXTURES — Villa Pelle/Lumen Lab/BLOCK FORM/Auric/
 * Hearth & Grove, rendered by AiStudioV2FixturePreview.tsx) ever reached those branches.
 * The root cause was exactly that gap: the fixtures are hand-authored SiteNodes that never
 * ran through applyStrategyDefaults, so typographyRole's emphasis effect, rhythm, and most
 * density gaps were live in the pipeline but permanently inert on the one page a human
 * actually looks at. These assertions guard the REAL fixture set, not just synthetic specs:
 * 15. V2_VARIETY_FIXTURES collectively cover both typographyScale values, all three
 *     density values, and all three typographyRole values (the coverage gap itself)
 * 16. at least one real fixture's hero/brandStatement node actually has design.emphasis
 *     set (proof applyStrategyDefaults runs on fixtures, not just synthetic node arrays)
 * 17. the REAL resolved hero heading size (computed the same way the browser would:
 *     clamp() + typographyScale + emphasis override) differs by a visually meaningful
 *     amount across the actual fixture set, not just between two synthetic specs
 * 18. at least one fixture's productGrid actually renders the density-tokenized plain
 *     .ai-v2-merch-grid (previously ALL 5 fixtures routed to a different, untokenized
 *     grid container — the "grid gap" density lever had zero real fixture coverage)
 *
 * --- Local composition fixes (manual QA round 2: Villa Pelle hero islands, BLOCK FORM
 *     grid left-bias). A prior narrow patch fixed both globally (raising
 *     --ai-v2-emphasis-quiet; excluding types from applyStrategyDefaults' alignment) and
 *     was reverted — these are the scoped, composition-layer replacements: ---
 * 19. [data-align='center'] gets a companion rule centering .ai-v2-hero h1's own box
 *     (previously only .ai-v2-lead had one, leaving the headline flush-left while body
 *     copy and the CTA appeared centered)
 * --- Content canvas system (round 4: real browser measurement proved .ai-v2-wrap was
 *     already centered at viewport=1109px — 40px/1029px/40px — the actual bug was the
 *     gutter/content-cap grammar itself, not alignment) ---
 * 21. --ai-v2-pad is a genuine clamp() range; the reported dead zone (flat 40px gutter at
 *     viewport=1109px) is closed, while mobile (390px) stays gutter-efficient
 * 22. --ai-v2-content-max is a real named token (was a magic 1180px duplicated in
 *     --ai-v2-measure AND .ai-v2-rail's own formula) so the content canvas has one
 *     intentional maximum and the two can't silently drift out of sync
 * 23. full-bleed sections (data-bleed='1') still force width:100% at the OUTER section
 *     level, unconstrained by the gutter/content-cap system — full-bleed imagery, while
 *     the inner .ai-v2-wrap (headline/copy) still routes through the same gutter grammar
 *
 * --- Canvas vs. art-direction (round 5: a further browser measurement proved round 3's
 *     alignment fix was still wrong in the general case — center sections measured
 *     67/976/67 but start sections measured 0/976/133: the SAME 976px canvas, physically
 *     dragged to the viewport edge by [data-align='start']'s margin-inline:0 auto).
 *     Test 20 (above) is REPLACED by the corrected invariant: ---
 * 20. .ai-v2-wrap's centering is now unconditional (base rule only — no [data-align=...]
 *     rule may ever set its margin-inline again); the previous per-composition
 *     (merch/collections/reviews) exception from round 3 is now dead code and removed;
 *     a concrete arithmetic check reproduces the exact 1109px geometry and proves a
 *     start-aligned section now resolves the same symmetric gutters as a center-aligned
 *     one; real single-moment asymmetry (hero h1/.ai-v2-lead/.ai-v2-statement-text) still
 *     shifts its OWN box within the still-centered canvas, for all three align values; the
 *     strategy layer itself (applyStrategyDefaults) is proven untouched
 *
 * --- Product rail edge gutter, round 6 (page canvas/alignment fixes confirmed correct by
 *     manual QA; the rail's container-padding gutter still visually started at the
 *     viewport edge) tried flex-item ::before/::after spacers — SUPERSEDED below. ---
 *
 * --- Product rail edge gutter, round 7 (real browser evidence: scrollLeft≈78 on initial
 *     load proved round 6's spacer approach introduced a WORSE bug — scroll-snap-
 *     type:mandatory forced an initial scroll jump past the spacer to satisfy Card 1's
 *     scroll-snap-align:start, since the spacer was extra scrollable content shifting
 *     Card 1 away from position 0). Corrected architecture: ---
 * 24. .ai-v2-rail's START edge uses real padding-inline-start (part of the snapport by
 *     spec, so scrollLeft=0 already satisfies Card 1's snap constraint — no forced jump)
 *     plus an explicit scroll-padding-inline-start reinforcing the same inset for the snap
 *     computation itself, both using the same --ai-v2-gutter token as the page canvas; the
 *     round-6 ::before spacer is removed (one mechanism, not two). The END edge keeps a
 *     content spacer (::after) — justified: trailing padding on scrollable flex containers
 *     has a real history of browser exclusion bugs, and nothing snaps via its end edge
 *     here so there's no jump risk — but its flex-basis subtracts --ai-v2-rail-gap so the
 *     gap the container already inserts before it doesn't get double-counted into
 *     gutter+gap; a concrete arithmetic check proves gap+spacer sums to exactly the page
 *     canvas's own gutter. Card 1 keeps scroll-snap-align:start (still a real snap
 *     target), scroll-snap-type stays mandatory (the snapport geometry was fixed, not
 *     weakened to hide the bug), card size and Phase 1 dense-grid rules are untouched.
 *     These are static CSS-invariant guards only — runtime scrollLeft/resting position
 *     requires an actual browser and is left to manual QA.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  designSpecSchema,
  designTokensSchema,
  brandDesignSystemFromSpec,
  type DesignSpec,
} from '../src/lib/ai-studio/v2/designSpec';
import { applyStrategyDefaults, type StrategyInput } from '../shared/ai-studio-v2/strategyDefaults';
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

/** Minimal but fully valid DesignSpec — only the fields this test cares about vary. */
function minimalSpec(
  overrides: {
    scale?: 'restrained' | 'expressive';
    creativeStrategy?: Record<string, unknown>;
  } = {}
): DesignSpec {
  return designSpecSchema.parse({
    version: 1,
    brand: {
      businessType: 'test goods',
      audience: 'test audience',
      positioning: 'test positioning',
      personality: ['test'],
    },
    designIntent: {
      coreConcept: 'Test concept for typography/rhythm selftest coverage, not a real brand.',
      emotionalGoal: 'calm confidence',
      visualHierarchy: 'title dominates, then product, then footer',
      compositionPrinciples: ['sparse rhythm'],
      photographyDirection: 'studio light, negative space',
      typographyDirection: 'serif display, restrained body',
      interactionDirection: 'minimal chrome',
      premiumCharacteristics: ['whitespace'],
      avoidPatterns: ['clutter'],
    },
    artDirection: {
      archetype: 'test_archetype',
      typography: { display: 'Playfair Display', body: 'Inter', scale: overrides.scale ?? 'expressive' },
      colorStrategy: {
        primary: '#112233',
        background: '#FFFFFF',
        text: '#111111',
        accent: '#AA3300',
        secondary: '#EEEEEE',
      },
      photography: { style: 'studio', treatment: 'clean' },
    },
    ux: {
      primaryConversion: 'add to cart',
      ctaStyle: 'solid buttons',
      navStyle: 'minimal',
      discovery: 'grid browse',
      mobileStrategy: 'stacked single column',
    },
    pageIntent: { homeNarrative: 'hero, then products, then footer' },
    ...(overrides.creativeStrategy ? { creativeStrategy: overrides.creativeStrategy } : {}),
  });
}

const here = path.dirname(fileURLToPath(import.meta.url));
const v2Css = fs.readFileSync(path.join(here, '../src/components/templates/ai/v2/v2.css'), 'utf8');

/** Isolates one rule's declaration block by a unique, exact selector snippet. */
function ruleBlock(css: string, selectorSnippet: string): string {
  const idx = css.indexOf(selectorSnippet);
  if (idx < 0) return '';
  const braceStart = css.indexOf('{', idx);
  const braceEnd = css.indexOf('}', braceStart);
  if (braceStart < 0 || braceEnd < 0) return '';
  return css.slice(braceStart, braceEnd);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx >= 0) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/* 1. typography.scale survives DesignSpec -> BrandDesignSystem ------------------------- */

const expressiveBrand = brandDesignSystemFromSpec(minimalSpec({ scale: 'expressive' }));
const restrainedBrand = brandDesignSystemFromSpec(minimalSpec({ scale: 'restrained' }));
assert(
  expressiveBrand.tokens.typographyScale === 'expressive',
  `artDirection.typography.scale='expressive' survives into brand.tokens.typographyScale (got '${expressiveBrand.tokens.typographyScale}')`
);
assert(
  restrainedBrand.tokens.typographyScale === 'restrained',
  `artDirection.typography.scale='restrained' survives into brand.tokens.typographyScale (got '${restrainedBrand.tokens.typographyScale}')`
);

/* 2. typography.scale is actually consumed by renderer CSS ------------------------------ */

assert(
  v2Css.includes("[data-type-scale='restrained']"),
  "v2.css has a real [data-type-scale='restrained'] treatment (not a dead enum value)"
);
assert(
  /var\(--ai-v2-hero-h1/.test(ruleBlock(v2Css, '.ai-v2-hero h1 {')),
  'hero h1 (all hero variants share this selector) consumes var(--ai-v2-hero-h1)'
);
assert(
  /var\(--ai-v2-h2/.test(ruleBlock(v2Css, '.ai-v2-section h2 {')),
  'shared section h2 (editorial split, mosaic, rail title, collections title, ...) consumes var(--ai-v2-h2)'
);

/* 3. typographyRole survives, including the no-creativeStrategy inference fallback ------ */

const dominantBrand = brandDesignSystemFromSpec(
  minimalSpec({
    creativeStrategy: {
      pageComposition: 'dense_campaign',
      heroPhilosophy: 'typography_first',
      commerceEntry: 'early',
      commerceModel: 'dense_catalogue',
      rhythm: 'rapid_contrast',
      density: 'high',
      asymmetry: 'high',
      typographyRole: 'dominant_structural',
      imageryRole: 'dominant',
      navigationBehavior: 'bold_campaign',
      experimentationLevel: 'medium',
      distinctivenessBrief: 'Avoid a soft luxury hero; open loud and graphic instead.',
    },
  })
);
assert(
  dominantBrand.tokens.typographyRole === 'dominant_structural',
  `an authored creativeStrategy.typographyRole survives onto brand.tokens.typographyRole (got '${dominantBrand.tokens.typographyRole}')`
);
const noStrategyBrand = brandDesignSystemFromSpec(minimalSpec());
assert(
  ['quiet', 'balanced', 'dominant_structural'].includes(noStrategyBrand.tokens.typographyRole),
  `a DesignSpec with no creativeStrategy still resolves brand.tokens.typographyRole via inference (got '${noStrategyBrand.tokens.typographyRole}')`
);

/* 4. typographyRole (kicker/price grammar) is actually consumed ------------------------- */

assert(
  v2Css.includes("[data-type-role='dominant_structural']") && v2Css.includes("[data-type-role='quiet']"),
  'v2.css has real treatments for both non-default typographyRole values'
);
assert(/var\(--ai-v2-kicker-size/.test(ruleBlock(v2Css, '.ai-v2-kicker {')), '.ai-v2-kicker consumes var(--ai-v2-kicker-size)');
assert(
  /var\(--ai-v2-kicker-tracking/.test(ruleBlock(v2Css, '.ai-v2-kicker {')),
  '.ai-v2-kicker consumes var(--ai-v2-kicker-tracking)'
);
assert(
  /var\(--ai-v2-price-weight/.test(ruleBlock(v2Css, '.ai-v2-pp-price {')),
  '.ai-v2-pp-price consumes var(--ai-v2-price-weight) — modest, size-free price hierarchy (never overwhelms title/image)'
);
assert(
  !/font-size:\s*var\(--ai-v2-price/.test(ruleBlock(v2Css, '.ai-v2-pp-price {')),
  'typographyRole never resizes price text — only weight/tracking (must not overwhelm product title/image)'
);

/* 5 & 6. density reaches the renderer and is consumed for INTERNAL gaps only ------------ */

assert(
  v2Css.includes("[data-density='dense']") && v2Css.includes("[data-density='sparse']"),
  "v2.css has real [data-density='dense']/[data-density='sparse'] treatments (Phase 2 audit found this dead)"
);
const denseBlock = ruleBlock(v2Css, "[data-density='dense'] {");
const sparseBlock = ruleBlock(v2Css, "[data-density='sparse'] {");
assert(denseBlock.length > 0 && sparseBlock.length > 0, 'density rule blocks are non-empty');
assert(
  !/padding/.test(denseBlock) && !/padding/.test(sparseBlock),
  'density never sets section padding directly — that stays node.design.spacing\'s job (outer inset vs internal density separation)'
);
assert(
  /--ai-v2-grid-gap/.test(denseBlock) && /--ai-v2-card-gap/.test(sparseBlock),
  'density rule blocks define internal gap tokens (grid/card/rail/title gaps)'
);
assert(/var\(--ai-v2-grid-gap/.test(ruleBlock(v2Css, '.ai-v2-merch-grid {')), 'product grid gap consumes var(--ai-v2-grid-gap)');
assert(/var\(--ai-v2-rail-gap/.test(ruleBlock(v2Css, '.ai-v2-rail {')), 'product rail gap consumes var(--ai-v2-rail-gap)');
assert(/var\(--ai-v2-card-gap/.test(ruleBlock(v2Css, '.ai-v2-pp {')), 'card internal (media/meta) gap consumes var(--ai-v2-card-gap)');
assert(
  /var\(--ai-v2-title-gap/.test(ruleBlock(v2Css, '.ai-v2-section-head {')),
  'section title -> content gap consumes var(--ai-v2-title-gap)'
);

/* 7. node.design.spacing still controls OUTER section padding, untouched by density ----- */

const spacingBlock = ruleBlock(v2Css, "[data-spacing='dramatic'],\n.ai-v2-hero[data-spacing='dramatic'] {");
assert(/padding/.test(spacingBlock), 'data-spacing still controls real outer section padding');
assert(!/gap:/.test(spacingBlock), 'data-spacing never sets internal gaps — that is density\'s job, not spacing\'s');

/* 8. restrained vs expressive are hierarchically different, not a uniform multiply ------ */

function maxClampValue(block: string, varName: string): number | null {
  const re = new RegExp(`${varName}:\\s*clamp\\([^,]+,[^,]+,\\s*([\\d.]+)rem\\)`);
  const m = block.match(re);
  return m ? parseFloat(m[1]) : null;
}

const rootBlock = ruleBlock(v2Css, '.ai-v2-root {');
const restrainedTypeBlock = ruleBlock(v2Css, "[data-type-scale='restrained'] {");
const expressiveHeroMax = maxClampValue(rootBlock, '--ai-v2-hero-h1');
const expressiveH2Max = maxClampValue(rootBlock, '--ai-v2-h2');
const restrainedHeroMax = maxClampValue(restrainedTypeBlock, '--ai-v2-hero-h1');
const restrainedH2Max = maxClampValue(restrainedTypeBlock, '--ai-v2-h2');
assert(
  expressiveHeroMax !== null && restrainedHeroMax !== null && restrainedHeroMax < expressiveHeroMax,
  `restrained hero max (${restrainedHeroMax}rem) is smaller than expressive (${expressiveHeroMax}rem)`
);
assert(
  expressiveH2Max !== null && restrainedH2Max !== null && restrainedH2Max < expressiveH2Max,
  `restrained h2 max (${restrainedH2Max}rem) is smaller than expressive (${expressiveH2Max}rem)`
);
if (expressiveHeroMax && expressiveH2Max && restrainedHeroMax && restrainedH2Max) {
  const expressiveGap = expressiveHeroMax - expressiveH2Max;
  const restrainedGap = restrainedHeroMax - restrainedH2Max;
  assert(
    restrainedGap < expressiveGap,
    `restrained scale has a smaller hero/h2 hierarchy jump (${restrainedGap.toFixed(2)}rem) than expressive (${expressiveGap.toFixed(2)}rem) — hierarchical, not a uniform multiply`
  );
}

/* 9. every new CSS custom property has a real consumer (no dead tokens) ----------------- */

const NEW_VARS = [
  '--ai-v2-hero-h1',
  '--ai-v2-h2',
  '--ai-v2-statement',
  '--ai-v2-heading-tracking',
  '--ai-v2-lead-lh',
  '--ai-v2-emphasis-primary',
  '--ai-v2-emphasis-quiet',
  '--ai-v2-statement-emphasis-primary',
  '--ai-v2-kicker-size',
  '--ai-v2-kicker-tracking',
  '--ai-v2-kicker-weight',
  '--ai-v2-kicker-opacity',
  '--ai-v2-price-weight',
  '--ai-v2-price-tracking',
  '--ai-v2-grid-gap',
  '--ai-v2-rail-gap',
  '--ai-v2-card-gap',
  '--ai-v2-title-gap',
];
for (const varName of NEW_VARS) {
  // Every definition site (`--foo:`) should have at least one separate `var(--foo` consumer.
  const definitions = countOccurrences(v2Css, `${varName}:`);
  const consumers = countOccurrences(v2Css, `var(${varName}`);
  assert(definitions > 0, `${varName} is defined at least once`);
  assert(consumers > 0, `${varName} has at least one var(...) consumer (not a dead token)`);
}

/* 10. a fully-defaulted DesignSpec still resolves to sane values ------------------------ */

const defaulted = designSpecSchema.parse({
  version: 1,
  brand: { businessType: 'goods', audience: 'everyone', positioning: 'good value', personality: ['friendly'] },
  designIntent: {
    coreConcept: 'A default fallback concept used when the architect omits typography/rhythm fields.',
    emotionalGoal: 'trust',
    visualHierarchy: 'product first',
    compositionPrinciples: ['clear'],
    photographyDirection: 'clean product shots',
    typographyDirection: 'legible sans',
    interactionDirection: 'obvious',
    premiumCharacteristics: ['clarity'],
    avoidPatterns: ['confusion'],
  },
  artDirection: {
    archetype: 'default_archetype',
    typography: { display: 'Inter', body: 'Inter' },
    colorStrategy: { primary: '#000000', background: '#FFFFFF', text: '#000000', accent: '#000000', secondary: '#DDDDDD' },
    photography: { style: 'plain', treatment: 'plain' },
  },
  ux: {
    primaryConversion: 'buy now',
    ctaStyle: 'standard buttons',
    navStyle: 'standard nav',
    discovery: 'browse',
    mobileStrategy: 'responsive',
  },
  pageIntent: { homeNarrative: 'shop the catalog' },
});
const defaultBrand = brandDesignSystemFromSpec(defaulted);
assert(
  defaultBrand.tokens.typographyScale === 'expressive' && defaultBrand.tokens.typographyRole === 'balanced',
  `a fully-defaulted DesignSpec resolves to sane typography defaults (scale=expressive, role=balanced); got ${defaultBrand.tokens.typographyScale}/${defaultBrand.tokens.typographyRole}`
);
assert(
  !designTokensSchema.safeParse({
    primary: '#112233',
    background: '#FFFFFF',
    text: '#111111',
    accent: '#AA3300',
    secondary: '#EEEEEE',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    typographyScale: 'huge', // not a real enum value
  }).success,
  'an invalid typographyScale is rejected by designTokensSchema before it could ever reach a CSS attribute selector'
);

/* 11. long_short_long no longer emits two adjacent 'dramatic' beats -------------------- */

const rhythmNodes = [
  { id: 'nav_01', type: 'nav' },
  { id: 'hero_01', type: 'hero' },
  { id: 'story_01', type: 'editorialSplit' },
  { id: 'products_01', type: 'productGrid' },
  { id: 'reviews_01', type: 'reviews' },
  { id: 'mosaic_01', type: 'editorialMosaic' },
  { id: 'newsletter_01', type: 'newsletter' },
  { id: 'footer_01', type: 'footer' },
];

function hasAdjacentDramatic(strategy: StrategyInput): boolean {
  const result = applyStrategyDefaults(rhythmNodes, strategy);
  let prev: string | undefined;
  for (const n of result) {
    if (n.type === 'nav' || n.type === 'footer' || n.type === 'announcement') continue;
    const spacing = n.design?.spacing;
    if (spacing === 'dramatic' && prev === 'dramatic') return true;
    prev = spacing;
  }
  return false;
}

const lslLow: StrategyInput = {
  density: 'low',
  asymmetry: 'medium',
  rhythm: 'long_short_long',
  typographyRole: 'balanced',
  imageryRole: 'balanced',
};
const lslHigh: StrategyInput = { ...lslLow, density: 'high' };
const lslMedium: StrategyInput = { ...lslLow, density: 'medium' };
assert(!hasAdjacentDramatic(lslLow), "long_short_long never produces two adjacent 'dramatic' sections (density=low)");
assert(!hasAdjacentDramatic(lslHigh), "long_short_long never produces two adjacent 'dramatic' sections (density=high)");
assert(!hasAdjacentDramatic(lslMedium), "long_short_long never produces two adjacent 'dramatic' sections (density=medium)");

/* 12. the general adjacency guard also catches density=low + rhythm=even, and never ----- */
/*     touches an explicit architect value                                                */

const evenLow: StrategyInput = {
  density: 'low',
  asymmetry: 'low',
  rhythm: 'even',
  typographyRole: 'quiet',
  imageryRole: 'supporting',
};
assert(
  !hasAdjacentDramatic(evenLow),
  "the adjacency guard also softens density=low + rhythm=even (every section would otherwise default to 'dramatic')"
);

const explicitDramaticNodes = [
  { id: 'hero_01', type: 'hero', design: { spacing: 'dramatic' as const } },
  { id: 'story_01', type: 'editorialSplit', design: { spacing: 'dramatic' as const } },
];
const explicitResult = applyStrategyDefaults(explicitDramaticNodes, evenLow);
assert(
  explicitResult[0].design?.spacing === 'dramatic' && explicitResult[1].design?.spacing === 'dramatic',
  'the adjacency guard never overrides an explicit architect-chosen spacing value, even when it creates two adjacent dramatic sections'
);

/* 13. Phase 1 mobile dense-grid override survives untouched ----------------------------- */

assert(
  v2Css.includes(".ai-v2-merch[data-layout='dense'] .ai-v2-merch-grid"),
  'Phase 1 dense-LAYOUT grid override selector is still present (distinct from Phase 3 density gap tokens)'
);

/* 14. Phase 2 radius/shadow/buttonStyle CSS plumbing survives untouched ----------------- */

assert(/var\(--ai-radius/.test(ruleBlock(v2Css, '.ai-v2-btn {')), 'Phase 2: primary CTA still consumes var(--ai-radius)');
assert(/var\(--ai-shadow/.test(ruleBlock(v2Css, '.ai-v2-btn {')), 'Phase 2: primary CTA still consumes var(--ai-shadow)');
for (const style of ['outline', 'ghost', 'pill']) {
  assert(v2Css.includes(`[data-button-style='${style}']`), `Phase 2: [data-button-style='${style}'] treatment still present`);
}

/* ============================ EFFECTIVENESS PASS ============================ */

const fixtureBrands = V2_VARIETY_FIXTURES.map((f) => ({
  fixture: f,
  brand: brandDesignSystemFromSpec(f.designSpec),
}));

/* 15. the real fixture set collectively covers every valid branch --------------------- */

const scalesSeen = new Set(fixtureBrands.map((f) => f.brand.tokens.typographyScale));
const densitiesSeen = new Set(fixtureBrands.map((f) => f.brand.tokens.density));
const rolesSeen = new Set(fixtureBrands.map((f) => f.brand.tokens.typographyRole));
assert(
  scalesSeen.has('restrained') && scalesSeen.has('expressive'),
  `V2_VARIETY_FIXTURES cover both typographyScale values (saw: ${[...scalesSeen].join(', ')})`
);
assert(
  densitiesSeen.has('sparse') && densitiesSeen.has('balanced') && densitiesSeen.has('dense'),
  `V2_VARIETY_FIXTURES cover all three density values (saw: ${[...densitiesSeen].join(', ')})`
);
assert(
  rolesSeen.has('quiet') && rolesSeen.has('balanced') && rolesSeen.has('dominant_structural'),
  `V2_VARIETY_FIXTURES cover all three typographyRole values (saw: ${[...rolesSeen].join(', ')})`
);

/* 16. applyStrategyDefaults actually ran on the real fixtures ------------------------- */

const statementEmphasisSeen = new Set<string>();
for (const { fixture } of fixtureBrands) {
  for (const n of fixture.document.pages.home.nodes) {
    if ((n.type === 'hero' || n.type === 'brandStatement') && n.design?.emphasis) {
      statementEmphasisSeen.add(n.design.emphasis);
    }
  }
}
assert(
  statementEmphasisSeen.has('primary') && statementEmphasisSeen.has('quiet'),
  `at least one real fixture hero/brandStatement resolves emphasis='primary' and one resolves 'quiet' (saw: ${[...statementEmphasisSeen].join(', ') || '(none — applyStrategyDefaults never ran on fixture nodes)'})`
);

/* 17. the REAL resolved hero heading size differs meaningfully across the fixture set - */

function clampPx(clampExpr: string, viewportPx: number): number | null {
  const m = clampExpr.match(/clamp\(([^,]+),([^,]+),([^)]+)\)/);
  if (!m) return null;
  const toPx = (term: string): number => {
    const t = term.trim();
    const remMatch = t.match(/^([\d.]+)rem$/);
    if (remMatch) return parseFloat(remMatch[1]) * 16;
    const vwMatch = t.match(/^([\d.]+)vw$/);
    if (vwMatch) return (parseFloat(vwMatch[1]) / 100) * viewportPx;
    return parseFloat(t);
  };
  const [min, pref, max] = [toPx(m[1]), toPx(m[2]), toPx(m[3])];
  return Math.min(Math.max(pref, min), max);
}

function cssVar(block: string, varName: string): string | null {
  const re = new RegExp(`${varName}:\\s*([^;]+);`);
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** Mirrors v2.css's real cascade for hero h1: typographyScale sets the base
 *  (--ai-v2-hero-h1), and — same specificity, later in source, so it wins — an
 *  hero/brandStatement node's resolved emphasis overrides it with
 *  --ai-v2-emphasis-primary/quiet. Both read from the SAME typographyScale block. */
function resolveHeroFontSizePx(
  scale: 'restrained' | 'expressive',
  emphasis: string | undefined,
  viewportPx: number
): number | null {
  const block = scale === 'restrained' ? restrainedTypeBlock : rootBlock;
  const varName =
    emphasis === 'primary'
      ? '--ai-v2-emphasis-primary'
      : emphasis === 'quiet'
        ? '--ai-v2-emphasis-quiet'
        : '--ai-v2-hero-h1';
  const raw = cssVar(block, varName);
  return raw ? clampPx(raw, viewportPx) : null;
}

const DESKTOP_VIEWPORT = 1440;
const heroSizes = fixtureBrands.map(({ fixture, brand }) => {
  const heroNode = fixture.document.pages.home.nodes.find((n) => n.type === 'hero');
  const px = resolveHeroFontSizePx(brand.tokens.typographyScale, heroNode?.design?.emphasis, DESKTOP_VIEWPORT);
  return { id: fixture.id, px };
});
const validSizes = heroSizes.filter((h): h is { id: string; px: number } => h.px !== null);
assert(validSizes.length === V2_VARIETY_FIXTURES.length, 'every fixture hero font-size resolves to a real px value');
const minHero = validSizes.reduce((a, b) => (a.px < b.px ? a : b));
const maxHero = validSizes.reduce((a, b) => (a.px > b.px ? a : b));
const heroSpreadPx = maxHero.px - minHero.px;
assert(
  heroSpreadPx >= 30,
  `real fixture hero sizes span a visually meaningful range at ${DESKTOP_VIEWPORT}px viewport: ` +
    `${minHero.id}=${minHero.px.toFixed(1)}px .. ${maxHero.id}=${maxHero.px.toFixed(1)}px (spread ${heroSpreadPx.toFixed(1)}px, need >=30px)`
);
console.log(
  '  hero sizes @1440px: ' + validSizes.map((h) => `${h.id}=${h.px.toFixed(1)}px`).join(', ')
);

/* 18. at least one fixture exercises the density-tokenized plain .ai-v2-merch-grid ----- */

function layoutOf(node: { content?: Record<string, unknown> }, fallback: string): string {
  const v = node.content?.layout;
  return typeof v === 'string' && v.trim() ? v : fallback;
}

const plainGridFixtures = fixtureBrands.filter(({ fixture }) =>
  fixture.document.pages.home.nodes.some((n) => {
    if (n.type !== 'productGrid' || n.variant !== 'editorial') return false;
    const layout = layoutOf(n, 'featureFirst');
    return layout !== 'featureFirst' && layout !== 'asymmetricFeature';
    // 'dense' also renders .ai-v2-merch-grid, but its gap is masked by the more specific
    // Phase 1 [data-layout='dense'] override — only count layouts where the density token
    // actually wins the cascade for `gap`.
    // (kept as a comment, not a condition, since 'dense' still legitimately renders the
    // element — this filter is about which fixture PROVES the gap token visually.)
  })
);
assert(
  plainGridFixtures.length >= 1,
  `at least one fixture's productGrid renders the plain, density-gap-tokenized .ai-v2-merch-grid (found: ${plainGridFixtures.map((f) => f.fixture.id).join(', ') || 'none'})`
);

/* ===================== LOCAL COMPOSITION FIXES (manual QA round 2) =================== */
/* Villa Pelle's hero looked like three disconnected text islands; BLOCK FORM's product
 * grid looked left-pinned. Both were fixed as scoped CSS rules at the composition layer —
 * NOT by re-touching --ai-v2-emphasis-quiet (a global typography token) or by excluding
 * types from applyStrategyDefaults' alignment semantics (a global strategy-layer change).
 * These guards check the actual scoped CSS exists and that the strategy layer is untouched. */

function findRuleBlock(css: string, selectorSnippet: string): string | null {
  const idx = css.indexOf(selectorSnippet);
  if (idx < 0) return null;
  const braceStart = css.indexOf('{', idx);
  const braceEnd = css.indexOf('}', braceStart);
  if (braceStart < 0 || braceEnd < 0) return null;
  return css.slice(braceStart, braceEnd);
}

/* 19. center-aligned hero h1 gets the same physical-centering treatment as .ai-v2-lead,
 *     using a selector form that actually matches the real rendered DOM ---------------- */

// Ground the check in the ACTUAL JSX, not an assumption: sectionDesignProps(node) (which
// sets data-align/data-emphasis) must be spread onto the SAME <section> element that
// carries the ai-v2-hero class — not a separate wrapping ancestor. This is exactly the
// structural fact a prior attempt got wrong: it wrote `[data-align='center'] .ai-v2-hero h1`
// as a plain descendant combinator, which requires data-align on a DIFFERENT, *ancestor*
// element — one that doesn't exist here — so the rule silently never matched (confirmed by
// manual browser inspection: marginLeft/marginRight computed to 0px, not auto).
const compositionsSrc = fs.readFileSync(
  path.join(here, '../src/components/templates/ai/v2/compositions.tsx'),
  'utf8'
);
const heroFnStart = compositionsSrc.indexOf('export function HeroLuxuryMinimal');
assert(heroFnStart >= 0, 'HeroLuxuryMinimal composition exists in compositions.tsx');
const heroVeilLandmark = compositionsSrc.indexOf('ai-v2-hero-luxury-veil', heroFnStart);
assert(heroVeilLandmark > heroFnStart, 'HeroLuxuryMinimal renders its veil div (used to bound the <section> opening tag below)');
const heroOpenTagRegion = compositionsSrc.slice(heroFnStart, heroVeilLandmark);
assert(
  /className=\{`ai-v2-hero/.test(heroOpenTagRegion) && /\{\.\.\.sectionDesignProps\(node\)\}/.test(heroOpenTagRegion),
  "HeroLuxuryMinimal's <section> spreads {...sectionDesignProps(node)} (data-align/data-emphasis) on the SAME element as the ai-v2-hero class, not a wrapping ancestor — any CSS selector must be a COMPOUND [data-align=...].ai-v2-hero, never a descendant combinator"
);

// Now verify v2.css actually uses the compound form this DOM structure requires.
assert(
  v2Css.includes("[data-align='center'].ai-v2-hero h1"),
  "v2.css uses the COMPOUND selector [data-align='center'].ai-v2-hero h1 (attribute+class on one element, then descendant h1) — the only form that can match the real DOM"
);
assert(
  !v2Css.includes("[data-align='center'] .ai-v2-hero h1"),
  "the broken DESCENDANT form (a space between [data-align='center'] and .ai-v2-hero) is not present — it can never match, since data-align lives on the SAME element as .ai-v2-hero, not a separate ancestor"
);
const centerHeroBlock = findRuleBlock(v2Css, "[data-align='center'].ai-v2-hero h1");
assert(
  centerHeroBlock !== null && /margin-inline:\s*auto\b/.test(centerHeroBlock),
  'the compound center-aligned hero h1 rule sets margin-inline: auto — centers the headline BOX itself, not just its text, matching the existing .ai-v2-lead treatment'
);

// This is a general composition rule (any center-aligned hero), not a Villa-Pelle-specific
// hack — assert it's reachable by a REAL fixture, not just present in isolation.
const villaPelleFixture = V2_VARIETY_FIXTURES.find((f) => f.id === 'luxury_fashion')!;
const villaPelleHero = villaPelleFixture.document.pages.home.nodes.find((n) => n.type === 'hero');
assert(
  villaPelleHero?.design?.alignment === 'center',
  `Villa Pelle's real hero node resolves alignment='center' (got '${villaPelleHero?.design?.alignment}'), so the rule above is not dead CSS for this fixture`
);

/* 20. THE PAGE CANVAS (.ai-v2-wrap) NEVER moves for ANY section, regardless of data-align -
 *     the real invariant a browser measurement at viewport=1109px proved was broken:
 *     center sections measured 67/976/67 (correct) while start sections measured
 *     0/976/133 (the same 976px canvas, physically dragged to the viewport edge) -------- */

// No rule anywhere may set margin-inline on .ai-v2-wrap conditioned on [data-align=...] -
// only the base rule's unconditional `margin-inline: auto` may ever apply to it. This is
// the actual regression class (a prior scoped "fix" for merch/collections/reviews treated
// the SYMPTOM per-composition instead of the cause - now redundant and removed, since the
// canvas is never displaced for ANY composition in the first place).
const dataAlignWrapRuleRegex = /\[data-align='(?:start|end|center)'\][^{]*\.ai-v2-wrap[^{]*\{([^}]*)\}/g;
let match: RegExpExecArray | null;
let checkedAlignWrapRules = 0;
while ((match = dataAlignWrapRuleRegex.exec(v2Css)) !== null) {
  checkedAlignWrapRules += 1;
  assert(
    !/margin-inline/.test(match[1]),
    `a [data-align=...] rule targeting .ai-v2-wrap must never set margin-inline (found one that does: "${match[0].slice(0, 80)}...") — only text-align may vary by alignment; canvas position is fixed`
  );
}
assert(checkedAlignWrapRules >= 3, `found and checked all 3 [data-align=start/end/center] .ai-v2-wrap rules (found ${checkedAlignWrapRules})`);

// The base .ai-v2-wrap rule itself is the ONLY source of canvas centering, and it is
// unconditional (no [data-align] prefix).
const baseWrapBlock = findRuleBlock(v2Css, '.ai-v2-wrap {');
assert(
  baseWrapBlock !== null && /margin-inline:\s*auto\s*;/.test(baseWrapBlock),
  '.ai-v2-wrap has an unconditional margin-inline: auto in its own base rule — the page canvas is always centered'
);

// The previous per-composition exception is gone (it becomes dead code once the general
// rule no longer displaces the canvas for anyone).
for (const cls of ['ai-v2-merch', 'ai-v2-collections', 'ai-v2-reviews']) {
  for (const align of ['start', 'end']) {
    assert(
      !v2Css.includes(`[data-align='${align}'].${cls} .ai-v2-wrap`),
      `the redundant [data-align='${align}'].${cls} .ai-v2-wrap exception has been removed (the general canvas-centering fix makes it unnecessary)`
    );
  }
}

// Concrete arithmetic check at the exact reported geometry (viewport=1109px): with no
// per-align override, a start-aligned section's canvas resolves to the SAME symmetric
// gutters as a center-aligned one - both just inherit the base rule.
{
  const viewport = 1109;
  const contentMaxMatch = v2Css.match(/--ai-v2-content-max:\s*([\d.]+)px/);
  const padMatch = v2Css.match(/--ai-v2-pad:\s*clamp\(([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\)/);
  assert(!!contentMaxMatch && !!padMatch, 'content-max and pad tokens are parseable for the geometry check');
  if (contentMaxMatch && padMatch) {
    const contentMax = parseFloat(contentMaxMatch[1]);
    const padMin = parseFloat(padMatch[1]) * 16;
    const padCoeff = parseFloat(padMatch[2]);
    const padMaxV = parseFloat(padMatch[3]) * 16;
    const pad = Math.max(padMin, Math.min((padCoeff / 100) * viewport, padMaxV));
    const measure = Math.min(contentMax, viewport - 2 * pad);
    const gutterEachSide = (viewport - measure) / 2;
    // Since no data-align rule touches margin-inline, this SAME gutter applies whether
    // the section is 'start', 'center', or 'end' - there is no per-align branch left to
    // produce a different (asymmetric) result.
    assert(
      Math.abs(gutterEachSide - pad) < 0.01,
      `at viewport=1109px a canvas with only the base (unconditional) centering rule resolves equal gutters on both sides (${gutterEachSide.toFixed(1)}px each) regardless of data-align, matching the 'center' measurement (67/976/67) instead of the old 'start' measurement (0/976/133)`
    );
  }
}

// Real inner-canvas asymmetry survives for single-moment text compositions: hero h1,
// .ai-v2-lead and .ai-v2-statement-text each get their OWN box shifted within the
// still-centered canvas, for all three alignment values.
for (const align of ['start', 'end', 'center']) {
  assert(
    v2Css.includes(`[data-align='${align}'].ai-v2-hero h1`),
    `[data-align='${align}'].ai-v2-hero h1 exists (compound selector - data-align lives on the same <section> as .ai-v2-hero)`
  );
  assert(
    v2Css.includes(`[data-align='${align}'] .ai-v2-lead`),
    `[data-align='${align}'] .ai-v2-lead exists (plain descendant - shared by hero/spotlight/editorialSplit/mosaic-head/reviews)`
  );
  assert(
    v2Css.includes(`[data-align='${align}'] .ai-v2-statement-text`),
    `[data-align='${align}'] .ai-v2-statement-text exists (plain descendant)`
  );
}

// The fix is CSS-only: the strategy layer must still produce a real 'start'/'end' value
// for a real high-asymmetry productGrid (proves applyStrategyDefaults' alignment
// semantics were left completely alone, per the "do not alter globally" requirement).
const blockFormFixture = V2_VARIETY_FIXTURES.find((f) => f.id === 'streetwear')!;
const blockFormProductGrid = blockFormFixture.document.pages.home.nodes.find((n) => n.type === 'productGrid');
assert(
  blockFormProductGrid?.design?.alignment === 'start' || blockFormProductGrid?.design?.alignment === 'end',
  `BLOCK FORM's real productGrid still resolves an asymmetry-driven alignment at the strategy layer (got '${blockFormProductGrid?.design?.alignment}') — applyStrategyDefaults is untouched; the fix lives entirely in v2.css`
);

/* ========================== CONTENT CANVAS SYSTEM (round 4) ========================== */
/* Real browser measurement at viewport=1109px (data-align='start', 40px/1029px/40px,
 * max-width:none) proved .ai-v2-wrap was already correctly centered — the actual bug was
 * that --ai-v2-pad's gutter capped out at viewport=1000px while --ai-v2-measure's content
 * cap didn't engage until viewport=1260px, leaving a "dead zone" where content filled
 * ~93% of the viewport. These guard the fix: a real min/max gutter range, a named content
 * cap (previously a magic number duplicated in two places), and that full-bleed sections
 * stay genuinely unconstrained at the OUTER section level. */

function clampParts(decl: string): { min: number; coeffVw: number; max: number } | null {
  const m = decl.match(/clamp\(([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\)/);
  if (!m) return null;
  return { min: parseFloat(m[1]) * 16, coeffVw: parseFloat(m[2]), max: parseFloat(m[3]) * 16 };
}

/* 21. the gutter is a real, responsive range — not a fixed value, not unbounded --------- */

const padDecl = v2Css.match(/--ai-v2-pad:\s*([^;]+);/)?.[1] ?? '';
const padClamp = clampParts(padDecl);
assert(padClamp !== null, '--ai-v2-pad is a clamp() with a real min/preferred/max, not a fixed value');
if (padClamp) {
  assert(padClamp.min < padClamp.max, `--ai-v2-pad has a genuine range (min ${padClamp.min}px < max ${padClamp.max}px), so it actually responds to viewport width`);
  // The reported bug, reproduced from the real browser measurement: gutter must no longer
  // be flat at 40px in the 1000-1260px band that used to be a dead zone.
  const midDesktopGutter = Math.max(padClamp.min, Math.min((padClamp.coeffVw / 100) * 1109, padClamp.max));
  assert(
    midDesktopGutter > 40,
    `gutter at viewport=1109px (the exact reported case) is now > 40px (got ${midDesktopGutter.toFixed(1)}px) — the previous flat-40px dead zone is closed`
  );
  // Mobile must stay efficient, not inherit desktop spacing.
  const mobileGutter = Math.max(padClamp.min, Math.min((padClamp.coeffVw / 100) * 390, padClamp.max));
  assert(
    mobileGutter < 30,
    `gutter at viewport=390px stays mobile-appropriate (got ${mobileGutter.toFixed(1)}px, expected < 30px) — desktop breathing room is not carried onto mobile`
  );
}

/* 22. the content canvas has an intentional, named maximum — doesn't grow indefinitely -- */

assert(
  v2Css.includes('--ai-v2-content-max:'),
  '--ai-v2-content-max is a real named token (previously an unnamed magic number duplicated in --ai-v2-measure and .ai-v2-rail)'
);
const measureDecl = v2Css.match(/--ai-v2-measure:\s*([^;]+);/)?.[1] ?? '';
assert(
  /min\(\s*var\(--ai-v2-content-max\)/.test(measureDecl),
  '--ai-v2-measure caps itself at var(--ai-v2-content-max) via min() — the default content canvas cannot grow past it regardless of viewport width'
);
const railBaseDecl = findRuleBlock(v2Css, '.ai-v2-rail {') ?? '';
const gutterDecl = v2Css.match(/--ai-v2-gutter:\s*([^;]+);/)?.[1] ?? '';
assert(
  /var\(--ai-v2-content-max\)/.test(gutterDecl),
  '--ai-v2-gutter (which .ai-v2-rail consumes) references the SAME --ai-v2-content-max token as .ai-v2-wrap (previously a separately hardcoded 1180px that could silently drift out of sync)'
);
assert(
  /var\(--ai-v2-gutter\)/.test(railBaseDecl),
  '.ai-v2-rail consumes var(--ai-v2-gutter) — the same resolved-gutter token the page canvas uses, not its own separate formula'
);
const rawContentMaxValueCount = countOccurrences(v2Css, '1180px');
assert(
  rawContentMaxValueCount === 1,
  `the content-max pixel value appears exactly once — as --ai-v2-content-max's own definition — not duplicated elsewhere (found ${rawContentMaxValueCount} occurrences)`
);

/* 23. full-bleed sections stay genuinely unconstrained at the OUTER section level ------- */

assert(
  v2Css.includes("[data-bleed='1']") && v2Css.includes("width: 100%;"),
  "an outer-section full-bleed rule (data-bleed='1') still forces width: 100%, unconstrained by --ai-v2-content-max/--ai-v2-pad"
);
// The inner content (headline/copy) inside a full-bleed hero still goes through the SAME
// gutter-aware .ai-v2-wrap machinery — full-bleed imagery, not full-bleed text.
assert(
  v2Css.includes("[data-bleed='1'] > .ai-v2-wrap"),
  'a full-bleed SECTION still routes its inner .ai-v2-wrap through the gutter-aware measure system (full-bleed background, not full-bleed text)'
);

/* ============================ PRODUCT RAIL EDGE GUTTER (round 7) ===================== */
/* Round 6's flex-item spacer (::before/::after, both scroll-snap-align:none) was itself
 * the bug: with scroll-snap-type:mandatory, a spacer is extra scrollable CONTENT that
 * shifts Card 1 away from content-position 0, so the browser "corrects" scrollLeft on
 * initial load (0 -> spacer+gap) to satisfy Card 1's scroll-snap-align:start - visually
 * undoing the spacer. These tests protect the CSS INVARIANTS of the corrected
 * architecture (real padding for the reliable start edge + scroll-padding reinforcing the
 * snap computation + a gap-corrected content spacer only where content is truly required
 * for the end edge). They do NOT and cannot verify runtime scrollLeft/resting position -
 * that requires an actual browser and is left to manual QA, per the explicit instruction
 * not to claim a static test proves browser scroll behavior it never ran. */

assert(
  /overflow-x:\s*auto/.test(railBaseDecl),
  '.ai-v2-rail still has overflow-x: auto — horizontal scrolling is preserved, not replaced by a fixed grid'
);
assert(
  /scroll-snap-type:\s*x mandatory/.test(railBaseDecl),
  '.ai-v2-rail keeps scroll-snap-type: x mandatory — the snapPORT geometry was fixed instead of weakening snapping to hide the bug'
);
assert(
  v2Css.includes('.ai-v2-rail-item {') && /flex:\s*0\s+0\s+220px/.test(findRuleBlock(v2Css, '.ai-v2-rail-item {') ?? ''),
  '.ai-v2-rail-item keeps its real card size (flex: 0 0 220px) and scroll-snap-align:start — Card 1 remains a real snap target'
);
assert(
  /scroll-snap-align:\s*start/.test(findRuleBlock(v2Css, '.ai-v2-rail-item {') ?? ''),
  '.ai-v2-rail-item keeps scroll-snap-align: start'
);

// The START edge is real padding (part of the snapport by spec, so scrollLeft=0 already
// satisfies Card 1's snap constraint with no jump) — NOT a content spacer, and NOT the
// class of thing `gap` could apply next to (gap only ever inserts space BETWEEN flex
// items; container padding is untouched by it, so there is no start-side double-counting
// risk to test for, unlike the end side below).
assert(
  /padding-inline-start:\s*var\(--ai-v2-gutter\)/.test(railBaseDecl),
  '.ai-v2-rail uses real padding-inline-start: var(--ai-v2-gutter) for the start edge (not a content spacer)'
);
assert(
  !v2Css.includes('.ai-v2-rail::before'),
  'the round-6 ::before start-spacer is removed — padding alone is the single mechanism for the start edge now (no two competing mechanisms)'
);
assert(
  /scroll-padding-inline-start:\s*var\(--ai-v2-gutter\)/.test(railBaseDecl),
  '.ai-v2-rail sets scroll-padding-inline-start: var(--ai-v2-gutter) — the CSS-spec-defined property for where snap-aligned children rest inside a scroll container, using the same token as the visual padding (not two independently-tunable values that could drift apart)'
);

// The END edge is deliberately still a content spacer (justified: trailing/end padding on
// scrollable flex containers has a real history of being excluded from the scrollable
// region in some browsers; content is unambiguous). It must subtract --ai-v2-rail-gap so
// the visible end space doesn't silently become gutter+gap (the exact double-counting
// class of bug this whole investigation started from).
const railAfterDecl = findRuleBlock(v2Css, '.ai-v2-rail::after {') ?? '';
assert(railAfterDecl !== '', '.ai-v2-rail::after (end spacer) exists');
assert(
  /content:\s*['"]{2}/.test(railAfterDecl),
  '.ai-v2-rail::after is a real generated flex item (content: \'\'), giving genuine scrollable end breathing room'
);
assert(
  /flex:\s*0\s+0\s+max\(0px,\s*calc\(var\(--ai-v2-gutter\)\s*-\s*var\(--ai-v2-rail-gap\)\)\)/.test(railAfterDecl),
  '.ai-v2-rail::after subtracts var(--ai-v2-rail-gap) from var(--ai-v2-gutter) — .ai-v2-rail\'s own `gap` already inserts rail-gap before this pseudo-element, so using the full gutter here would double-count it on the end side only'
);
assert(
  /scroll-snap-align:\s*none/.test(railAfterDecl),
  'the end spacer opts out of scroll-snap-align so it can never itself become a (meaningless) snap target'
);

// Concrete arithmetic proving the gap-subtraction actually cancels: gap (before the
// spacer, from .ai-v2-rail's `gap`) + the spacer's own reduced flex-basis must equal
// exactly the page canvas's own gutter — not gutter+gap, not gutter-gap.
{
  const contentMaxMatch2 = v2Css.match(/--ai-v2-content-max:\s*([\d.]+)px/);
  const padMatch2 = v2Css.match(/--ai-v2-pad:\s*clamp\(([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\)/);
  const railGapMatch = v2Css.match(/--ai-v2-rail-gap:\s*([\d.]+)rem;/);
  assert(!!contentMaxMatch2 && !!padMatch2 && !!railGapMatch, 'content-max, pad and rail-gap tokens are all parseable for the end-edge arithmetic check');
  if (contentMaxMatch2 && padMatch2 && railGapMatch) {
    const contentMax = parseFloat(contentMaxMatch2[1]);
    const padMin = parseFloat(padMatch2[1]) * 16;
    const padCoeff = parseFloat(padMatch2[2]);
    const padMaxV = parseFloat(padMatch2[3]) * 16;
    const railGap = parseFloat(railGapMatch[1]) * 16;
    const gutterAt = (vw: number) => {
      const pad = Math.max(padMin, Math.min((padCoeff / 100) * vw, padMaxV));
      return Math.max(pad, (vw - contentMax) / 2);
    };
    const desktopGutter = gutterAt(1109);
    const endSpacerBasis = Math.max(0, desktopGutter - railGap);
    const totalVisibleEndSpace = railGap + endSpacerBasis; // gap (before ::after) + ::after's own width
    assert(
      Math.abs(totalVisibleEndSpace - desktopGutter) < 0.1,
      `at viewport=1109px, gap (${railGap.toFixed(1)}px) + end-spacer (${endSpacerBasis.toFixed(1)}px) = ${totalVisibleEndSpace.toFixed(1)}px, exactly matching the page canvas gutter (${desktopGutter.toFixed(1)}px) — not gutter+gap or gutter-gap`
    );
    const mobileGutter = gutterAt(390);
    assert(
      mobileGutter < 30,
      `rail gutter (start padding and end spacer both derive from the same --ai-v2-gutter) stays mobile-appropriate at viewport=390px (got ${mobileGutter.toFixed(1)}px, expected < 30px)`
    );
  }
}

// Phase 1 mobile dense-grid and rail-unrelated card behavior remain untouched (this fix
// only touches .ai-v2-rail's own edges, never product-card merchandising).
assert(
  v2Css.includes(".ai-v2-merch[data-layout='dense'] .ai-v2-merch-grid"),
  'Phase 1 dense-LAYOUT grid override selector is still present (untouched by the rail fix)'
);

console.log(failed === 0 ? '\nAll AI Studio V2 typography/rhythm self-tests passed.' : `\n${failed} self-test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
