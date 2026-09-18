#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — expressiveness foundation self-test (no vitest, no LLM required).
 * Run: npx --yes tsx scripts/ai-studio-v2-expressiveness-selftest.ts
 *
 * Covers the "AI Studio V2 — Visual Expressiveness Foundation" phase AND its pre-commit
 * adversarial-review fix pass:
 *  1. Registry validity (new entries resolve, registry <-> siteTree enum stay in sync)
 *  2. Knob schema still accepts every design field applyStrategyDefaults/
 *     normalizeDesignSemantics write
 *  3. creativeStrategy -> design-knob divergence (two different strategies must NOT
 *     collapse into the same fingerprint)
 *  4. normalizeDesignSemantics resolves ONLY the one remaining structural CSS
 *     contradiction (fullBleed + narrow measure) and leaves every other combination -
 *     including the two previously "resolved" ones - alone
 *  5. content.layout validation: valid values accepted, typos/hallucinated values
 *     rejected, at both the shared-helper level and through SiteOps
 *  6. responsive.mobile.variant validation: cross-type values rejected by SiteOps, and
 *     the runtime fallback keeps the desktop variant instead of the registry's own
 *     type-only fallback silently "succeeding"
 *  7. Explicit architect choices survive applyStrategyDefaults -> normalizeDesignSemantics
 *  8. A separate expressiveness fingerprint proves divergent creative directions produce
 *     divergent renderer instructions (not a replacement for varietyFingerprint or for
 *     visual QA)
 *  9. Backward compatibility: an old-shaped document (no content.layout, no responsive
 *     overrides, only the original 18 compositions) still parses and resolves cleanly
 * 10. Composition-catalog drift guard: compositionCatalog.ts (client prompt/validation
 *     catalog) stays in sync with the registered (type,variant) vocabulary and with every
 *     documented content.layout mode - this is the exact class of drift ("new variant
 *     added everywhere importable, forgotten in one more copy") found in the adversarial
 *     review's follow-up pass. The two Deno-only vocabulary copies (aiStudioV2.ts,
 *     aiStudioV2Critique.ts) can't be `import`ed into this Node test process - they pull
 *     in a `https://esm.sh/zod` remote specifier Node can't resolve - and centralizing
 *     them into one importable module is out of scope for this patch, so those two get a
 *     narrow text-presence guard instead (token presence only, not source parsing).
 * 11. Phase 4A — editorialSplit content.layout defaults: applyLayoutDefaults' 3 new layout
 *     values are valid/reachable and reject typos exactly like existing layouts; explicit
 *     content.layout always wins over the strategy-derived default; two materially
 *     different creativeStrategy inputs (typographyRole/imageryRole) resolve to two
 *     different defaults; the renderer source actually branches per layout with distinct
 *     structural class names, not just a `data-layout` attribute nothing reads (the
 *     newsletter/quiet bug class the Phase 4 audit found); legacy nodes with no
 *     content.layout at all are untouched by applyLayoutDefaults.
 * 12. Phase 4B — productSpotlight and brandStatement content.layout defaults: the same
 *     five checks as #11, applied to both sections' new layout grammars
 *     (feature|imageDominant|structuredFeature and centered|splitStatement|anchoredLarge).
 * 13. Phase 4C — newsletter content.layout defaults: the same checks as #11/#12, applied
 *     to statement|split|campaign, plus a check that the submit form (email input, label,
 *     autoComplete, submit button, preventDefault handler) is the SAME shared JSX reused
 *     across every layout, not reimplemented per branch.
 * 14. Phase 4D — collections/testimonials/reviews REFINEMENT (not new layout values):
 *     - collections/testimonials keep their pre-existing editorial|stacked and
 *       quote|imageQuote catalog entries unchanged; only the CHOICE between them (via
 *       asymmetry / imageryRole) and internal presentation (fullBleed, density gap, emphasis)
 *       are newly connected to creativeStrategy.
 *     - reviews/wall also keeps index|grid unchanged, gains a density-driven default, a
 *       density-driven grid column count, and a structurally distinct lead-review
 *       treatment in 'index'.
 *     - two real provenance bugs are fixed and guarded: a hardcoded "Verified customer"
 *       label with no backing data field, and an average/count computed from the 6-review
 *       DISPLAY slice instead of the full dataset.
 * 15. QA-fixture coverage guard: a production defaults/rendering function can be correct
 *     while its own QA fixture still fails to demonstrate it (found in manual QA after
 *     Phase 4D — BLOCK FORM's testimonials looked "invisible" purely because the page had
 *     grown very long, and Auric's reviews_01 had a redundant explicit 'grid' that
 *     duplicated Lumen Lab's own pre-existing 'grid', leaving 'index' with zero live
 *     coverage). Asserts the fixture DATA's shape and resolved layout directly.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  siteDocumentSchema,
  nodeDesignSchema,
  resolveResponsiveVariant,
  COMPOSITION_VARIANTS as SITE_TREE_VARIANTS,
} from '../src/lib/ai-studio/v2/siteTree';
import { listCompositions, resolveComposition } from '../src/components/templates/ai/v2/registry';
import {
  applyStrategyDefaults,
  applyLayoutDefaults,
  editorialSplitLayoutDefault,
  productSpotlightLayoutDefault,
  brandStatementLayoutDefault,
  newsletterLayoutDefault,
  collectionsLayoutDefault,
  testimonialsLayoutDefault,
  reviewsLayoutDefault,
  normalizeDesignSemantics,
  type StrategyInput,
  type LayoutDefaultNode,
} from '../shared/ai-studio-v2/strategyDefaults';
import { isValidLayout, allowedLayouts, COMPOSITION_LAYOUTS } from '../shared/ai-studio-v2/compositionLayouts';
import { siteOpsSchema, applySiteOps } from '../src/lib/ai-studio/v2/siteOps';
import { validateSiteOpsAgainstDocument } from '../src/lib/ai-studio/v2/validateSiteOps';
import { V2_VARIETY_FIXTURES, varietyFingerprint, expressivenessFingerprint } from '../src/lib/ai-studio/v2/fixtures';
import { COMPOSITION_CATALOG } from '../src/lib/ai-studio/v2/compositionCatalog';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/* 1. Registry validity ------------------------------------------------- */

const registryEntries = listCompositions();
assert(
  registryEntries.some((e) => e.type === 'productGrid' && e.variant === 'luxury_image_first'),
  'registry has the productGrid:luxury_image_first entry (renamed from luxuryImageFirst to match convention)'
);
assert(
  !!resolveComposition('productGrid', 'luxury_image_first'),
  'resolveComposition resolves the renamed entry exactly (not via type-only fallback)'
);

// Every (type, variant) the AI is allowed to choose (siteTree.ts COMPOSITION_VARIANTS,
// mirrored by the server's own copy in aiStudioV2.ts) must have a real renderer entry -
// this is exactly the class of drift the original architecture audit flagged in V1.
let missingRenderers = 0;
for (const [type, variants] of Object.entries(SITE_TREE_VARIANTS)) {
  for (const variant of variants as readonly string[]) {
    const entry = resolveComposition(type, variant);
    if (!entry || entry.type !== type || entry.variant !== variant) missingRenderers += 1;
  }
}
assert(missingRenderers === 0, `every siteTree.ts COMPOSITION_VARIANTS entry resolves to its own registry component (${missingRenderers} missing)`);

// Every (type, variant) key in the layout catalog must itself be a registered composition -
// otherwise the catalog is validating layouts for something that can never be authored.
let orphanLayoutKeys = 0;
for (const key of Object.keys(COMPOSITION_LAYOUTS)) {
  const [type, variant] = key.split('/');
  if (!resolveComposition(type, variant) || !(SITE_TREE_VARIANTS[type as keyof typeof SITE_TREE_VARIANTS] as readonly string[] | undefined)?.includes(variant)) {
    orphanLayoutKeys += 1;
  }
}
assert(orphanLayoutKeys === 0, `every COMPOSITION_LAYOUTS key names a real registered composition (${orphanLayoutKeys} orphaned)`);

/* 2. creativeStrategy -> design defaults, deterministic + divergent ---- */

const nodes = [
  { id: 'nav_01', type: 'nav' },
  { id: 'hero_01', type: 'hero' },
  { id: 'products_01', type: 'productGrid' },
  { id: 'story_01', type: 'editorialSplit' },
  { id: 'footer_01', type: 'footer' },
];

const quiet: StrategyInput = { density: 'low', asymmetry: 'low', rhythm: 'even', typographyRole: 'quiet', imageryRole: 'supporting' };
const bold: StrategyInput = { density: 'high', asymmetry: 'high', rhythm: 'rapid_contrast', typographyRole: 'dominant_structural', imageryRole: 'dominant' };

const quietResult = applyStrategyDefaults(nodes, quiet);
const boldResult = applyStrategyDefaults(nodes, bold);
const quietAgain = applyStrategyDefaults(nodes, quiet);

assert(JSON.stringify(quietResult) === JSON.stringify(quietAgain), 'applyStrategyDefaults is deterministic for identical input');
assert(JSON.stringify(quietResult) !== JSON.stringify(boldResult), 'two divergent creativeStrategy profiles produce divergent design-knob output, not the same fingerprint');
assert(quietResult.find((n) => n.id === 'hero_01')?.design?.emphasis !== boldResult.find((n) => n.id === 'hero_01')?.design?.emphasis, 'hero emphasis differs between quiet and bold strategies');

const explicit = applyStrategyDefaults([{ id: 'hero_01', type: 'hero', design: { spacing: 'cozy' } }], bold);
assert(explicit[0].design?.spacing === 'cozy', 'an explicit architect-chosen design value always survives regardless of strategy');

/* 3. Design-knob schema still accepts everything we write --------------- */

for (const n of [...quietResult, ...boldResult]) {
  const parsed = nodeDesignSchema.safeParse(n.design);
  assert(parsed.success, `nodeDesignSchema accepts applyStrategyDefaults output for ${n.id} (${parsed.success ? '' : JSON.stringify((parsed as { error: { issues: unknown[] } }).error.issues)})`);
}

/* 4. normalizeDesignSemantics: structural CSS fix only, no aesthetic overrides -------- */

assert(
  normalizeDesignSemantics('hero', undefined, { fullBleed: true, measure: 'narrow' }).measure === 'bleed',
  'fullBleed + narrow measure resolved to bleed (the one remaining, CSS-cascade-justified normalization)'
);
const clean = { spacing: 'airy' as const, alignment: 'center' as const };
assert(JSON.stringify(normalizeDesignSemantics('hero', undefined, clean)) === JSON.stringify(clean), 'conflict-free input passes through unchanged');

// BLOCKER fix verification: these two aesthetic overrides were removed. Unusual but valid
// creative choices must now survive normalizeDesignSemantics untouched.
assert(
  normalizeDesignSemantics('productGrid', 'dense', { spacing: 'dramatic' }).spacing === 'dramatic',
  'dense productGrid + dramatic spacing is an unusual but VALID creative choice - no longer forced to cozy'
);
assert(
  normalizeDesignSemantics('hero', undefined, { emphasis: 'quiet', fullBleed: true }).fullBleed === true,
  'quiet emphasis + fullBleed is an unusual but VALID creative choice - fullBleed is no longer dropped'
);

/* 5. content.layout validation ------------------------------------------ */

assert(isValidLayout('productGrid', 'editorial', undefined), 'absent content.layout is always valid');
assert(isValidLayout('productGrid', 'editorial', 'standardEditorial'), 'standardEditorial (the named default) remains a valid productGrid/editorial layout');
assert(isValidLayout('productGrid', 'editorial', 'asymmetricFeature'), 'asymmetricFeature remains valid');
assert(isValidLayout('productGrid', 'editorial', 'dense'), 'dense remains valid');
assert(!isValidLayout('productGrid', 'editorial', 'asymetricFeature'), 'a typo\'d layout value ("asymetricFeature") is rejected, not silently treated as a default');
assert(!isValidLayout('productGrid', 'editorial', 'quiet'), 'a layout value valid on a DIFFERENT composition (hero/luxury_minimal) is rejected on productGrid/editorial');
assert(!isValidLayout('nav', 'minimal', 'anything'), 'a composition with no documented layout modes rejects any explicit layout value');
assert(JSON.stringify(allowedLayouts('hero', 'luxury_minimal')) === JSON.stringify(['quiet', 'cinematic']), 'hero/luxury_minimal allows exactly quiet|cinematic');

const baseDoc = siteDocumentSchema.parse({
  version: 2,
  siteId: 'selftest',
  designSystemId: 'selftest',
  pages: {
    home: {
      id: 'home',
      type: 'home',
      nodes: [
        { id: 'nav_01', type: 'nav', variant: 'minimal', content: {}, design: {}, responsive: {} },
        { id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' }, design: {}, responsive: {} },
        { id: 'products_01', type: 'productGrid', variant: 'editorial', content: {}, design: {}, responsive: {}, dataBindings: { products: 'featured', limit: 8 } },
        { id: 'footer_01', type: 'footer', variant: 'minimal_commerce', content: {}, design: {}, responsive: {} },
      ],
    },
  },
  meta: { language: 'en', updatedAt: new Date().toISOString() },
});

const opsInsertNewComposition = siteOpsSchema.parse([
  { op: 'replace', id: 'products_01', node: { id: 'products_01', type: 'productGrid', variant: 'luxury_image_first', content: { title: 'Now live' }, design: {}, responsive: {}, dataBindings: { products: 'featured', limit: 4 } } },
]);
const validatedNewComposition = validateSiteOpsAgainstDocument(baseDoc, opsInsertNewComposition);
assert(validatedNewComposition.rejected.length === 0, `SiteOps validator accepts the renamed productGrid:luxury_image_first composition (rejected: ${JSON.stringify(validatedNewComposition.rejected)})`);

const opsSetContentLayout = siteOpsSchema.parse([
  { op: 'update', id: 'hero_01', patch: { content: { title: 'Store', layout: 'cinematic', kicker: 'Eyebrow' } } },
]);
const validatedLayout = validateSiteOpsAgainstDocument(baseDoc, opsSetContentLayout);
assert(validatedLayout.rejected.length === 0, 'SiteOps validator accepts a valid content.layout mode via update (no schema change needed - content is free-form)');
const afterLayoutOp = applySiteOps(baseDoc, validatedLayout.ops);
assert(afterLayoutOp.pages.home.nodes.find((n) => n.id === 'hero_01')?.content.layout === 'cinematic', 'applySiteOps actually persists the new content.layout value');

// Negative: standardEditorial (valid legacy layout) must remain accepted.
const opsStandardEditorial = siteOpsSchema.parse([
  { op: 'update', id: 'products_01', patch: { content: { layout: 'standardEditorial' } } },
]);
assert(
  validateSiteOpsAgainstDocument(baseDoc, opsStandardEditorial).rejected.length === 0,
  'SiteOps accepts standardEditorial on productGrid/editorial'
);

// Negative: a typo'd layout must be rejected/repairable, not silently rendered as default.
const opsInvalidLayout = siteOpsSchema.parse([
  { op: 'update', id: 'products_01', patch: { content: { layout: 'asymetricFeature' } } },
]);
const validatedInvalidLayout = validateSiteOpsAgainstDocument(baseDoc, opsInvalidLayout);
assert(validatedInvalidLayout.rejected.length > 0, 'SiteOps REJECTS a typo\'d content.layout instead of letting it through to silently fall back at render time');
let threwForInvalidLayout = false;
try {
  applySiteOps(baseDoc, siteOpsSchema.parse(opsInvalidLayout));
} catch {
  threwForInvalidLayout = true;
}
assert(threwForInvalidLayout, 'applySiteOps itself throws on an invalid content.layout (not just the pre-validation wrapper)');

const opsStyleConflict = siteOpsSchema.parse([{ op: 'style', id: 'hero_01', design: { fullBleed: true, measure: 'narrow' } }]);
const afterStyleConflict = applySiteOps(baseDoc, opsStyleConflict);
assert(afterStyleConflict.pages.home.nodes.find((n) => n.id === 'hero_01')?.design.measure === 'bleed', 'applySiteOps resolves a contradictory style op through normalizeDesignSemantics, not just the critique-time path');

/* 6. responsive.mobile.variant validation -------------------------------- */

assert(
  resolveResponsiveVariant('productGrid', 'editorial', 'luxury_minimal') === 'editorial',
  'runtime fallback: an invalid cross-type mobile variant is ignored, keeping the desktop variant'
);
assert(
  resolveResponsiveVariant('hero', 'editorial_split', 'luxury_minimal') === 'luxury_minimal',
  'runtime fallback: a valid same-type mobile variant is applied'
);
assert(
  resolveResponsiveVariant('hero', 'editorial_split', undefined) === 'editorial_split',
  'runtime fallback: no mobile variant requested keeps the desktop variant'
);

// Negative: a productGrid must not accept a hero variant as its mobile override.
const opsCrossTypeMobileVariant = siteOpsSchema.parse([
  { op: 'update', id: 'products_01', patch: { responsive: { mobile: { variant: 'luxury_minimal' } } } },
]);
const validatedCrossType = validateSiteOpsAgainstDocument(baseDoc, opsCrossTypeMobileVariant);
assert(validatedCrossType.rejected.length > 0, 'SiteOps REJECTS responsive.mobile.variant = "luxury_minimal" (a hero variant) on a productGrid node');
let threwForInvalidMobileVariant = false;
try {
  applySiteOps(baseDoc, siteOpsSchema.parse(opsCrossTypeMobileVariant));
} catch {
  threwForInvalidMobileVariant = true;
}
assert(threwForInvalidMobileVariant, 'applySiteOps itself throws on an incompatible responsive.mobile.variant');

// Positive: a same-type mobile variant swap is a legitimate, accepted mutation.
const opsValidMobileVariant = siteOpsSchema.parse([
  { op: 'update', id: 'hero_01', patch: { responsive: { mobile: { variant: 'product_focus' } } } },
]);
assert(
  validateSiteOpsAgainstDocument(baseDoc, opsValidMobileVariant).rejected.length === 0,
  'SiteOps accepts a same-type responsive.mobile.variant swap (hero -> a different registered hero variant)'
);

/* 7. Explicit choices survive applyStrategyDefaults -> normalizeDesignSemantics ------- */

const explicitThenNormalized = normalizeDesignSemantics(
  'productGrid',
  'dense',
  applyStrategyDefaults([{ id: 'products_01', type: 'productGrid', design: { spacing: 'dramatic' } }], bold)[0].design!
);
assert(explicitThenNormalized.spacing === 'dramatic', 'an explicit dramatic spacing on a dense productGrid survives the full pipeline unless it violates the one documented invariant (fullBleed+narrow)');

/* 8. Expressiveness fingerprint ------------------------------------------ */

for (const fixture of V2_VARIETY_FIXTURES) {
  const fp = varietyFingerprint(fixture.document);
  assert(!!fp, `fixture "${fixture.id}" still produces a varietyFingerprint`);
  const efp = expressivenessFingerprint(fixture.document);
  assert(Array.isArray(efp) && efp.length > 0, `fixture "${fixture.id}" produces a non-empty expressivenessFingerprint`);
}
const fingerprints = V2_VARIETY_FIXTURES.map((f) => JSON.stringify(varietyFingerprint(f.document)));
assert(new Set(fingerprints).size === fingerprints.length, 'all 5 fixture stores still have distinct varietyFingerprints after extension');

const expressivenessFingerprints = V2_VARIETY_FIXTURES.map((f) => JSON.stringify(expressivenessFingerprint(f.document)));
assert(
  new Set(expressivenessFingerprints).size === expressivenessFingerprints.length,
  'all 5 fixture stores (luxury/editorial, streetwear/bold, minimal skincare, technology, artisan food) produce distinct expressiveness fingerprints - proof different creative directions reach the renderer differently, NOT a claim about pixels'
);
// Determinism: fingerprinting the same document twice must be stable.
assert(
  JSON.stringify(expressivenessFingerprint(V2_VARIETY_FIXTURES[0].document)) ===
    JSON.stringify(expressivenessFingerprint(V2_VARIETY_FIXTURES[0].document)),
  'expressivenessFingerprint is deterministic for the same document'
);

/* 9. Backward compatibility ---------------------------------------------- */

const legacyDoc = siteDocumentSchema.parse({
  version: 2,
  siteId: 'legacy',
  designSystemId: 'legacy',
  pages: {
    home: {
      id: 'home',
      type: 'home',
      nodes: [
        { id: 'nav_01', type: 'nav', variant: 'minimal', content: {}, design: {}, responsive: {} },
        { id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Legacy Store' }, design: {}, responsive: {} },
        { id: 'products_01', type: 'productGrid', variant: 'editorial', content: {}, design: {}, responsive: {}, dataBindings: { products: 'featured', limit: 8 } },
        { id: 'footer_01', type: 'footer', variant: 'minimal_commerce', content: {}, design: {}, responsive: {} },
      ],
    },
  },
  meta: { language: 'en', updatedAt: '2026-08-01T00:00:00.000Z' },
});
assert(siteDocumentSchema.safeParse(legacyDoc).success, 'a pre-expressiveness-phase document (no content.layout, no responsive overrides) still parses');
for (const n of legacyDoc.pages.home.nodes) {
  assert(!!resolveComposition(n.type, n.variant), `legacy node ${n.id} (${n.type}:${n.variant}) still resolves to a renderer`);
  assert(isValidLayout(n.type, n.variant, n.content?.layout), `legacy node ${n.id} has no content.layout - trivially valid, no false-positive rejection`);
}

/* 10. Composition-catalog drift guard ------------------------------------ */

// Every registered (type,variant) pair must have a compositionCatalog.ts entry, and
// vice versa - this is exactly the class of drift that let productGrid/luxury_image_first
// go missing from the catalog after being added everywhere else.
const catalogPairs = new Set(COMPOSITION_CATALOG.map((c) => `${c.type}/${c.variant}`));
let catalogMissingForRegistered = 0;
for (const [type, variants] of Object.entries(SITE_TREE_VARIANTS)) {
  for (const variant of variants as readonly string[]) {
    if (!catalogPairs.has(`${type}/${variant}`)) catalogMissingForRegistered += 1;
  }
}
assert(catalogMissingForRegistered === 0, `compositionCatalog.ts has an entry for every registered (type,variant) pair (${catalogMissingForRegistered} missing)`);

let registeredMissingForCatalog = 0;
for (const { type, variant } of COMPOSITION_CATALOG) {
  if (!resolveComposition(type, variant)) registeredMissingForCatalog += 1;
}
assert(registeredMissingForCatalog === 0, `every compositionCatalog.ts entry names a real registered composition (${registeredMissingForCatalog} orphaned)`);

// Every content.layout mode documented in the shared, authoritative catalog must also be
// mentioned in compositionCatalog.ts's optionalFields for that same (type,variant) - this
// is the class of drift that left productGrid/editorial's list incomplete (missing
// asymmetricFeature|dense) after the layout catalog itself was extended.
let catalogLayoutGaps = 0;
for (const [key, layouts] of Object.entries(COMPOSITION_LAYOUTS)) {
  const [type, variant] = key.split('/');
  const entry = COMPOSITION_CATALOG.find((c) => c.type === type && c.variant === variant);
  if (!entry) {
    catalogLayoutGaps += 1;
    console.error('FAIL:', `compositionCatalog.ts has no entry at all for ${key}, which has documented layout modes`);
    continue;
  }
  const optionalText = (entry.optionalFields || []).join(' ');
  const missingLayouts = (layouts as readonly string[]).filter((l) => !optionalText.includes(l));
  if (missingLayouts.length > 0) {
    catalogLayoutGaps += 1;
    console.error('FAIL:', `compositionCatalog.ts entry for ${key} is missing layout mode(s): ${missingLayouts.join(', ')}`);
  }
}
assert(catalogLayoutGaps === 0, 'compositionCatalog.ts documents every layout mode the shared compositionLayouts.ts catalog defines, for every (type,variant)');

// The two Deno-only vocabulary copies (remote `https://esm.sh/zod` import means they can't
// be `import`ed here) get a narrow text-presence guard for the same class of drift: a
// variant introduced by this phase must be recognized by name, and the old pre-rename
// spelling must not linger.
const here = path.dirname(fileURLToPath(import.meta.url));
const DENO_VOCAB_FILES = ['../supabase/functions/_shared/aiStudioV2.ts', '../supabase/functions/_shared/aiStudioV2Critique.ts'];
for (const rel of DENO_VOCAB_FILES) {
  const text = fs.readFileSync(path.join(here, rel), 'utf8');
  assert(text.includes('luxury_image_first'), `${rel} recognizes the productGrid/luxury_image_first variant`);
  assert(!text.includes('luxuryImageFirst'), `${rel} has no leftover pre-rename "luxuryImageFirst" spelling`);
}

/* 11. Phase 4A — editorialSplit content.layout defaults ---------------- */

assert(isValidLayout('editorialSplit', 'image_text', undefined), 'absent content.layout is valid for editorialSplit/image_text');
assert(isValidLayout('editorialSplit', 'image_text', 'classicSplit'), 'classicSplit (the default) is a valid editorialSplit/image_text layout');
assert(isValidLayout('editorialSplit', 'image_text', 'offsetNarrow'), 'offsetNarrow is a valid editorialSplit/image_text layout');
assert(isValidLayout('editorialSplit', 'image_text', 'overlayStatement'), 'overlayStatement is a valid editorialSplit/image_text layout');
assert(!isValidLayout('editorialSplit', 'image_text', 'overlayStatment'), "a typo'd editorialSplit layout value is rejected, not silently treated as a default");
assert(!isValidLayout('editorialSplit', 'image_text', 'magazine'), 'a layout value valid on a DIFFERENT composition (editorialMosaic) is rejected on editorialSplit/image_text');
assert(
  JSON.stringify(allowedLayouts('editorialSplit', 'image_text')) === JSON.stringify(['classicSplit', 'offsetNarrow', 'overlayStatement']),
  'editorialSplit/image_text allows exactly classicSplit|offsetNarrow|overlayStatement'
);

// Design-DNA mapping: typographyRole is checked first, then imageryRole - never
// productPresentation or an archetype string (see strategyDefaults.ts editorialSplitLayoutDefault
// and the Phase 4A architectural decision: productPresentation is scoped to product chrome only).
const quietImageLed: StrategyInput = { density: 'medium', asymmetry: 'medium', rhythm: 'even', typographyRole: 'quiet', imageryRole: 'dominant' };
const balancedSupportingImagery: StrategyInput = { density: 'medium', asymmetry: 'low', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'supporting' };
const dominantTypography: StrategyInput = { density: 'high', asymmetry: 'high', rhythm: 'rapid_contrast', typographyRole: 'dominant_structural', imageryRole: 'balanced' };

assert(editorialSplitLayoutDefault(quietImageLed) === 'offsetNarrow', 'quiet typography + dominant imagery resolves to offsetNarrow (image-led, restrained copy)');
assert(editorialSplitLayoutDefault(balancedSupportingImagery) === 'classicSplit', 'balanced typography + supporting imagery resolves to classicSplit (the safe structured default)');
assert(editorialSplitLayoutDefault(dominantTypography) === 'overlayStatement', 'dominant_structural typography resolves to overlayStatement regardless of imageryRole (typography checked first)');
assert(
  editorialSplitLayoutDefault(quietImageLed) !== editorialSplitLayoutDefault(balancedSupportingImagery) &&
    editorialSplitLayoutDefault(balancedSupportingImagery) !== editorialSplitLayoutDefault(dominantTypography),
  'three materially different creativeStrategy profiles produce three different editorialSplit layout defaults, not a collapsed fingerprint'
);

// applyLayoutDefaults: fill-only-if-unset, explicit authoring always wins.
const storyNodeUnset: LayoutDefaultNode[] = [{ type: 'editorialSplit', content: {} }];
const defaultedStory = applyLayoutDefaults(storyNodeUnset, dominantTypography);
assert(defaultedStory[0].content?.layout === 'overlayStatement', 'applyLayoutDefaults fills content.layout from creativeStrategy when the architect left it unset');

const storyNodeExplicit: LayoutDefaultNode[] = [{ type: 'editorialSplit', content: { layout: 'classicSplit' } }];
const explicitStory = applyLayoutDefaults(storyNodeExplicit, dominantTypography);
assert(
  explicitStory[0].content?.layout === 'classicSplit',
  'an explicit architect-authored content.layout always wins over the strategy default, even one that would otherwise resolve differently'
);

// A type with no registered layout-default rule (Phase 4A wires editorialSplit only) is untouched.
const heroNodeUnset: LayoutDefaultNode[] = [{ type: 'hero', content: {} }];
assert(applyLayoutDefaults(heroNodeUnset, dominantTypography)[0].content?.layout === undefined, 'a type with no registered layout-default rule (e.g. hero) is not touched by applyLayoutDefaults');

// A legacy node with no `content` object at all still resolves a default safely.
const legacyBareNode: LayoutDefaultNode[] = [{ type: 'editorialSplit' }];
assert(
  applyLayoutDefaults(legacyBareNode, dominantTypography)[0].content?.layout === 'overlayStatement',
  'a legacy node with no content object at all still resolves a default safely (no crash on missing content)'
);

// Renderer actually branches structurally per layout - not just a `data-layout` attribute
// nobody reads (the newsletter/quiet dead-code gap the Phase 4 audit found).
const compositionsSource = fs.readFileSync(path.join(here, '../src/components/templates/ai/v2/compositions.tsx'), 'utf8');
const editorialFnStart = compositionsSource.indexOf('export function EditorialSplitImageText');
const editorialFnEnd = compositionsSource.indexOf('export function BrandStatementLarge');
assert(editorialFnStart > -1 && editorialFnEnd > editorialFnStart, 'EditorialSplitImageText is found in compositions.tsx for structural inspection');
const editorialFnSource = compositionsSource.slice(editorialFnStart, editorialFnEnd);
assert(editorialFnSource.includes("layoutOf(node, 'classicSplit')"), "EditorialSplitImageText defaults to 'classicSplit', preserving legacy/no-layout rendering");
for (const layout of ['classicSplit', 'offsetNarrow', 'overlayStatement']) {
  assert(editorialFnSource.includes(`'${layout}'`), `EditorialSplitImageText source actually references the '${layout}' layout value`);
}
assert(editorialFnSource.includes('ai-v2-editorial-grid-offset'), "offsetNarrow renders a structurally distinct class ('ai-v2-editorial-grid-offset'), not just a data attribute");
assert(editorialFnSource.includes('ai-v2-editorial-overlay-media') && editorialFnSource.includes('ai-v2-editorial-overlay-panel'), "overlayStatement renders a structurally distinct DOM shape ('ai-v2-editorial-overlay-*'), not just a data attribute");
const editorialReturnCount = (editorialFnSource.match(/return \(/g) || []).length;
assert(editorialReturnCount >= 2, 'EditorialSplitImageText has multiple structural return branches (not one shared JSX tree keyed only by a data attribute)');

// Deno-only architect prompt copy recognizes the new grammar by name, and the dead
// imagePosition field (never read by the renderer - it reads content.reverse) is gone.
const aiStudioV2Text = fs.readFileSync(path.join(here, '../supabase/functions/_shared/aiStudioV2.ts'), 'utf8');
for (const layout of ['classicSplit', 'offsetNarrow', 'overlayStatement']) {
  assert(aiStudioV2Text.includes(layout), `aiStudioV2.ts (Deno architect prompt) recognizes the editorialSplit layout '${layout}'`);
}
assert(!aiStudioV2Text.includes('imagePosition'), 'aiStudioV2.ts no longer documents the dead imagePosition field the renderer never read');

/* 12. Phase 4B — productSpotlight + brandStatement content.layout defaults ---------- */

// productSpotlight/feature -----------------------------------------------------------
assert(isValidLayout('productSpotlight', 'feature', undefined), 'absent content.layout is valid for productSpotlight/feature');
assert(isValidLayout('productSpotlight', 'feature', 'feature'), 'feature (the default) is a valid productSpotlight/feature layout');
assert(isValidLayout('productSpotlight', 'feature', 'imageDominant'), 'imageDominant is a valid productSpotlight/feature layout');
assert(isValidLayout('productSpotlight', 'feature', 'structuredFeature'), 'structuredFeature is a valid productSpotlight/feature layout');
assert(!isValidLayout('productSpotlight', 'feature', 'imageDominent'), "a typo'd productSpotlight layout value is rejected");
assert(!isValidLayout('productSpotlight', 'feature', 'overlayStatement'), 'a layout value valid on a DIFFERENT composition (editorialSplit) is rejected on productSpotlight/feature');
assert(
  JSON.stringify(allowedLayouts('productSpotlight', 'feature')) === JSON.stringify(['feature', 'imageDominant', 'structuredFeature']),
  'productSpotlight/feature allows exactly feature|imageDominant|structuredFeature'
);

const quietSpotlight: StrategyInput = { density: 'low', asymmetry: 'medium', rhythm: 'sparse_pause', typographyRole: 'quiet', imageryRole: 'dominant' };
const balancedSpotlight: StrategyInput = { density: 'medium', asymmetry: 'low', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'balanced' };
const boldSpotlight: StrategyInput = { density: 'high', asymmetry: 'high', rhythm: 'rapid_contrast', typographyRole: 'dominant_structural', imageryRole: 'dominant' };

assert(productSpotlightLayoutDefault(quietSpotlight) === 'imageDominant', 'quiet typography + dominant imagery resolves to imageDominant (image-led)');
assert(productSpotlightLayoutDefault(balancedSpotlight) === 'feature', 'balanced typography + balanced imagery resolves to feature (the safe default)');
assert(productSpotlightLayoutDefault(boldSpotlight) === 'structuredFeature', 'dominant_structural typography resolves to structuredFeature regardless of imageryRole (typography checked first)');
assert(
  productSpotlightLayoutDefault(quietSpotlight) !== productSpotlightLayoutDefault(balancedSpotlight) &&
    productSpotlightLayoutDefault(balancedSpotlight) !== productSpotlightLayoutDefault(boldSpotlight),
  'three materially different creativeStrategy profiles produce three different productSpotlight layout defaults'
);

const spotlightNodeUnset: LayoutDefaultNode[] = [{ type: 'productSpotlight', content: {} }];
assert(
  applyLayoutDefaults(spotlightNodeUnset, boldSpotlight)[0].content?.layout === 'structuredFeature',
  'applyLayoutDefaults fills productSpotlight content.layout from creativeStrategy when the architect left it unset'
);
const spotlightNodeExplicit: LayoutDefaultNode[] = [{ type: 'productSpotlight', content: { layout: 'feature' } }];
assert(
  applyLayoutDefaults(spotlightNodeExplicit, boldSpotlight)[0].content?.layout === 'feature',
  'an explicit architect-authored productSpotlight content.layout always wins over the strategy default'
);

const spotlightSource = fs.readFileSync(path.join(here, '../src/components/templates/ai/v2/compositions.tsx'), 'utf8');
const spotlightFnStart = spotlightSource.indexOf('export function ProductSpotlightFeature');
const spotlightFnEnd = spotlightSource.indexOf('/* ─── Story');
assert(spotlightFnStart > -1 && spotlightFnEnd > spotlightFnStart, 'ProductSpotlightFeature is found in compositions.tsx for structural inspection');
const spotlightFnSource = spotlightSource.slice(spotlightFnStart, spotlightFnEnd);
assert(spotlightFnSource.includes("layoutOf(node, 'feature')"), "ProductSpotlightFeature defaults to 'feature', preserving legacy/no-layout rendering");
for (const layout of ['feature', 'imageDominant', 'structuredFeature']) {
  assert(spotlightFnSource.includes(`'${layout}'`), `ProductSpotlightFeature source actually references the '${layout}' layout value`);
}
assert(spotlightFnSource.includes('ai-v2-spotlight-grid-dominant'), "imageDominant renders a structurally distinct class ('ai-v2-spotlight-grid-dominant'), not just a data attribute");
assert(spotlightFnSource.includes('ai-v2-spotlight-grid-structured'), "structuredFeature renders a structurally distinct class ('ai-v2-spotlight-grid-structured'), not just a data attribute");
assert(
  /layout === 'structuredFeature'[\s\S]*?\{copy\}\s*\{media\}/.test(spotlightFnSource),
  'structuredFeature actually reorders copy before media in real DOM order, not just via CSS (checked for keyboard/AT users, not only sighted layout)'
);
assert(
  !spotlightFnSource.includes('product.price *') && !spotlightFnSource.includes('discount'),
  'ProductSpotlightFeature does not fabricate price/discount adjustments for any layout - formatStoreMoney(product.price, ...) is the only price path'
);

// brandStatement/large_type ------------------------------------------------------------
assert(isValidLayout('brandStatement', 'large_type', undefined), 'absent content.layout is valid for brandStatement/large_type');
assert(isValidLayout('brandStatement', 'large_type', 'centered'), 'centered (the default) is a valid brandStatement/large_type layout');
assert(isValidLayout('brandStatement', 'large_type', 'splitStatement'), 'splitStatement is a valid brandStatement/large_type layout');
assert(isValidLayout('brandStatement', 'large_type', 'anchoredLarge'), 'anchoredLarge is a valid brandStatement/large_type layout');
assert(!isValidLayout('brandStatement', 'large_type', 'anchoredLarg'), "a typo'd brandStatement layout value is rejected");
assert(!isValidLayout('brandStatement', 'large_type', 'magazine'), 'a layout value valid on a DIFFERENT composition (editorialMosaic) is rejected on brandStatement/large_type');
assert(
  JSON.stringify(allowedLayouts('brandStatement', 'large_type')) === JSON.stringify(['centered', 'splitStatement', 'anchoredLarge']),
  'brandStatement/large_type allows exactly centered|splitStatement|anchoredLarge'
);

const quietStatement: StrategyInput = { density: 'low', asymmetry: 'medium', rhythm: 'sparse_pause', typographyRole: 'quiet', imageryRole: 'balanced' };
const balancedStatement: StrategyInput = { density: 'medium', asymmetry: 'low', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'balanced' };
const dominantStatement: StrategyInput = { density: 'high', asymmetry: 'high', rhythm: 'rapid_contrast', typographyRole: 'dominant_structural', imageryRole: 'dominant' };

assert(brandStatementLayoutDefault(quietStatement) === 'splitStatement', 'quiet typography resolves to splitStatement (restrained, editorial placement)');
assert(brandStatementLayoutDefault(balancedStatement) === 'centered', 'balanced typography resolves to centered (the safe, already-controlled default)');
assert(brandStatementLayoutDefault(dominantStatement) === 'anchoredLarge', 'dominant_structural typography resolves to anchoredLarge (breaks outside the content canvas)');
assert(
  brandStatementLayoutDefault(quietStatement) !== brandStatementLayoutDefault(balancedStatement) &&
    brandStatementLayoutDefault(balancedStatement) !== brandStatementLayoutDefault(dominantStatement),
  'three materially different typographyRole inputs produce three different brandStatement layout defaults'
);

const statementNodeUnset: LayoutDefaultNode[] = [{ type: 'brandStatement', content: {} }];
assert(
  applyLayoutDefaults(statementNodeUnset, dominantStatement)[0].content?.layout === 'anchoredLarge',
  'applyLayoutDefaults fills brandStatement content.layout from creativeStrategy when the architect left it unset'
);
const statementNodeExplicit: LayoutDefaultNode[] = [{ type: 'brandStatement', content: { layout: 'centered' } }];
assert(
  applyLayoutDefaults(statementNodeExplicit, dominantStatement)[0].content?.layout === 'centered',
  'an explicit architect-authored brandStatement content.layout always wins over the strategy default'
);

const statementFnStart = spotlightSource.indexOf('export function BrandStatementLarge');
const statementFnEnd = spotlightSource.indexOf('/** Magazine mosaic');
assert(statementFnStart > -1 && statementFnEnd > statementFnStart, 'BrandStatementLarge is found in compositions.tsx for structural inspection');
const statementFnSource = spotlightSource.slice(statementFnStart, statementFnEnd);
assert(statementFnSource.includes("layoutOf(node, 'centered')"), "BrandStatementLarge defaults to 'centered', preserving legacy/no-layout rendering");
for (const layout of ['centered', 'splitStatement', 'anchoredLarge']) {
  assert(statementFnSource.includes(`'${layout}'`), `BrandStatementLarge source actually references the '${layout}' layout value`);
}
assert(statementFnSource.includes('ai-v2-statement-split'), "splitStatement renders a structurally distinct class ('ai-v2-statement-split'), not just a data attribute");
assert(statementFnSource.includes('ai-v2-statement-anchored'), "anchoredLarge renders a structurally distinct class ('ai-v2-statement-anchored'), not just a data attribute");
const statementReturnCount = (statementFnSource.match(/return \(/g) || []).length;
assert(statementReturnCount >= 2, 'BrandStatementLarge has multiple structural return branches (not one shared JSX tree keyed only by a data attribute)');

// Deno-only architect prompt copy recognizes the new grammar for both sections.
for (const layout of ['imageDominant', 'structuredFeature', 'splitStatement', 'anchoredLarge']) {
  assert(aiStudioV2Text.includes(layout), `aiStudioV2.ts (Deno architect prompt) recognizes the layout '${layout}'`);
}

/* 13. Phase 4C — newsletter content.layout defaults ------------------------------------ */

assert(isValidLayout('newsletter', 'quiet', undefined), 'absent content.layout is valid for newsletter/quiet');
assert(isValidLayout('newsletter', 'quiet', 'statement'), 'statement (the default) is a valid newsletter/quiet layout');
assert(isValidLayout('newsletter', 'quiet', 'split'), 'split is a valid newsletter/quiet layout');
assert(isValidLayout('newsletter', 'quiet', 'campaign'), 'campaign is a valid newsletter/quiet layout');
assert(!isValidLayout('newsletter', 'quiet', 'campain'), "a typo'd newsletter layout value is rejected");
assert(!isValidLayout('newsletter', 'quiet', 'overlayStatement'), 'a layout value valid on a DIFFERENT composition (editorialSplit) is rejected on newsletter/quiet');
assert(
  JSON.stringify(allowedLayouts('newsletter', 'quiet')) === JSON.stringify(['statement', 'split', 'campaign']),
  'newsletter/quiet allows exactly statement|split|campaign'
);
// This is exactly the bug the Phase 4 audit found: before this phase, 'statement' (the
// renderer's OWN existing fallback value) had no COMPOSITION_LAYOUTS entry at all, so an
// architect who explicitly authored the default value would have been REJECTED, not just
// ignored - not dead in the sense of "does nothing", dead in the sense of "throws".
assert(isValidLayout('newsletter', 'quiet', 'statement'), "newsletter/quiet's own existing default value is now actually authorable, not just renderable");

const quietNewsletter: StrategyInput = { density: 'low', asymmetry: 'medium', rhythm: 'sparse_pause', typographyRole: 'quiet', imageryRole: 'balanced' };
const balancedNewsletter: StrategyInput = { density: 'medium', asymmetry: 'low', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'balanced' };
const dominantNewsletter: StrategyInput = { density: 'high', asymmetry: 'high', rhythm: 'rapid_contrast', typographyRole: 'dominant_structural', imageryRole: 'dominant' };

assert(newsletterLayoutDefault(quietNewsletter) === 'statement', 'quiet typography resolves to statement (the pre-existing centered, generous-whitespace shape)');
assert(newsletterLayoutDefault(balancedNewsletter) === 'split', 'balanced typography resolves to split (copy and form in distinct regions)');
assert(newsletterLayoutDefault(dominantNewsletter) === 'campaign', 'dominant_structural typography resolves to campaign (assertive, bordered band)');
assert(
  newsletterLayoutDefault(quietNewsletter) !== newsletterLayoutDefault(balancedNewsletter) &&
    newsletterLayoutDefault(balancedNewsletter) !== newsletterLayoutDefault(dominantNewsletter),
  'three materially different typographyRole inputs produce three different newsletter layout defaults'
);

const newsletterNodeUnset: LayoutDefaultNode[] = [{ type: 'newsletter', content: {} }];
assert(
  applyLayoutDefaults(newsletterNodeUnset, dominantNewsletter)[0].content?.layout === 'campaign',
  'applyLayoutDefaults fills newsletter content.layout from creativeStrategy when the architect left it unset'
);
const newsletterNodeExplicit: LayoutDefaultNode[] = [{ type: 'newsletter', content: { layout: 'statement' } }];
assert(
  applyLayoutDefaults(newsletterNodeExplicit, dominantNewsletter)[0].content?.layout === 'statement',
  'an explicit architect-authored newsletter content.layout always wins over the strategy default'
);

const newsletterFnStart2 = spotlightSource.indexOf('export function NewsletterQuiet');
const newsletterFnEnd2 = spotlightSource.indexOf('/* ─── Footers');
assert(newsletterFnStart2 > -1 && newsletterFnEnd2 > newsletterFnStart2, 'NewsletterQuiet is found in compositions.tsx for structural inspection');
const newsletterFnSource2 = spotlightSource.slice(newsletterFnStart2, newsletterFnEnd2);
assert(newsletterFnSource2.includes("layoutOf(node, 'statement')"), "NewsletterQuiet defaults to 'statement', preserving legacy/no-layout rendering");
for (const layout of ['statement', 'split', 'campaign']) {
  assert(newsletterFnSource2.includes(`'${layout}'`), `NewsletterQuiet source actually references the '${layout}' layout value`);
}
assert(newsletterFnSource2.includes('ai-v2-newsletter-split-grid'), "split renders a structurally distinct class ('ai-v2-newsletter-split-grid'), not just a data attribute");
assert(newsletterFnSource2.includes('ai-v2-newsletter-campaign-band'), "campaign renders a structurally distinct class ('ai-v2-newsletter-campaign-band'), not just a data attribute");
const newsletterReturnCount = (newsletterFnSource2.match(/return \(/g) || []).length;
assert(newsletterReturnCount >= 3, 'NewsletterQuiet has 3 structural return branches (not one shared JSX tree keyed only by a data attribute)');
// The form (email input, label, autoComplete, submit button, preventDefault handler) must
// be defined exactly ONCE and reused - not reimplemented per layout, which would risk the
// three layouts silently drifting apart in accessibility/event behavior over time.
const formDefinitionCount = (newsletterFnSource2.match(/<form/g) || []).length;
assert(formDefinitionCount === 1, `NewsletterQuiet defines the <form> exactly once and reuses it across all 3 layouts (found ${formDefinitionCount})`);
assert(newsletterFnSource2.includes('type="email"'), 'the shared form still declares a real email input');
assert(newsletterFnSource2.includes('autoComplete="email"'), 'the shared form still declares autoComplete="email"');
assert(newsletterFnSource2.includes('e.preventDefault()'), 'the shared form still prevents default submit navigation (no backend behavior invented)');
assert(newsletterFnSource2.includes('className="sr-only"'), 'the shared form keeps its accessible (visually-hidden but present) email label');
assert(newsletterFnSource2.includes('className="ai-v2-btn-text"'), 'the shared form still uses the Phase 2 shared CTA class, not a bespoke button');
assert(
  !newsletterFnSource2.includes('subscribers') && !newsletterFnSource2.includes('% off') && !newsletterFnSource2.includes('discount'),
  'NewsletterQuiet does not fabricate subscriber counts or discount promises in any layout - only node.content.title/text/kicker are ever rendered'
);

// Deno-only architect prompt copy recognizes the new grammar.
for (const layout of ['split', 'campaign']) {
  assert(aiStudioV2Text.includes(layout), `aiStudioV2.ts (Deno architect prompt) recognizes the newsletter layout '${layout}'`);
}
assert(!aiStudioV2Text.includes('subtitle?, cta? }'), 'aiStudioV2.ts no longer documents the dead subtitle/cta newsletter fields the renderer never read');

/* 14. Phase 4D — collections/testimonials/reviews refinement ---------------------------- */

// Collections: pre-existing values remain valid; explicit wins; new default is deterministic.
assert(isValidLayout('collections', 'tiles', 'editorial'), 'collections/tiles editorial remains a valid layout (Phase 4D does not add a third)');
assert(isValidLayout('collections', 'tiles', 'stacked'), 'collections/tiles stacked remains a valid layout');
assert(!isValidLayout('collections', 'tiles', 'grid'), 'collections/tiles still rejects a value that was never registered (no new value added)');
assert(
  JSON.stringify(allowedLayouts('collections', 'tiles')) === JSON.stringify(['editorial', 'stacked']),
  'collections/tiles still allows exactly editorial|stacked - Phase 4D refined the CHOICE, not the catalog'
);
assert(collectionsLayoutDefault({ asymmetry: 'high' }) === 'stacked', 'high asymmetry resolves to stacked (an alternating-reversal layout, a genuine asymmetric device)');
assert(collectionsLayoutDefault({ asymmetry: 'medium' }) === 'editorial', 'medium asymmetry resolves to editorial (the safe default)');
assert(collectionsLayoutDefault({ asymmetry: 'low' }) === 'editorial', 'low asymmetry resolves to editorial');
const collectionsNodeExplicit: LayoutDefaultNode[] = [{ type: 'collections', content: { layout: 'editorial' } }];
assert(
  applyLayoutDefaults(collectionsNodeExplicit, { density: 'high', asymmetry: 'high', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'dominant' })[0].content?.layout === 'editorial',
  'an explicit architect-authored collections content.layout always wins over the strategy default, even one that would otherwise resolve to stacked'
);
const collectionsNodeUnset: LayoutDefaultNode[] = [{ type: 'collections', content: {} }];
assert(
  applyLayoutDefaults(collectionsNodeUnset, { density: 'medium', asymmetry: 'high', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'balanced' })[0].content?.layout === 'stacked',
  'applyLayoutDefaults fills collections content.layout from creativeStrategy when the architect left it unset'
);

// Testimonials: pre-existing values remain valid; no-fabrication and no-data behavior
// preserved (proven by source inspection, since this component's early-return-on-no-data
// logic is unchanged); new default is deterministic.
assert(isValidLayout('testimonials', 'editorial', 'quote'), 'testimonials/editorial quote remains a valid layout (Phase 4D does not add a third)');
assert(isValidLayout('testimonials', 'editorial', 'imageQuote'), 'testimonials/editorial imageQuote remains a valid layout');
assert(!isValidLayout('testimonials', 'editorial', 'video'), 'testimonials/editorial still rejects a value that was never registered');
assert(testimonialsLayoutDefault({ imageryRole: 'dominant' }) === 'imageQuote', 'dominant imagery resolves to imageQuote - previously opt-in only, see strategyDefaults.ts');
assert(testimonialsLayoutDefault({ imageryRole: 'balanced' }) === 'quote', 'balanced imagery resolves to quote (the safe default)');
assert(testimonialsLayoutDefault({ imageryRole: 'supporting' }) === 'quote', 'supporting imagery resolves to quote');
const testimonialsNodeExplicit: LayoutDefaultNode[] = [{ type: 'testimonials', content: { layout: 'quote' } }];
assert(
  applyLayoutDefaults(testimonialsNodeExplicit, { density: 'medium', asymmetry: 'medium', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'dominant' })[0].content?.layout === 'quote',
  'an explicit architect-authored testimonials content.layout always wins over the strategy default, even one that would otherwise resolve to imageQuote'
);

const testimonialsFnStart = spotlightSource.indexOf('export function TestimonialsEditorial');
const testimonialsFnEnd = spotlightSource.indexOf('export function ReviewsWall');
assert(testimonialsFnStart > -1 && testimonialsFnEnd > testimonialsFnStart, 'TestimonialsEditorial is found in compositions.tsx for structural inspection');
const testimonialsFnSource = spotlightSource.slice(testimonialsFnStart, testimonialsFnEnd);
assert(
  testimonialsFnSource.includes('if (!primary || !str(primary.quote)) return null;'),
  'TestimonialsEditorial still renders nothing when there is no real testimonial data - Phase 4D did not touch this guard'
);
assert(
  !/author:\s*['"]/.test(testimonialsFnSource) && !/quote:\s*['"]/.test(testimonialsFnSource),
  'TestimonialsEditorial never hardcodes a fabricated author/quote string - only node content is ever rendered'
);
assert(testimonialsFnSource.includes('quote') && testimonialsFnSource.includes('imageQuote'), 'TestimonialsEditorial source still branches on quote/imageQuote (unchanged renderer logic)');

// Reviews: pre-existing values remain valid; explicit wins; renderer branches materially;
// no fabrication; aggregates are derived from the full, real dataset.
assert(isValidLayout('reviews', 'wall', 'index'), 'reviews/wall index remains a valid layout (Phase 4D does not add a third)');
assert(isValidLayout('reviews', 'wall', 'grid'), 'reviews/wall grid remains a valid layout');
assert(!isValidLayout('reviews', 'wall', 'summary'), 'reviews/wall still rejects a value that was never registered');
assert(reviewsLayoutDefault({ density: 'high' }) === 'grid', 'high density resolves to grid (a dense proof grid), matching the renderer\'s own pre-existing comment intent');
assert(reviewsLayoutDefault({ density: 'medium' }) === 'index', 'medium density resolves to index (the safe, pre-existing default)');
assert(reviewsLayoutDefault({ density: 'low' }) === 'index', 'low density resolves to index');
const reviewsNodeExplicit: LayoutDefaultNode[] = [{ type: 'reviews', content: { layout: 'index' } }];
assert(
  applyLayoutDefaults(reviewsNodeExplicit, { density: 'high', asymmetry: 'medium', rhythm: 'even', typographyRole: 'balanced', imageryRole: 'balanced' })[0].content?.layout === 'index',
  'an explicit architect-authored reviews content.layout always wins over the strategy default, even one that would otherwise resolve to grid'
);

const reviewsFnStart = spotlightSource.indexOf('export function ReviewsWall');
const reviewsFnEnd = spotlightSource.indexOf('/* ─── Collections');
assert(reviewsFnStart > -1 && reviewsFnEnd > reviewsFnStart, 'ReviewsWall is found in compositions.tsx for structural inspection');
const reviewsFnSource = spotlightSource.slice(reviewsFnStart, reviewsFnEnd);
assert(!reviewsFnSource.includes('Verified customer'), 'ReviewsWall no longer prints a hardcoded "Verified customer" label - StorefrontReview has no verified field to back that claim');
assert(!reviewsFnSource.includes('verified notes'), 'ReviewsWall no longer labels the review count as "verified"');
assert(reviewsFnSource.includes('allReviews.length > 0 ? allReviews.reduce'), 'the average rating is computed from the FULL review dataset, not the 6-review display slice');
assert(reviewsFnSource.includes('{allReviews.length}'), 'the displayed review count is the real total count, not the truncated display-slice length');
assert(reviewsFnSource.includes('ai-v2-reviews-lead'), "'index' gives its lead review a structurally distinct class, not a uniform list item");
assert(reviewsFnSource.includes('data-density={brand.tokens.density}'), "'grid' column count is wired to the density design token, not a fixed 3 columns for every brand");
const reviewsReturnCount = (reviewsFnSource.match(/return \(/g) || []).length;
assert(reviewsReturnCount >= 2, 'ReviewsWall still has separate empty-state and populated-state return branches');

// Deno-only architect prompt copy accuracy check (no new layout NAMES to add here, since
// collections/testimonials/reviews keep their existing catalog values - just confirm the
// generic "unset layout gets a strategy default" note was extended to mention them).
assert(aiStudioV2Text.includes('collections/tiles (asymmetry)'), 'aiStudioV2.ts documents that collections/tiles content.layout is now strategy-defaulted');
assert(aiStudioV2Text.includes('testimonials/\neditorial (imageryRole)') || aiStudioV2Text.includes('testimonials/editorial (imageryRole)'), 'aiStudioV2.ts documents that testimonials/editorial content.layout is now strategy-defaulted');
assert(aiStudioV2Text.includes('reviews/wall (density)'), 'aiStudioV2.ts documents that reviews/wall content.layout is now strategy-defaulted');

/* 15. QA-fixture coverage guard --------------------------------------------------------
 * A production defaults/rendering function can be provably correct while its QA fixture
 * still fails to demonstrate it, two different ways found in manual QA after Phase 4D:
 *  - BLOCK FORM's testimonials_01 needs a REAL quote/author for imageQuote to actually
 *    render anything (TestimonialsEditorial's no-fabrication guard returns null otherwise)
 *    - the content was already sufficient, but nothing asserted that fact, so a future
 *      edit could silently strip it back to empty and no test would catch it.
 *  - Auric's reviews_01 previously had an explicit `layout: 'grid'` that duplicated
 *    Lumen Lab's own PRE-EXISTING explicit 'grid', leaving 'index' - the layout with the
 *    new lead-review hierarchy work - with zero live fixture coverage. Fixed by removing
 *    the redundant explicit value so Auric's density:'medium' resolves 'index' naturally.
 * These assert the FIXTURE DATA'S shape and resolved layout, not the renderer (already
 * covered above) - this is coverage insurance, not a second copy of the production guard. */

const streetwearFixture = V2_VARIETY_FIXTURES.find((f) => f.id === 'streetwear');
assert(!!streetwearFixture, 'the streetwear (BLOCK FORM) fixture exists');
const streetwearTestimonials = streetwearFixture?.document.pages.home.nodes.find((n) => n.id === 'testimonials_01');
assert(!!streetwearTestimonials, 'BLOCK FORM has a testimonials_01 node');
const streetwearTestimonialItems = Array.isArray(streetwearTestimonials?.content?.items)
  ? (streetwearTestimonials!.content!.items as Array<{ quote?: string; author?: string }>)
  : [];
assert(
  streetwearTestimonialItems.length > 0 && !!streetwearTestimonialItems[0]?.quote?.trim(),
  'BLOCK FORM testimonials_01 has a real, non-empty primary quote — sufficient for TestimonialsEditorial to render (its no-fabrication guard would otherwise return null and the section would be invisible, exactly the bug manual QA found)'
);
assert(
  !!streetwearTestimonialItems[0]?.author?.trim(),
  'BLOCK FORM testimonials_01 has a real author/name for its primary quote'
);
assert(
  streetwearTestimonials?.content?.layout === 'imageQuote',
  "BLOCK FORM testimonials_01 resolves to 'imageQuote' (typographyRole:'dominant_structural' -> imageryRole:'dominant' default), actually exercising the photo-led layout this fixture was added for"
);
const streetwearCollections = streetwearFixture?.document.pages.home.nodes.find((n) => n.id === 'collections_01');
assert(!!streetwearCollections, 'BLOCK FORM has a collections_01 node');
assert(streetwearCollections?.content?.layout === 'stacked', "BLOCK FORM collections_01 resolves to 'stacked' (asymmetry:'high')");

const modernSkincareFixture = V2_VARIETY_FIXTURES.find((f) => f.id === 'modern_skincare');
const skincareReviews = modernSkincareFixture?.document.pages.home.nodes.find((n) => n.id === 'reviews_01');
assert(skincareReviews?.content?.layout === 'grid', "Lumen Lab reviews_01 is 'grid' (its own pre-existing, explicit authoring) - unchanged by Phase 4D");

const electronicsFixture = V2_VARIETY_FIXTURES.find((f) => f.id === 'electronics');
const auricReviews = electronicsFixture?.document.pages.home.nodes.find((n) => n.id === 'reviews_01');
assert(
  auricReviews?.content?.layout === 'index',
  "Auric reviews_01 has no explicit layout and resolves to 'index' (density:'medium') - together with Lumen Lab's 'grid', both reviews layouts now have live fixture coverage, not both 'grid'"
);

console.log(failed === 0 ? '\nAll AI Studio V2 expressiveness-foundation self-tests passed.' : `\n${failed} self-test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
