#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Phase 6A responsive contract foundation self-test (no vitest, no LLM
 * required). Run: npx --yes tsx scripts/ai-studio-v2-phase6a-responsive-selftest.ts
 *
 * Covers the Phase 6A infrastructure added on top of the Phase 6.1/6A.0 audit+decision:
 *  1. Schema backward compatibility — old SiteDocuments (no contentOrder/columns, no
 *     responsive overrides at all) still parse; responsive.tablet is untouched.
 *  2. contentOrder/columns applicability — every registered (type, variant) composition is
 *     checked against both tables so a future composition added without an explicit
 *     applicability decision fails this test (safe default: not applicable).
 *  3. SiteOps — update op can set contentOrder/columns on an applicable node, rejects them
 *     on an unsupported node, existing responsive fields still patch, an unrelated
 *     design/style patch does not erase responsive.mobile values.
 *  4. Direct runtime override coverage — withResponsiveOverride (extracted to its own
 *     CSS-free module specifically so it's testable here) exercised directly for hide/
 *     variant/spacing/minHeight in both compact and non-compact states, plus same-reference
 *     (no-op) behavior when nothing applies.
 *  5. Breakpoint regression — isCompactViewportWidth (the V2-local compact-viewport helper
 *     that replaced useIsMobile() in SiteTreeRenderer.tsx) is correct at the exact Phase
 *     6.1-identified seam: 800px is compact, 960px is compact, 961px is not.
 *  6. New-primitive exposure — mobileOrderAttr/mobileColumnsAttr (the pure helpers
 *     compositions.tsx uses to emit data-mobile-order/data-mobile-cols) round-trip the
 *     authored values correctly, including the 'preserve' no-op case.
 *
 * Phase 6A.1 review-fix additions (closing two silent-no-op capabilities the review found):
 *  7. Layout-aware contentOrder applicability — editorialSplit/image_text's
 *     `overlayStatement` content.layout is explicitly REJECTED (no media/copy grid to
 *     reorder), while `classicSplit`/`offsetNarrow`/unset remain accepted, at every
 *     validation boundary this Node process can reach (schema/validateSiteTree/siteOps).
 *  8. Truthful applicability audit — every accepted (type, variant[, layout]) combination
 *     for BOTH contentOrder and columns is checked against v2.css's actual source text for
 *     a real selector consumer (not a DOM render — a maintainable text-presence guard, the
 *     same technique scripts/ai-studio-v2-expressiveness-selftest.ts and
 *     scripts/ai-studio-v2-typography-rhythm-selftest.ts already use). Zero deliberately
 *     accepted combination may lack one.
 *  9. productGrid/editorial columns on featureFirst/asymmetricFeature — verifies the fix
 *     targets each layout's own SECONDARY/repeating region (`.ai-v2-merch-side`,
 *     `.ai-v2-merch-asymmetric-fill`) and never the anchor/featured region.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  CONTENT_ORDER_VALUES,
  MOBILE_COLUMNS_VALUES,
  isContentOrderApplicable,
  isColumnsApplicable,
  isValidContentOrder,
  isValidMobileColumns,
  validateResponsiveApplicability,
} from '../shared/ai-studio-v2/responsiveApplicability';
import { siteDocumentSchema, siteNodeSchema, type SiteNode } from '../src/lib/ai-studio/v2/siteTree';
import { applySiteOps, siteOpsSchema } from '../src/lib/ai-studio/v2/siteOps';
import { validateSiteTree, validateResponsivePrimitives } from '../src/lib/ai-studio/v2/validateSiteTree';
import { listRegisteredCompositions } from '../src/lib/ai-studio/v2/compositionCatalog';
import { withResponsiveOverride, mobileOrderAttr, mobileColumnsAttr } from '../src/lib/ai-studio/v2/responsiveOverride';
import { isCompactViewportWidth, V2_COMPACT_BREAKPOINT } from '../src/components/templates/ai/v2/useCompactViewport';

const here = path.dirname(fileURLToPath(import.meta.url));
const v2Css = fs.readFileSync(path.join(here, '../src/components/templates/ai/v2/v2.css'), 'utf8');
const compositionsSource = fs.readFileSync(
  path.join(here, '../src/components/templates/ai/v2/compositions.tsx'),
  'utf8'
);

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function node(partial: Partial<SiteNode> & Pick<SiteNode, 'id' | 'type' | 'variant'>): SiteNode {
  return siteNodeSchema.parse({ content: {}, design: {}, responsive: {}, ...partial });
}

function baseDocument(nodes: SiteNode[]) {
  return {
    version: 2 as const,
    siteId: 'phase6a-selftest',
    designSystemId: 'phase6a-selftest',
    pages: { home: { id: 'home', type: 'home' as const, nodes } },
    meta: { language: 'en' as const, updatedAt: new Date().toISOString() },
  };
}

/* 1. Backward compatibility ---------------------------------------------------------- */

const legacyNodes: SiteNode[] = [
  node({ id: 'nav_01', type: 'nav', variant: 'minimal' }),
  node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' } }),
  node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    dataBindings: { products: 'featured', limit: 8 },
  }),
  node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
];
const legacyParsed = siteDocumentSchema.safeParse(baseDocument(legacyNodes));
assert(legacyParsed.success, 'a pre-Phase-6A document with no contentOrder/columns/responsive overrides still parses');

const oldMobileShapeNode = node({
  id: 'hero_01',
  type: 'hero',
  variant: 'luxury_minimal',
  content: { title: 'Store' },
  responsive: { mobile: { variant: 'product_focus', hide: false, spacing: 'airy', minHeight: '80vh' } },
});
const oldMobileShapeParsed = siteNodeSchema.safeParse(oldMobileShapeNode);
assert(
  oldMobileShapeParsed.success,
  'a responsive.mobile object using only the pre-Phase-6A fields (variant/hide/spacing/minHeight) still parses unchanged'
);

const tabletNode = node({
  id: 'hero_01',
  type: 'hero',
  variant: 'luxury_minimal',
  responsive: { tablet: { variant: 'product_focus', hide: true, spacing: 'cozy' } },
});
assert(siteNodeSchema.safeParse(tabletNode).success, 'responsive.tablet remains untouched and still parses');

/* 2. Applicability tables ------------------------------------------------------------- */

const registered = listRegisteredCompositions();
assert(registered.length > 0, 'compositionCatalog has registered compositions to check applicability against');

const expectedContentOrderAllow = new Set([
  'hero/editorial_split',
  'hero/product_focus',
  'editorialSplit/image_text',
  'productSpotlight/feature',
]);
const expectedColumnsAllow = new Set(['productGrid/editorial', 'reviews/wall', 'collections/tiles']);

let applicabilityDriftFound = false;
for (const { type, variant } of registered) {
  const key = `${type}/${variant}`;
  const expectedOrder = expectedContentOrderAllow.has(key);
  const actualOrder = isContentOrderApplicable(type, variant);
  if (actualOrder !== expectedOrder) {
    applicabilityDriftFound = true;
    console.error(`FAIL: contentOrder applicability drift for ${key} (expected ${expectedOrder}, got ${actualOrder})`);
  }
  const expectedColumns = expectedColumnsAllow.has(key);
  const actualColumns = isColumnsApplicable(type, variant);
  if (actualColumns !== expectedColumns) {
    applicabilityDriftFound = true;
    console.error(`FAIL: columns applicability drift for ${key} (expected ${expectedColumns}, got ${actualColumns})`);
  }
}
assert(
  !applicabilityDriftFound,
  `every registered (type, variant) composition (${registered.length} total) matches its expected contentOrder/columns applicability — a new composition added without an explicit entry would fail here (safe default: not applicable)`
);

// Required positive tests (contentOrder)
for (const key of expectedContentOrderAllow) {
  const [type, variant] = key.split('/');
  assert(isContentOrderApplicable(type, variant), `contentOrder is applicable on ${key}`);
}
// Required positive tests (columns)
for (const key of expectedColumnsAllow) {
  const [type, variant] = key.split('/');
  assert(isColumnsApplicable(type, variant), `columns is applicable on ${key}`);
}

// Required negative tests
assert(!isContentOrderApplicable('hero', 'luxury_minimal'), 'contentOrder is NOT applicable on hero/luxury_minimal (no separate media region to reorder)');
assert(!isColumnsApplicable('productGrid', 'luxury_image_first'), 'columns is NOT applicable on productGrid/luxury_image_first (deliberately single-column at every breakpoint)');
assert(!isColumnsApplicable('productRail', 'horizontal'), 'columns is NOT applicable on productRail/horizontal (flex row, not a column grid)');
assert(!isContentOrderApplicable('nav', 'minimal'), 'contentOrder is NOT applicable on nav/minimal');
assert(!isColumnsApplicable('nav', 'minimal'), 'columns is NOT applicable on nav/minimal');
assert(!isContentOrderApplicable('productGrid', 'editorial'), 'contentOrder is NOT applicable on productGrid/editorial (not a two-region media/text composition)');
assert(!isColumnsApplicable('hero', 'editorial_split'), 'columns is NOT applicable on hero/editorial_split (not a grid composition)');

// Enum-level validation
for (const v of CONTENT_ORDER_VALUES) assert(isValidContentOrder(v), `'${v}' is a valid contentOrder value`);
assert(!isValidContentOrder('reverse'), "'reverse' is rejected as a contentOrder value (not the chosen API — see Phase 6A.0 decision)");
assert(!isValidContentOrder('media-first'), "a near-miss spelling ('media-first') is rejected");
for (const v of MOBILE_COLUMNS_VALUES) assert(isValidMobileColumns(v), `${v} is a valid columns value`);
assert(!isValidMobileColumns(3), '3 is rejected as a columns value (only 1|2 are supported in Phase 6A)');
assert(!isValidMobileColumns('2'), "the string '2' is rejected — columns must be a number, not a numeric string");

// validateResponsiveApplicability message content
const appErrors = validateResponsiveApplicability('productGrid', 'editorial', { contentOrder: 'media_first' });
assert(
  appErrors.length === 1 && appErrors[0].includes('responsive.mobile.contentOrder') && appErrors[0].includes('productGrid/editorial'),
  'validateResponsiveApplicability names the offending field and node type/variant'
);
assert(
  validateResponsiveApplicability('hero', 'editorial_split', { contentOrder: 'media_first' }).length === 0,
  'validateResponsiveApplicability accepts contentOrder on an applicable node'
);
assert(
  validateResponsiveApplicability('hero', 'editorial_split', undefined).length === 0,
  'validateResponsiveApplicability is a no-op when responsive.mobile is absent'
);

/* 3. validateSiteTree / validateResponsivePrimitives ---------------------------------- */

const docWithBadOrder = baseDocument([
  legacyNodes[0], // nav_01
  legacyNodes[1], // hero_01
  node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    dataBindings: { products: 'featured', limit: 8 },
    responsive: { mobile: { contentOrder: 'media_first' } },
  }),
  legacyNodes[3], // footer_01
]);
const badOrderResult = validateSiteTree(docWithBadOrder);
assert(
  !badOrderResult.ok && badOrderResult.issues.some((i) => i.message.includes('responsive.mobile.contentOrder')),
  'validateSiteTree rejects contentOrder authored on productGrid/editorial (unsupported node)'
);

const docWithGoodOrder = baseDocument([
  node({
    id: 'nav_01',
    type: 'nav',
    variant: 'minimal',
  }),
  node({
    id: 'hero_01',
    type: 'hero',
    variant: 'editorial_split',
    content: { title: 'Store' },
    responsive: { mobile: { contentOrder: 'text_first' } },
  }),
  node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    dataBindings: { products: 'featured', limit: 8 },
    responsive: { mobile: { columns: 2 } },
  }),
  node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
]);
const goodOrderResult = validateSiteTree(docWithGoodOrder);
assert(goodOrderResult.ok, 'validateSiteTree accepts contentOrder/columns authored on applicable nodes');
assert(
  validateResponsivePrimitives(docWithGoodOrder.pages.home.nodes).length === 0,
  'validateResponsivePrimitives finds no issues on a fully-applicable document'
);

/* 4. SiteOps --------------------------------------------------------------------------- */

function opsDoc() {
  return baseDocument([
    node({ id: 'nav_01', type: 'nav', variant: 'minimal' }),
    node({ id: 'hero_01', type: 'hero', variant: 'editorial_split', content: { title: 'Store' } }),
    node({
      id: 'products_01',
      type: 'productGrid',
      variant: 'editorial',
      dataBindings: { products: 'featured', limit: 8 },
    }),
    node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
  ]);
}

const setContentOrderOps = siteOpsSchema.parse([
  { op: 'update', id: 'hero_01', patch: { responsive: { mobile: { contentOrder: 'text_first' } } } },
]);
const afterContentOrder = applySiteOps(opsDoc(), setContentOrderOps);
assert(
  afterContentOrder.pages.home.nodes.find((n) => n.id === 'hero_01')?.responsive?.mobile?.contentOrder === 'text_first',
  'SiteOps update op can set contentOrder on an applicable node (hero/editorial_split)'
);

const rejectContentOrderOps = siteOpsSchema.parse([
  { op: 'update', id: 'products_01', patch: { responsive: { mobile: { contentOrder: 'media_first' } } } },
]);
let rejectedContentOrder = false;
try {
  applySiteOps(opsDoc(), rejectContentOrderOps);
} catch (err) {
  rejectedContentOrder = err instanceof Error && err.message.includes('responsive.mobile.contentOrder');
}
assert(rejectedContentOrder, 'SiteOps update op REJECTS contentOrder on an unsupported node (productGrid/editorial), naming the field');

const setColumnsOps = siteOpsSchema.parse([{ op: 'update', id: 'products_01', patch: { responsive: { mobile: { columns: 1 } } } }]);
const afterColumns = applySiteOps(opsDoc(), setColumnsOps);
assert(
  afterColumns.pages.home.nodes.find((n) => n.id === 'products_01')?.responsive?.mobile?.columns === 1,
  'SiteOps update op can set columns on an applicable node (productGrid/editorial)'
);

const rejectColumnsOps = siteOpsSchema.parse([{ op: 'update', id: 'hero_01', patch: { responsive: { mobile: { columns: 2 } } } }]);
let rejectedColumns = false;
try {
  applySiteOps(opsDoc(), rejectColumnsOps);
} catch (err) {
  rejectedColumns = err instanceof Error && err.message.includes('responsive.mobile.columns');
}
assert(rejectedColumns, 'SiteOps update op REJECTS columns on an unsupported node (hero/editorial_split), naming the field');

// Existing fields still patch successfully alongside the new ones.
const mixedOps = siteOpsSchema.parse([
  {
    op: 'update',
    id: 'hero_01',
    patch: { responsive: { mobile: { hide: false, spacing: 'dramatic', minHeight: '60vh', contentOrder: 'preserve' } } },
  },
]);
const afterMixed = applySiteOps(opsDoc(), mixedOps);
const mixedMobile = afterMixed.pages.home.nodes.find((n) => n.id === 'hero_01')?.responsive?.mobile;
assert(
  mixedMobile?.spacing === 'dramatic' && mixedMobile?.minHeight === '60vh' && mixedMobile?.contentOrder === 'preserve',
  'existing responsive.mobile fields (spacing/minHeight/hide) still patch successfully alongside the new contentOrder field'
);

// An unrelated design/style patch does not erase responsive.mobile values.
const withMobileAlready = applySiteOps(opsDoc(), [
  { op: 'update', id: 'hero_01', patch: { responsive: { mobile: { contentOrder: 'text_first' } } } },
]);
const styleOps = siteOpsSchema.parse([{ op: 'style', id: 'hero_01', design: { spacing: 'compact' } }]);
const afterStyle = applySiteOps(withMobileAlready, styleOps);
assert(
  afterStyle.pages.home.nodes.find((n) => n.id === 'hero_01')?.responsive?.mobile?.contentOrder === 'text_first',
  'an unrelated `style` op (design-only patch) does not erase an already-set responsive.mobile.contentOrder value'
);

/* 5. Direct responsive runtime override coverage --------------------------------------- */

const desktopHero = node({
  id: 'hero_01',
  type: 'hero',
  variant: 'luxury_minimal',
  content: { title: 'Store' },
  responsive: { mobile: { hide: true, variant: 'product_focus', spacing: 'compact', minHeight: '60vh' } },
});
const nonCompactResult = withResponsiveOverride(desktopHero, false);
assert(nonCompactResult === desktopHero, 'withResponsiveOverride(node, isCompact=false) returns the SAME node reference — desktop untouched');
assert(nonCompactResult.visible !== false, 'in the non-compact state, mobile.hide has no effect');
assert(nonCompactResult.variant === 'luxury_minimal', 'in the non-compact state, mobile.variant has no effect');

const compactHiddenResult = withResponsiveOverride(desktopHero, true);
assert(compactHiddenResult.visible === false, 'withResponsiveOverride applies mobile.hide in the compact state');

const compactVariantNode = node({
  id: 'hero_01',
  type: 'hero',
  variant: 'luxury_minimal',
  responsive: { mobile: { variant: 'product_focus', spacing: 'compact', minHeight: '60vh' } },
});
const compactVariantResult = withResponsiveOverride(compactVariantNode, true);
assert(compactVariantResult.variant === 'product_focus', 'withResponsiveOverride applies mobile.variant in the compact state (same-type swap)');
assert(compactVariantResult.design?.spacing === 'compact', 'withResponsiveOverride applies mobile.spacing in the compact state');
assert(compactVariantResult.design?.minHeight === '60vh', 'withResponsiveOverride applies mobile.minHeight in the compact state');

const crossTypeVariantNode = node({
  id: 'products_01',
  type: 'productGrid',
  variant: 'editorial',
  responsive: { mobile: { variant: 'luxury_minimal' } }, // a hero variant — invalid for productGrid
});
const crossTypeResult = withResponsiveOverride(crossTypeVariantNode, true);
assert(
  crossTypeResult.variant === 'editorial',
  'withResponsiveOverride falls back to the desktop variant when mobile.variant is cross-type-invalid, instead of applying it'
);

const noOverrideNode = node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', responsive: {} });
assert(
  withResponsiveOverride(noOverrideNode, true) === noOverrideNode,
  'withResponsiveOverride returns the SAME node reference when responsive.mobile is absent, even when compact'
);

/* 6. Breakpoint boundary (the exact Phase 6.1 seam) ------------------------------------- */

assert(V2_COMPACT_BREAKPOINT === 960, 'V2 compact breakpoint constant is 960, matching v2.css\'s primary structural collapse');
assert(isCompactViewportWidth(800), '800px (the Phase 6.1-identified seam — CSS already compact, old 768px JS threshold was not) now resolves as compact');
assert(isCompactViewportWidth(960), '960px (the exact threshold) resolves as compact');
assert(!isCompactViewportWidth(961), '961px does not resolve as compact');
assert(isCompactViewportWidth(390), '390px (phone-width, unambiguously compact) resolves as compact');
assert(!isCompactViewportWidth(1280), '1280px (desktop) does not resolve as compact');

/* 7. New-primitive exposure (data-attribute helpers) ------------------------------------ */

const orderedNode = node({
  id: 'hero_01',
  type: 'hero',
  variant: 'editorial_split',
  responsive: { mobile: { contentOrder: 'media_first' } },
});
assert(mobileOrderAttr(orderedNode) === 'media_first', 'mobileOrderAttr surfaces an explicitly authored contentOrder value');

const preserveNode = node({
  id: 'hero_01',
  type: 'hero',
  variant: 'editorial_split',
  responsive: { mobile: { contentOrder: 'preserve' } },
});
assert(mobileOrderAttr(preserveNode) === undefined, "mobileOrderAttr returns undefined for 'preserve' (no attribute emitted — CSS default behavior stands)");

const unsetOrderNode = node({ id: 'hero_01', type: 'hero', variant: 'editorial_split' });
assert(mobileOrderAttr(unsetOrderNode) === undefined, 'mobileOrderAttr returns undefined when contentOrder is unset');

const columnsNode = node({
  id: 'products_01',
  type: 'productGrid',
  variant: 'editorial',
  responsive: { mobile: { columns: 2 } },
});
assert(mobileColumnsAttr(columnsNode) === '2', 'mobileColumnsAttr surfaces an explicitly authored columns value as a string attribute');

const unsetColumnsNode = node({ id: 'products_01', type: 'productGrid', variant: 'editorial' });
assert(mobileColumnsAttr(unsetColumnsNode) === undefined, 'mobileColumnsAttr returns undefined when columns is unset');

/* 8. overlayStatement — layout-aware rejection, not a silent no-op (Phase 6A.1 Blocker 1) -- */

assert(
  isContentOrderApplicable('editorialSplit', 'image_text', 'classicSplit'),
  'contentOrder remains applicable on editorialSplit/image_text content.layout=classicSplit'
);
assert(
  isContentOrderApplicable('editorialSplit', 'image_text', 'offsetNarrow'),
  'contentOrder remains applicable on editorialSplit/image_text content.layout=offsetNarrow'
);
assert(
  isContentOrderApplicable('editorialSplit', 'image_text', undefined),
  'contentOrder remains applicable on editorialSplit/image_text with no content.layout (defaults to classicSplit)'
);
assert(
  !isContentOrderApplicable('editorialSplit', 'image_text', 'overlayStatement'),
  'contentOrder is REJECTED on editorialSplit/image_text content.layout=overlayStatement (no media/copy grid to reorder)'
);

const overlayStatementErrors = validateResponsiveApplicability(
  'editorialSplit',
  'image_text',
  { contentOrder: 'text_first' },
  'overlayStatement'
);
assert(
  overlayStatementErrors.length === 1 &&
    overlayStatementErrors[0].includes('responsive.mobile.contentOrder') &&
    overlayStatementErrors[0].includes('overlayStatement'),
  'validateResponsiveApplicability rejects contentOrder on overlayStatement and names both the field and the layout value'
);
assert(
  validateResponsiveApplicability('editorialSplit', 'image_text', { contentOrder: 'text_first' }, 'classicSplit').length === 0,
  'validateResponsiveApplicability accepts contentOrder on classicSplit (the same type/variant, a different layout)'
);

// End-to-end: a node whose content.layout is ALREADY overlayStatement must be rejected by
// validateSiteTree even when the layout wasn't just now being set in the same patch.
const overlayStatementNode = node({
  id: 'story_01',
  type: 'editorialSplit',
  variant: 'image_text',
  content: { title: 'Story', layout: 'overlayStatement' },
  responsive: { mobile: { contentOrder: 'text_first' } },
});
assert(
  validateResponsiveApplicability(
    overlayStatementNode.type,
    overlayStatementNode.variant,
    overlayStatementNode.responsive?.mobile,
    overlayStatementNode.content?.layout
  ).length === 1,
  'a fully-resolved node with content.layout=overlayStatement and responsive.mobile.contentOrder set is rejected'
);

// SiteOps: patching ONLY responsive (not content.layout) on a node that is ALREADY
// overlayStatement must still be rejected — this is exactly the "effectiveLayout" fix
// (siteOps.ts now reads the resolved node's own content.layout, not just the patch's).
function overlayStatementDoc() {
  return baseDocument([
    node({ id: 'nav_01', type: 'nav', variant: 'minimal' }),
    node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' } }),
    node({
      id: 'story_01',
      type: 'editorialSplit',
      variant: 'image_text',
      content: { title: 'Story', layout: 'overlayStatement' },
    }),
    node({
      id: 'products_01',
      type: 'productGrid',
      variant: 'editorial',
      dataBindings: { products: 'featured', limit: 8 },
    }),
    node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
  ]);
}
const overlayStatementOps = siteOpsSchema.parse([
  { op: 'update', id: 'story_01', patch: { responsive: { mobile: { contentOrder: 'text_first' } } } },
]);
let rejectedOverlayStatement = false;
try {
  applySiteOps(overlayStatementDoc(), overlayStatementOps);
} catch (err) {
  rejectedOverlayStatement =
    err instanceof Error && err.message.includes('responsive.mobile.contentOrder') && err.message.includes('overlayStatement');
}
assert(
  rejectedOverlayStatement,
  'SiteOps rejects a responsive-only patch setting contentOrder on a node already resolved to content.layout=overlayStatement, even though the patch itself never repeats "layout"'
);

// And the positive case: the same patch on a classicSplit (default) editorialSplit node succeeds.
const classicSplitDoc = baseDocument([
  node({ id: 'nav_01', type: 'nav', variant: 'minimal' }),
  node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' } }),
  node({ id: 'story_01', type: 'editorialSplit', variant: 'image_text', content: { title: 'Story' } }),
  node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    dataBindings: { products: 'featured', limit: 8 },
  }),
  node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
]);
const classicSplitAfter = applySiteOps(classicSplitDoc, overlayStatementOps);
assert(
  classicSplitAfter.pages.home.nodes.find((n) => n.id === 'story_01')?.responsive?.mobile?.contentOrder === 'text_first',
  'the identical responsive-only patch succeeds on a default (classicSplit) editorialSplit node'
);

// Renderer honesty: the overlayStatement JSX branch must not emit data-mobile-order at all
// (defense in depth — even hand-crafted data that bypassed validation gets no attribute to
// act on). Located via the same text-presence technique used elsewhere in this file.
const overlayBranchStart = compositionsSource.indexOf("layout === 'overlayStatement'");
const overlayBranchEnd = compositionsSource.indexOf('ai-v2-editorial-overlay-panel');
assert(
  overlayBranchStart > -1 && overlayBranchEnd > overlayBranchStart,
  "compositions.tsx's overlayStatement branch is present for structural inspection"
);
const overlayBranchSource = compositionsSource.slice(overlayBranchStart, overlayBranchEnd);
assert(
  // Matches the literal JSX attribute usage (`data-mobile-order={...}`), not prose in a
  // comment that happens to mention the attribute's name (e.g. explaining its absence).
  !overlayBranchSource.includes('data-mobile-order={'),
  'the overlayStatement JSX branch does NOT emit data-mobile-order (renderer-level honesty, not just validation)'
);

/* 9. Truthful applicability audit — every accepted combination has a real CSS consumer --- */

type ContentOrderCase = { type: string; variant: string; layout?: string; cssMustContain: string[] };
const CONTENT_ORDER_RENDER_CONSUMERS: ContentOrderCase[] = [
  {
    type: 'hero',
    variant: 'editorial_split',
    cssMustContain: [
      ".ai-v2-hero-split[data-mobile-order='media_first'] .ai-v2-hero-media",
      ".ai-v2-hero-split[data-mobile-order='text_first'] .ai-v2-hero-media",
      ".ai-v2-hero-split[data-mobile-order='text_first'] .ai-v2-hero-copy",
    ],
  },
  {
    type: 'hero',
    variant: 'product_focus',
    cssMustContain: [
      ".ai-v2-hero-product[data-mobile-order='media_first'] .ai-v2-hero-product-figure",
      ".ai-v2-hero-product[data-mobile-order='text_first'] .ai-v2-hero-product-figure",
    ],
  },
  {
    type: 'editorialSplit',
    variant: 'image_text',
    layout: 'classicSplit',
    cssMustContain: [".ai-v2-editorial-split[data-mobile-order='text_first'] .ai-v2-editorial-grid > .ai-v2-editorial-copy"],
  },
  {
    type: 'editorialSplit',
    variant: 'image_text',
    layout: 'offsetNarrow',
    cssMustContain: [".ai-v2-editorial-split[data-mobile-order='text_first'] .ai-v2-editorial-grid > .ai-v2-editorial-copy"],
  },
  {
    type: 'productSpotlight',
    variant: 'feature',
    cssMustContain: [
      ".ai-v2-spotlight[data-mobile-order='media_first'] .ai-v2-spotlight-media",
      ".ai-v2-spotlight[data-mobile-order='text_first'] .ai-v2-spotlight-copy",
      ".ai-v2-spotlight[data-mobile-order='text_first'] .ai-v2-spotlight-media",
    ],
  },
];

for (const c of CONTENT_ORDER_RENDER_CONSUMERS) {
  assert(
    isContentOrderApplicable(c.type, c.variant, c.layout),
    `sanity: ${c.type}/${c.variant}${c.layout ? ` (layout=${c.layout})` : ''} is still applicable before checking its CSS consumer`
  );
  for (const selector of c.cssMustContain) {
    assert(
      v2Css.includes(selector),
      `v2.css has a real CSS consumer for contentOrder on ${c.type}/${c.variant}${c.layout ? `/${c.layout}` : ''}: "${selector}"`
    );
  }
}

// The one accepted (type, variant) with a layout-dependent exception must have NO CSS
// consumer claimed for the excluded layout — proven by the earlier rejection tests, and
// reconfirmed here structurally: overlayStatement's own selectors never appear alongside
// data-mobile-order anywhere in v2.css (checked in section 8 above via the JSX branch).
assert(
  !isContentOrderApplicable('editorialSplit', 'image_text', 'overlayStatement'),
  'overlayStatement has zero declared contentOrder applicability, and (section 8) zero rendered attribute — no deliberately-accepted silent no-op remains'
);

type ColumnsCase = { type: string; variant: string; cssMustContain: string[] };
const COLUMNS_RENDER_CONSUMERS: ColumnsCase[] = [
  {
    type: 'productGrid',
    variant: 'editorial',
    cssMustContain: [
      ".ai-v2-merch[data-mobile-cols='1'] .ai-v2-merch-grid", // standardEditorial + dense
      ".ai-v2-merch[data-mobile-cols='2'] .ai-v2-merch-grid",
      ".ai-v2-merch[data-mobile-cols='1'] .ai-v2-merch-side", // featureFirst secondary region
      ".ai-v2-merch[data-mobile-cols='2'] .ai-v2-merch-side",
      ".ai-v2-merch[data-mobile-cols='1'] .ai-v2-merch-asymmetric-fill", // asymmetricFeature fill region
      ".ai-v2-merch[data-mobile-cols='2'] .ai-v2-merch-asymmetric-fill",
    ],
  },
  {
    type: 'reviews',
    variant: 'wall',
    cssMustContain: [".ai-v2-reviews[data-mobile-cols='1'] .ai-v2-reviews-grid", ".ai-v2-reviews[data-mobile-cols='2'] .ai-v2-reviews-grid"],
  },
  {
    type: 'collections',
    variant: 'tiles',
    cssMustContain: [
      ".ai-v2-collections[data-mobile-cols='1'] .ai-v2-collections-editorial",
      ".ai-v2-collections[data-mobile-cols='2'] .ai-v2-collections-editorial",
    ],
  },
];

for (const c of COLUMNS_RENDER_CONSUMERS) {
  assert(isColumnsApplicable(c.type, c.variant), `sanity: ${c.type}/${c.variant} is still applicable before checking its CSS consumer`);
  for (const selector of c.cssMustContain) {
    assert(v2Css.includes(selector), `v2.css has a real CSS consumer for columns on ${c.type}/${c.variant}: "${selector}"`);
  }
}

/* 10. featureFirst/asymmetricFeature columns control the SECONDARY region only ------------ */

const dataMobileColsLines = v2Css.split('\n').filter((line) => line.includes('data-mobile-cols'));
assert(dataMobileColsLines.length > 0, 'v2.css has at least one data-mobile-cols selector to check');
const anchorLeak = dataMobileColsLines.filter((line) => line.includes('anchor'));
assert(
  anchorLeak.length === 0,
  `no data-mobile-cols selector targets an anchor/featured region (found: ${JSON.stringify(anchorLeak)}) — featureFirst/asymmetricFeature's featured hierarchy is untouched by the columns primitive`
);
const outerFeatureLeak = dataMobileColsLines.filter(
  (line) => /\.ai-v2-merch-feature\b(?!-)/.test(line) && !line.includes('.ai-v2-merch-side')
);
assert(
  outerFeatureLeak.length === 0,
  `no data-mobile-cols selector targets .ai-v2-merch-feature's outer 2-column split directly (found: ${JSON.stringify(outerFeatureLeak)}) — only its secondary .ai-v2-merch-side region is controlled`
);

// Absent columns preserves today's exact behavior: the pre-existing, unscoped base rules
// for each repeating region must still exist verbatim (a regression guard against the fix
// accidentally replacing rather than layering on top of the current defaults).
assert(v2Css.includes('.ai-v2-merch-grid {'), 'the base (unscoped) .ai-v2-merch-grid rule still exists — columns is additive, not a replacement');
assert(v2Css.includes('.ai-v2-merch-side {'), 'the base (unscoped) .ai-v2-merch-side rule still exists');
assert(v2Css.includes('.ai-v2-merch-asymmetric-fill {'), 'the base (unscoped) .ai-v2-merch-asymmetric-fill rule still exists');

/* 11. Phase 6B — Site Architect prompt contract (hero mobile-order reasoning guidance) ---
   supabase/functions/_shared/aiStudioV2.ts imports zod from a remote https:// specifier
   (Deno-only), so it cannot be imported as a module from this plain Node/tsx script — same
   constraint scripts/ai-studio-v5a-pipeline-survival-selftest.ts already works around by
   reading it as raw text and asserting on stable source markers instead of executing it.
   This section reuses that exact technique for the Phase 6B prompt addition. */

const edgeSrc = fs.readFileSync(path.join(here, '../supabase/functions/_shared/aiStudioV2.ts'), 'utf8');

// A. The pre-existing Phase 6A contentOrder capability/applicability contract is unchanged.
assert(
  edgeSrc.includes('responsive.mobile.contentOrder (preserve|media_first|text_first): which of a two-region'),
  'Site Architect prompt still states the contentOrder capability contract verbatim'
);
assert(
  edgeSrc.includes('hero/editorial_split, hero/product_focus, productSpotlight/feature, and'),
  'Site Architect prompt still lists all four contentOrder-applicable compositions'
);
assert(
  edgeSrc.includes('editorialSplit/image_text EXCEPT when its content.layout is overlayStatement'),
  'Site Architect prompt still states the overlayStatement layout-aware exception'
);

// B. The pre-existing Phase 6A columns capability/applicability contract is unchanged —
//    Phase 6B adds no new columns policy (Phase 6B.0 decision D).
assert(
  edgeSrc.includes('responsive.mobile.columns (1|2): forces the mobile column count for a grid composition.'),
  'Site Architect prompt still states the columns capability contract verbatim'
);
assert(
  edgeSrc.includes('Valid ONLY on productGrid/editorial, reviews/wall, and collections/tiles'),
  'Site Architect prompt still lists all three columns-applicable compositions'
);

// C. The new Phase 6B hero mobile-order reasoning guidance carries the required semantic
//    markers — tested as stable short phrases, not a full-paragraph snapshot, so future
//    wording edits don't break this test unless the underlying idea is actually dropped.
const heroGuidanceStart = edgeSrc.indexOf('HERO MOBILE ORDER (hero/editorial_split');
const heroGuidanceEnd = edgeSrc.indexOf('responsive.mobile.columns (1|2): forces the mobile column count');
assert(
  heroGuidanceStart !== -1 && heroGuidanceEnd !== -1 && heroGuidanceEnd > heroGuidanceStart,
  'Site Architect prompt has a HERO MOBILE ORDER guidance block that precedes the columns capability text'
);
const heroGuidanceBlock = heroGuidanceStart !== -1 && heroGuidanceEnd > heroGuidanceStart
  ? edgeSrc.slice(heroGuidanceStart, heroGuidanceEnd)
  : '';

assert(
  edgeSrc.includes('collapse their side-by-side media/copy regions into a single'),
  'hero guidance states that a compact hero turns a side-by-side composition into a sequence'
);
assert(
  edgeSrc.includes('carry the opening beat'),
  'hero guidance frames the decision as which region carries the opening beat'
);
assert(
  edgeSrc.includes('genuine mobile art-direction decision'),
  'hero guidance frames media_first/text_first as a deliberate art-direction decision, not a formatting default'
);
assert(
  edgeSrc.includes('leave contentOrder unset'),
  'hero guidance states that leaving contentOrder unset is the correct move when signals are weak/mixed/conflicting'
);
assert(
  edgeSrc.includes('not an error state'),
  'hero guidance explicitly frames the unset/media-first default as a considered fallback, not an error'
);
assert(
  edgeSrc.includes('These are NOT deterministic rules'),
  'hero guidance explicitly disclaims deterministic-rule status for the Design DNA evidence it names'
);

// Anti-pattern guards: the guidance must reason, not template a lookup table, and must stay
// scoped to the two heroes Phase 6B actually covers (Phase 6B.0 decision — hero-specific,
// not extended to productSpotlight/editorialSplit/productGrid/reviews/collections).
assert(
  !edgeSrc.includes('typographyRole=dominant_structural -> text_first'),
  'prompt does NOT contain a hardcoded typographyRole->text_first lookup rule'
);
assert(
  !edgeSrc.includes('imageryRole=dominant -> media_first'),
  'prompt does NOT contain a hardcoded imageryRole->media_first lookup rule'
);
assert(!/->/.test(heroGuidanceBlock), 'hero mobile-order guidance contains no "->" lookup-table-style mapping');
assert(
  !/productSpotlight|editorialSplit|productGrid|reviews\/wall|collections\/tiles/.test(heroGuidanceBlock),
  'hero mobile-order guidance stays hero-scoped (no productSpotlight/editorialSplit/productGrid/reviews/collections mention)'
);

if (failed > 0) {
  console.error(`\n${failed} Phase 6A responsive self-test(s) FAILED.`);
  process.exit(1);
} else {
  console.log('\nAll Phase 6A responsive self-tests passed.');
}
