#!/usr/bin/env -S npx tsx
/**
 * Phase 5C.2 — density coherence self-test (no vitest, no LLM required).
 * Run: npx --yes tsx scripts/ai-studio-v5c2-density-coherence-selftest.ts
 *
 * Phase 5C.1's audit found creativeStrategy.density (macro: composition/page density,
 * low|medium|high) and artDirection.density (micro: component-internal density,
 * sparse|balanced|dense) are independently generated with no reconciliation, so a live
 * spec could pair them at opposite extremes (low+dense, high+sparse) — a genuine
 * accidental contradiction, unlike the other 7 pairings which are legitimate macro/micro
 * contrast. Phase 5C.2 adds reconcileArtDirectionDensity (creativeStrategy.ts) and wires
 * it into brandDesignSystemFromSpec (designSpecSchema.ts) — the single boundary every
 * path (Deno edge function, client fixtures/showcase/generate-lab, publish) already
 * calls to derive brand.tokens.density.
 *
 * Covers:
 *  1. Full 3x3 reconciliation table (pure helper, direct)
 *  2. Pure helper / boundary does not mutate its inputs
 *  3. Non-density DesignSpec/BrandDesignSystem fields are preserved
 *  4. All 5 current fixtures pass through unchanged (already coherent)
 *  5. Missing-creativeStrategy fallback (inferCreativeStrategy) still resolves safely
 *  6. creativeStrategy.density itself (consumed by Phase 5B layout defaults) is never
 *     altered by the artDirection-side reconciliation
 *  7. No schema/enum drift (DENSITIES, artDirection.density enum unchanged)
 */
import { z } from 'zod';
import { buildDesignSpecSchemas } from '../shared/ai-studio-v2/designSpecSchema.ts';
import {
  DENSITIES,
  ensureCreativeStrategy,
  reconcileArtDirectionDensity,
  type ComponentDensity,
  type Density,
} from '../shared/ai-studio-v2/creativeStrategy.ts';
import { productGridEditorialLayoutDefault } from '../shared/ai-studio-v2/strategyDefaults.ts';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures.ts';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const { designSpecSchema, brandDesignSystemFromSpec } = buildDesignSpecSchemas(z);

/* ── 1. Full 3x3 reconciliation table ─────────────────────────────────── */

const EXPECTED: Record<Density, Record<ComponentDensity, ComponentDensity>> = {
  low: { sparse: 'sparse', balanced: 'balanced', dense: 'sparse' },
  medium: { sparse: 'sparse', balanced: 'balanced', dense: 'dense' },
  high: { sparse: 'dense', balanced: 'balanced', dense: 'dense' },
};

for (const compositionDensity of DENSITIES) {
  for (const componentDensity of ['sparse', 'balanced', 'dense'] as const) {
    const expected = EXPECTED[compositionDensity][componentDensity];
    const actual = reconcileArtDirectionDensity(compositionDensity, componentDensity);
    assert(
      actual === expected,
      `reconcileArtDirectionDensity(${compositionDensity}, ${componentDensity}) === ${expected} (got ${actual})`
    );
  }
}

/* ── 2. Purity — no mutation of inputs, at the helper AND the boundary ── */

const frozenComposition: Density = 'low';
const frozenComponent: ComponentDensity = 'dense';
reconcileArtDirectionDensity(frozenComposition, frozenComponent);
assert(frozenComposition === 'low' && frozenComponent === 'dense', 'helper does not reassign/mutate its primitive inputs');

function minimalSpec(overrides: {
  density?: ComponentDensity;
  creativeStrategy?: Record<string, unknown>;
} = {}) {
  return designSpecSchema.parse({
    version: 1,
    brand: {
      businessType: 'test goods',
      audience: 'test audience',
      positioning: 'test positioning',
      personality: ['test'],
    },
    designIntent: {
      coreConcept: 'Test concept for Phase 5C.2 density-coherence selftest coverage, not a real brand.',
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
      typography: { display: 'Playfair Display', body: 'Inter', scale: 'expressive' },
      colorStrategy: {
        primary: '#112233',
        background: '#FFFFFF',
        text: '#111111',
        accent: '#AA3300',
        secondary: '#EEEEEE',
      },
      photography: { style: 'studio', treatment: 'clean' },
      ...(overrides.density ? { density: overrides.density } : {}),
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

function strategyWithDensity(density: Density) {
  return {
    pageComposition: 'editorial_journey',
    heroPhilosophy: 'atmosphere_first',
    commerceEntry: 'mid',
    commerceModel: 'flagship_then_rail',
    rhythm: 'even',
    density,
    asymmetry: 'medium',
    typographyRole: 'balanced',
    imageryRole: 'balanced',
    navigationBehavior: 'solid_compact',
    experimentationLevel: 'medium',
    distinctivenessBrief: 'Avoid a generic ecommerce spine for this Phase 5C.2 selftest fixture spec.',
  };
}

const oppositeExtremeSpec = minimalSpec({
  density: 'dense',
  creativeStrategy: strategyWithDensity('low'),
});
const beforeJson = JSON.stringify(oppositeExtremeSpec);
const brand = brandDesignSystemFromSpec(oppositeExtremeSpec);
const afterJson = JSON.stringify(oppositeExtremeSpec);
assert(beforeJson === afterJson, 'brandDesignSystemFromSpec does not mutate the DesignSpec it reconciles from');
assert(oppositeExtremeSpec.artDirection.density === 'dense', 'the persisted spec keeps its originally-authored artDirection.density (only the derived brand token is reconciled)');
assert(brand.tokens.density === 'sparse', 'low+dense repairs to sparse in the derived BrandDesignSystem');

/* ── 3. Non-density fields preserved ─────────────────────────────────── */

assert(brand.tokens.primary === '#112233', 'non-density token (primary color) passes through unchanged');
assert(brand.tokens.headingFont === 'Playfair Display', 'non-density token (heading font) passes through unchanged');
assert(brand.archetype === 'test_archetype', 'non-token field (archetype) passes through unchanged');
assert(brand.intentSummary === oppositeExtremeSpec.designIntent.coreConcept, 'intentSummary passes through unchanged');

/* ── 4. All 5 current fixtures pass through unchanged ───────────────── */

const FIXTURE_NAMES = ['Villa Pelle', 'Lumen Lab', 'BLOCK FORM', 'Auric', 'Hearth & Grove'];
V2_VARIETY_FIXTURES.forEach((fixture, i) => {
  const rawDensity = fixture.designSpec.artDirection.density;
  const fixtureBrand = brandDesignSystemFromSpec(fixture.designSpec);
  assert(
    fixtureBrand.tokens.density === rawDensity,
    `fixture "${FIXTURE_NAMES[i] ?? i}" (artDirection.density=${rawDensity}, creativeStrategy.density=${fixture.designSpec.creativeStrategy?.density}) is unchanged by reconciliation`
  );
});

/* ── 5. Missing-creativeStrategy fallback still resolves safely ─────── */

const noStrategySpec = minimalSpec({ density: 'dense' }); // artDirection.density='dense', no creativeStrategy at all
assert(!('creativeStrategy' in noStrategySpec) || noStrategySpec.creativeStrategy === undefined, 'setup: spec genuinely has no creativeStrategy');
const inferred = ensureCreativeStrategy(noStrategySpec);
assert(inferred.density === 'high', 'inferCreativeStrategy derives density=high from artDirection.density=dense (same tier, by construction)');
const noStrategyBrand = brandDesignSystemFromSpec(noStrategySpec);
assert(noStrategyBrand.tokens.density === 'dense', 'reconciliation is a safe no-op when creativeStrategy is inferred from the same artDirection.density it is then checked against');

/* ── 6. creativeStrategy.density itself is never altered ────────────── */

const strategyDensityOnly = ensureCreativeStrategy(oppositeExtremeSpec);
assert(strategyDensityOnly.density === 'low', 'creativeStrategy.density is untouched by the artDirection-side reconciliation (still the authored macro value)');
assert(
  productGridEditorialLayoutDefault({ density: strategyDensityOnly.density, asymmetry: 'medium' }) ===
    productGridEditorialLayoutDefault({ density: 'low', asymmetry: 'medium' }),
  'Phase 5B layout defaults (productGridEditorialLayoutDefault) still receive the unreconciled creativeStrategy.density value'
);

/* ── 7. No schema/enum drift ──────────────────────────────────────────── */

assert(JSON.stringify(DENSITIES) === JSON.stringify(['low', 'medium', 'high']), 'creativeStrategy DENSITIES enum unchanged');
for (const d of ['sparse', 'balanced', 'dense'] as const) {
  assert(designSpecSchema.safeParse({ ...minimalSpec(), artDirection: { ...minimalSpec().artDirection, density: d } }).success, `artDirection.density still accepts '${d}'`);
}
assert(!designSpecSchema.safeParse({ ...minimalSpec(), artDirection: { ...minimalSpec().artDirection, density: 'medium' } }).success, 'artDirection.density still rejects a foreign (creativeStrategy-shaped) value — no enum cross-contamination');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nPhase 5C.2 density-coherence self-tests passed.');
