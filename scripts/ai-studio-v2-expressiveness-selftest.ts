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
  normalizeDesignSemantics,
  type StrategyInput,
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

console.log(failed === 0 ? '\nAll AI Studio V2 expressiveness-foundation self-tests passed.' : `\n${failed} self-test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
