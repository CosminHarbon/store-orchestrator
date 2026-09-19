#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Phase 6C mobile-only page placement self-test (no vitest, no LLM required).
 * Run: npx --yes tsx scripts/ai-studio-v2-phase6c-placement-selftest.ts
 *
 * Covers the Phase 6C architecture (see Phase 6C.0/6C.0B/6C.0C audits + this phase's
 * implementation report) — a persisted-vs-patch schema split for responsive.mobile,
 * responsive.mobile.placement page-level mobile-only ordering, the shallow-merge bug fix,
 * and a stable-topological-sort resolver:
 *
 *  A. old/pre-6C SiteDocuments parse unchanged (no placement field anywhere)
 *  B. persisted schema accepts a concrete valid placement
 *  C. persisted schema rejects null under responsive (placement and other fields)
 *  D. patch schema (SiteOps update.patch) accepts null clear sentinels
 *  E. applySiteOps never persists a literal null under responsive
 *  F. partial mobile patch preserves sibling fields (the original shallow-merge bug, fixed)
 *  G/H/I. clear one field / whole mobile / whole responsive
 *  J. resolver cases A-F from the accepted spec (stable topological sort, not splice)
 *  K. hidden-anchor fallback (placement ignored, stable desktop-relative position)
 *  L/Q. stale/deleted/corrupt anchor — resolver never crashes
 *  M/N. nav/footer mover/anchor rejection
 *  O/P. 2-node / 3-node cycle rejection through applySiteOps
 *  R. delete auto-clears incoming placement references
 *  S. batch-order-sensitive behavior (accepted, not a bug — see Phase 6C.0C §H)
 *  T. desktop path never invokes the placement resolver (structural source check)
 *  U. real fixtures still parse unchanged under the new schema
 *  V. client/edge schema parity (structural text-presence check)
 *  W. responsive.tablet stays dormant — no placement capability, silently stripped
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  siteDocumentSchema,
  siteNodeSchema,
  nodeResponsiveSchema,
  mobilePlacementSchema,
  type SiteDocument,
  type SiteNode,
} from '../src/lib/ai-studio/v2/siteTree';
import { applySiteOps, siteOpsSchema, responsivePatchSchema } from '../src/lib/ai-studio/v2/siteOps';
import {
  isPlacementAllowed,
  buildPlacementEdges,
  stableTopologicalSort,
  validatePlacementGraph,
} from '../shared/ai-studio-v2/responsiveApplicability';
import { withResponsiveOverride, resolveMobileOrder } from '../src/lib/ai-studio/v2/responsiveOverride';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererSource = fs.readFileSync(
  path.join(here, '../src/components/templates/ai/v2/SiteTreeRenderer.tsx'),
  'utf8'
);
const clientSchemaSource = fs.readFileSync(path.join(here, '../src/lib/ai-studio/v2/siteTree.ts'), 'utf8');
const edgeSchemaSource = fs.readFileSync(
  path.join(here, '../supabase/functions/_shared/aiStudioV2.ts'),
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

function baseDocument(nodes: SiteNode[]): SiteDocument {
  return siteDocumentSchema.parse(rawDocument(nodes));
}

/** Unvalidated document shape — for tests that intentionally construct invalid data and want
 *  to assert against `.safeParse` themselves, rather than have `baseDocument` throw first. */
function rawDocument(nodes: unknown[]): unknown {
  return {
    version: 2,
    siteId: 'phase6c-selftest',
    designSystemId: 'phase6c-selftest',
    pages: { home: { id: 'home', type: 'home', nodes } },
    meta: { language: 'en', updatedAt: new Date().toISOString() },
  };
}

/** Standard 4-required-node skeleton (nav/hero/product/footer) plus caller-supplied extras,
 *  so every test document satisfies siteDocumentSchema's own required-node superRefine. */
function skeletonWithExtras(extras: SiteNode[]): SiteNode[] {
  return [
    node({ id: 'nav_01', type: 'nav', variant: 'minimal', content: { storeName: 'Test' } }),
    node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 't', subtitle: 's', cta: 'c' } }),
    ...extras,
    node({ id: 'products_01', type: 'productGrid', variant: 'editorial', content: { title: 'p' } }),
    node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce', content: { storeName: 'Test' } }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// A. old/pre-6C SiteDocuments parse unchanged
// ─────────────────────────────────────────────────────────────────────────
{
  const doc = baseDocument(skeletonWithExtras([]));
  const parsed = siteDocumentSchema.safeParse(doc);
  assert(parsed.success, 'A: a document with no placement anywhere still parses');
}

// ─────────────────────────────────────────────────────────────────────────
// B. persisted schema accepts a concrete valid placement
// ─────────────────────────────────────────────────────────────────────────
{
  const story = node({
    id: 'story_01',
    type: 'editorialSplit',
    variant: 'image_text',
    content: { title: 't', body: 'b' },
    responsive: { mobile: { placement: { afterId: 'products_01' } } },
  });
  const doc = baseDocument(skeletonWithExtras([story]));
  const parsed = siteDocumentSchema.safeParse(doc);
  assert(parsed.success, 'B: a concrete { afterId } placement parses on the persisted schema');
  assert(
    mobilePlacementSchema.safeParse({ beforeId: 'ab' }).success,
    'B: mobilePlacementSchema accepts a bare { beforeId }'
  );
  assert(
    !mobilePlacementSchema.safeParse({ beforeId: 'ab', afterId: 'cd' }).success,
    'B: mobilePlacementSchema rejects both beforeId AND afterId together'
  );
  assert(!mobilePlacementSchema.safeParse({}).success, 'B: mobilePlacementSchema rejects neither beforeId nor afterId');
}

// ─────────────────────────────────────────────────────────────────────────
// C. persisted schema rejects null under responsive (never a null sentinel)
// ─────────────────────────────────────────────────────────────────────────
{
  const rawWithNullPlacement = {
    id: 'x_01',
    type: 'newsletter',
    variant: 'quiet',
    content: {},
    design: {},
    responsive: { mobile: { placement: null } },
  };
  assert(
    !siteNodeSchema.safeParse(rawWithNullPlacement).success,
    'C: persisted schema rejects responsive.mobile.placement = null'
  );
  const rawNode = {
    id: 'x_01',
    type: 'newsletter',
    variant: 'quiet',
    content: {},
    design: {},
    responsive: { mobile: { contentOrder: null } },
  };
  assert(!siteNodeSchema.safeParse(rawNode).success, 'C: persisted schema rejects responsive.mobile.contentOrder = null');
  assert(
    !siteNodeSchema.safeParse({ ...rawNode, responsive: { mobile: null } }).success,
    'C: persisted schema rejects responsive.mobile = null (mobile must be an object or absent)'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// D. patch schema accepts null clear sentinels
// ─────────────────────────────────────────────────────────────────────────
{
  assert(
    responsivePatchSchema.safeParse({ mobile: { contentOrder: null } }).success,
    'D: patch schema accepts a single-field null clear'
  );
  assert(responsivePatchSchema.safeParse({ mobile: null }).success, 'D: patch schema accepts mobile: null');
  assert(responsivePatchSchema.safeParse({ tablet: null }).success, 'D: patch schema accepts tablet: null');
  const updateOp = {
    op: 'update' as const,
    id: 'x_01',
    patch: { responsive: null },
  };
  assert(siteOpsSchema.safeParse([updateOp]).success, 'D: siteOpSchema update.patch accepts responsive: null at the outer level');
}

// ─────────────────────────────────────────────────────────────────────────
// E/F/G/H/I. merge fix + clear semantics via applySiteOps
// ─────────────────────────────────────────────────────────────────────────
{
  // productGrid/editorial (not editorialSplit) so `columns` is applicable alongside `hide`/
  // `spacing`/`minHeight` on the same node (contentOrder and columns are never applicable to
  // the same composition type — see responsiveApplicability.ts — so this test uses the set of
  // sibling fields that genuinely co-occur on one real node).
  const story = node({
    id: 'story_01',
    type: 'productGrid',
    variant: 'editorial',
    content: { title: 't' },
    responsive: { mobile: { hide: false, spacing: 'airy', minHeight: '60vh', columns: 2 } },
  });
  const doc = baseDocument(skeletonWithExtras([story]));

  // F: the exact bug-report example — a patch touching only `placement` must NOT drop
  // hide/spacing/minHeight/columns.
  const patched = applySiteOps(doc, [
    {
      op: 'update',
      id: 'story_01',
      patch: { responsive: { mobile: { placement: { afterId: 'products_01' } } } },
    },
  ]);
  const patchedStory = patched.pages.home.nodes.find((n) => n.id === 'story_01')!;
  assert(patchedStory.responsive.mobile?.hide === false, 'F: partial patch preserves sibling `hide`');
  assert(patchedStory.responsive.mobile?.spacing === 'airy', 'F: partial patch preserves sibling `spacing`');
  assert(patchedStory.responsive.mobile?.minHeight === '60vh', 'F: partial patch preserves sibling `minHeight`');
  assert(patchedStory.responsive.mobile?.columns === 2, 'F: partial patch preserves sibling `columns`');
  assert(
    patchedStory.responsive.mobile?.placement &&
      'afterId' in patchedStory.responsive.mobile.placement &&
      patchedStory.responsive.mobile.placement.afterId === 'products_01',
    'F: partial patch applies the new `placement` field'
  );

  // E: no literal null anywhere under responsive after applySiteOps.
  assert(!JSON.stringify(patched.pages.home.nodes).includes(':null'), 'E: applySiteOps result contains no JSON null values');

  // G: clear one field.
  const clearedOne = applySiteOps(patched, [
    { op: 'update', id: 'story_01', patch: { responsive: { mobile: { spacing: null } } } },
  ]);
  const clearedOneStory = clearedOne.pages.home.nodes.find((n) => n.id === 'story_01')!;
  assert(clearedOneStory.responsive.mobile?.spacing === undefined, 'G: spacing cleared');
  assert(clearedOneStory.responsive.mobile?.columns === 2, 'G: clearing one field preserves siblings (columns)');
  assert(
    clearedOneStory.responsive.mobile?.placement !== undefined,
    'G: clearing one field preserves siblings (placement)'
  );

  // H: clear whole mobile.
  const clearedMobile = applySiteOps(clearedOne, [
    { op: 'update', id: 'story_01', patch: { responsive: { mobile: null } } },
  ]);
  const clearedMobileStory = clearedMobile.pages.home.nodes.find((n) => n.id === 'story_01')!;
  assert(clearedMobileStory.responsive.mobile === undefined, 'H: whole mobile object removed');

  // I: clear whole responsive.
  const withTablet = applySiteOps(clearedMobile, [
    {
      op: 'update',
      id: 'story_01',
      patch: { responsive: { mobile: { hide: true }, tablet: { hide: true } } },
    },
  ]);
  const clearedAll = applySiteOps(withTablet, [{ op: 'update', id: 'story_01', patch: { responsive: null } }]);
  const clearedAllStory = clearedAll.pages.home.nodes.find((n) => n.id === 'story_01')!;
  assert(clearedAllStory.responsive.mobile === undefined, 'I: whole-responsive clear removes mobile');
  assert(clearedAllStory.responsive.tablet === undefined, 'I: whole-responsive clear removes tablet');
  assert(
    siteDocumentSchema.safeParse(clearedAll).success,
    'I: document with a fully-cleared responsive still parses (round-trips to {})'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// J. resolver cases A-F (stable topological sort)
// ─────────────────────────────────────────────────────────────────────────
{
  function abcd(placements: {
    a?: { beforeId?: string; afterId?: string };
    b?: { beforeId?: string; afterId?: string };
    c?: { beforeId?: string; afterId?: string };
    d?: { beforeId?: string; afterId?: string };
  }): SiteNode[] {
    const mk = (id: string, type: SiteNode['type'], variant: string, placement?: { beforeId?: string; afterId?: string }) =>
      node({
        id,
        type,
        variant,
        content: {},
        responsive: placement ? { mobile: { placement: placement as never } } : {},
      });
    return [
      mk('node_a', 'editorialSplit', 'image_text', placements.a),
      mk('node_b', 'productSpotlight', 'feature', placements.b),
      mk('node_c', 'editorialMosaic', 'asymmetric', placements.c),
      mk('node_d', 'newsletter', 'quiet', placements.d),
    ];
  }
  function order(nodes: SiteNode[]): string[] {
    return resolveMobileOrder(nodes).map((n) => n.id);
  }

  assert(
    JSON.stringify(order(abcd({ a: { beforeId: 'node_b' }, b: { beforeId: 'node_c' } }))) ===
      JSON.stringify(['node_a', 'node_b', 'node_c', 'node_d']),
    'J.A: A before B, B before C -> A B C D'
  );
  assert(
    JSON.stringify(order(abcd({ a: { afterId: 'node_b' }, b: { afterId: 'node_c' } }))) ===
      JSON.stringify(['node_c', 'node_b', 'node_a', 'node_d']),
    'J.B: A after B, B after C -> C B A D (naive splice previously got this wrong)'
  );
  assert(
    JSON.stringify(order(abcd({ a: { beforeId: 'node_c' }, b: { beforeId: 'node_c' } }))) ===
      JSON.stringify(['node_a', 'node_b', 'node_c', 'node_d']),
    'J.C: A before C, B before C -> A B C D'
  );
  assert(
    JSON.stringify(order(abcd({ a: { afterId: 'node_c' }, b: { afterId: 'node_c' } }))) ===
      JSON.stringify(['node_c', 'node_a', 'node_b', 'node_d']),
    'J.D: A after C, B after C -> C A B D (mutual order preserved, unlike naive splice)'
  );
  assert(
    JSON.stringify(order(abcd({ a: { beforeId: 'node_b' }, c: { afterId: 'node_a' } }))) ===
      JSON.stringify(['node_a', 'node_b', 'node_c', 'node_d']),
    'J.E: A before B, C after A -> A B C D (minimal rearrangement)'
  );
  // J.F: raw/corrupt 3-node cycle input — never crash, deterministic edge-drop.
  const cyclic = abcd({
    a: { beforeId: 'node_b' },
    b: { beforeId: 'node_c' },
    c: { beforeId: 'node_a' },
  });
  let cyclicResult: string[] = [];
  let threw = false;
  try {
    cyclicResult = order(cyclic);
  } catch {
    threw = true;
  }
  assert(!threw, 'J.F: resolver never throws on a 3-node cycle');
  assert(cyclicResult.length === 4 && new Set(cyclicResult).size === 4, 'J.F: resolver returns every node exactly once on a cycle');
  assert(
    JSON.stringify(cyclicResult) === JSON.stringify(['node_a', 'node_b', 'node_c', 'node_d']),
    'J.F: cycle-closing edge (processed last in desktop order) is deterministically dropped'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// K. hidden-anchor fallback
// ─────────────────────────────────────────────────────────────────────────
{
  const story = node({
    id: 'story_01',
    type: 'editorialSplit',
    variant: 'image_text',
    content: { title: 't', body: 'b' },
    responsive: { mobile: { placement: { afterId: 'products_01' } } },
  });
  const rail = node({ id: 'rail_01', type: 'productRail', variant: 'horizontal', content: {} });
  const productsHiddenOnMobile = node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    content: { title: 'p' },
    responsive: { mobile: { hide: true } },
  });
  const nav = node({ id: 'nav_01', type: 'nav', variant: 'minimal', content: { storeName: 'Test' } });
  const hero = node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 't', subtitle: 's', cta: 'c' } });
  const footer = node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce', content: { storeName: 'Test' } });
  const desktopOrder = [nav, hero, story, productsHiddenOnMobile, rail, footer];

  const overridden = desktopOrder.map((n) => withResponsiveOverride(n, true));
  const visible = overridden.filter((n) => n.visible !== false);
  assert(!visible.some((n) => n.id === 'products_01'), 'K: hidden node is filtered out before resolution');
  const resolved = resolveMobileOrder(visible).map((n) => n.id);
  const expectedFallback = desktopOrder.filter((n) => n.id !== 'products_01').map((n) => n.id);
  assert(
    JSON.stringify(resolved) === JSON.stringify(expectedFallback),
    'K: story falls back to its stable desktop-relative position when its anchor is hidden'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// L/Q. stale/deleted/corrupt anchor — resolver never crashes
// ─────────────────────────────────────────────────────────────────────────
{
  const story = node({
    id: 'story_01',
    type: 'editorialSplit',
    variant: 'image_text',
    content: { title: 't', body: 'b' },
    responsive: { mobile: { placement: { afterId: 'deleted_ghost_01' } } },
  });
  const others = [
    node({ id: 'nav_01', type: 'nav', variant: 'minimal', content: { storeName: 'Test' } }),
    node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 't', subtitle: 's', cta: 'c' } }),
    node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce', content: { storeName: 'Test' } }),
  ];
  let threw = false;
  let result: string[] = [];
  try {
    result = resolveMobileOrder([others[0], others[1], story, others[2]]).map((n) => n.id);
  } catch {
    threw = true;
  }
  assert(!threw, 'L/Q: resolver never throws on a placement referencing a nonexistent node id');
  assert(
    JSON.stringify(result) === JSON.stringify(['nav_01', 'hero_01', 'story_01', 'footer_01']),
    'L/Q: node with a stale anchor falls back to its own desktop-relative position'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// M/N. nav/footer mover/anchor rejection
// ─────────────────────────────────────────────────────────────────────────
{
  assert(!isPlacementAllowed('nav'), 'M: isPlacementAllowed(nav) is false');
  assert(!isPlacementAllowed('footer'), 'M: isPlacementAllowed(footer) is false');
  assert(isPlacementAllowed('hero'), 'M: isPlacementAllowed(hero) is true (not restricted)');
  assert(isPlacementAllowed('announcement'), 'M: isPlacementAllowed(announcement) is true (not restricted)');

  const story = node({
    id: 'story_01',
    type: 'editorialSplit',
    variant: 'image_text',
    content: { title: 't', body: 'b' },
  });
  const docBase = skeletonWithExtras([story]);

  // M: nav carrying a placement — via full document validation.
  const navWithPlacement = docBase.map((n) =>
    n.id === 'nav_01' ? { ...n, responsive: { mobile: { placement: { beforeId: 'hero_01' } as never } } } : n
  );
  assert(
    !siteDocumentSchema.safeParse(rawDocument(navWithPlacement)).success,
    'M: a document where nav_01 carries a placement is rejected'
  );

  // N: an ordinary node anchoring to nav — via full document validation.
  const storyAnchoredToNav = docBase.map((n) =>
    n.id === 'story_01' ? { ...n, responsive: { mobile: { placement: { beforeId: 'nav_01' } as never } } } : n
  );
  assert(
    !siteDocumentSchema.safeParse(rawDocument(storyAnchoredToNav)).success,
    'N: a document where story_01 anchors to nav_01 is rejected'
  );

  // Same two cases through applySiteOps (SiteOps write path), not just document load.
  const doc = baseDocument(docBase);
  let navThrew = false;
  try {
    applySiteOps(doc, [{ op: 'update', id: 'nav_01', patch: { responsive: { mobile: { placement: { beforeId: 'hero_01' } } } } }]);
  } catch {
    navThrew = true;
  }
  assert(navThrew, 'M: applySiteOps rejects a placement authored on nav_01');

  let anchorThrew = false;
  try {
    applySiteOps(doc, [{ op: 'update', id: 'story_01', patch: { responsive: { mobile: { placement: { beforeId: 'nav_01' } } } } }]);
  } catch {
    anchorThrew = true;
  }
  assert(anchorThrew, 'N: applySiteOps rejects a placement anchoring to nav_01');
}

// ─────────────────────────────────────────────────────────────────────────
// O/P. 2-node / 3-node cycle rejection through applySiteOps
// ─────────────────────────────────────────────────────────────────────────
{
  const nodeA = node({ id: 'node_a', type: 'editorialSplit', variant: 'image_text', content: {} });
  const nodeB = node({ id: 'node_b', type: 'productSpotlight', variant: 'feature', content: {} });
  const nodeC = node({ id: 'node_c', type: 'editorialMosaic', variant: 'asymmetric', content: {} });
  const doc2 = baseDocument(skeletonWithExtras([nodeA, nodeB]));
  let threw2 = false;
  try {
    applySiteOps(doc2, [
      { op: 'update', id: 'node_a', patch: { responsive: { mobile: { placement: { afterId: 'node_b' } } } } },
      { op: 'update', id: 'node_b', patch: { responsive: { mobile: { placement: { afterId: 'node_a' } } } } },
    ]);
  } catch {
    threw2 = true;
  }
  assert(threw2, 'O: applySiteOps rejects a 2-node mutual placement cycle');

  const doc3 = baseDocument(skeletonWithExtras([nodeA, nodeB, nodeC]));
  let threw3 = false;
  try {
    applySiteOps(doc3, [
      { op: 'update', id: 'node_a', patch: { responsive: { mobile: { placement: { beforeId: 'node_b' } } } } },
      { op: 'update', id: 'node_b', patch: { responsive: { mobile: { placement: { beforeId: 'node_c' } } } } },
      { op: 'update', id: 'node_c', patch: { responsive: { mobile: { placement: { beforeId: 'node_a' } } } } },
    ]);
  } catch {
    threw3 = true;
  }
  assert(threw3, 'P: applySiteOps rejects a 3-node placement cycle');
}

// ─────────────────────────────────────────────────────────────────────────
// R. delete auto-clears incoming placement references
// ─────────────────────────────────────────────────────────────────────────
{
  const spotlight = node({ id: 'spotlight_01', type: 'productSpotlight', variant: 'feature', content: { title: 't', body: 'b' } });
  const story = node({
    id: 'story_01',
    type: 'editorialSplit',
    variant: 'image_text',
    content: { title: 't', body: 'b' },
    responsive: { mobile: { placement: { afterId: 'spotlight_01' } } },
  });
  const doc = baseDocument(skeletonWithExtras([spotlight, story]));
  const afterDelete = applySiteOps(doc, [{ op: 'delete', id: 'spotlight_01' }]);
  const storyAfter = afterDelete.pages.home.nodes.find((n) => n.id === 'story_01')!;
  assert(storyAfter.responsive.mobile?.placement === undefined, 'R: deleting the anchor clears the referencing placement');
  assert(afterDelete.pages.home.nodes.every((n) => n.id !== 'spotlight_01'), 'R: the deleted node is actually gone');
  assert(siteDocumentSchema.safeParse(afterDelete).success, 'R: the resulting document still parses cleanly');
}

// ─────────────────────────────────────────────────────────────────────────
// S. batch-order-sensitive behavior (accepted, documented in Phase 6C.0C §H)
// ─────────────────────────────────────────────────────────────────────────
{
  const spotlight = node({ id: 'spotlight_01', type: 'productSpotlight', variant: 'feature', content: { title: 't', body: 'b' } });
  const story = node({ id: 'story_01', type: 'editorialSplit', variant: 'image_text', content: { title: 't', body: 'b' } });
  const doc = baseDocument(skeletonWithExtras([spotlight, story]));

  // Order 1: delete first, then reference the just-deleted node -> rejected (dangling ref).
  let order1Threw = false;
  try {
    applySiteOps(doc, [
      { op: 'delete', id: 'spotlight_01' },
      { op: 'update', id: 'story_01', patch: { responsive: { mobile: { placement: { afterId: 'spotlight_01' } } } } },
    ]);
  } catch {
    order1Threw = true;
  }
  assert(order1Threw, 'S: delete-then-reference-the-deleted-node is rejected');

  // Order 2 (reversed): set the placement first (target still exists), then delete ->
  // succeeds, with the placement auto-cleared as a side effect of the delete.
  const order2Result = applySiteOps(doc, [
    { op: 'update', id: 'story_01', patch: { responsive: { mobile: { placement: { afterId: 'spotlight_01' } } } } },
    { op: 'delete', id: 'spotlight_01' },
  ]);
  const storyOrder2 = order2Result.pages.home.nodes.find((n) => n.id === 'story_01')!;
  assert(storyOrder2.responsive.mobile?.placement === undefined, 'S: reference-then-delete succeeds with the placement auto-cleared');
}

// ─────────────────────────────────────────────────────────────────────────
// T. desktop path never invokes the placement resolver (structural source check)
// ─────────────────────────────────────────────────────────────────────────
{
  const earlyReturnIdx = rendererSource.indexOf('if (!isCompact) return overridden;');
  const resolverCallIdx = rendererSource.indexOf('resolveMobileOrder(visible)');
  assert(earlyReturnIdx >= 0, 'T: SiteTreeRenderer.tsx has an explicit desktop early-return');
  assert(resolverCallIdx >= 0, 'T: SiteTreeRenderer.tsx calls resolveMobileOrder on the compact path');
  assert(earlyReturnIdx < resolverCallIdx, 'T: the desktop early-return precedes the resolver call (desktop never reaches it)');
}

// ─────────────────────────────────────────────────────────────────────────
// U. real fixtures still parse unchanged under the new schema
//
// Deliberately backward-compatibility-only: whether any fixture currently authors
// `placement` is a snapshot of today's fixture content, not a product invariant — a later
// phase may legitimately add placement to a fixture, and this test must not break when it
// does. Non-modification of fixtures.ts FOR THIS PHASE is confirmed separately via
// git diff/status (see the Phase 6C.1 report), not by an assertion baked into this file.
// ─────────────────────────────────────────────────────────────────────────
{
  for (const fixture of V2_VARIETY_FIXTURES) {
    const parsed = siteDocumentSchema.safeParse(fixture.document);
    assert(parsed.success, `U: fixture "${fixture.id}" still parses under the Phase 6C schema`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// V. client/edge schema parity (structural text-presence check)
// ─────────────────────────────────────────────────────────────────────────
{
  for (const src of [clientSchemaSource, edgeSchemaSource]) {
    assert(src.includes('beforeId'), 'V: schema source mentions beforeId');
    assert(src.includes('afterId'), 'V: schema source mentions afterId');
  }
  assert(edgeSchemaSource.includes("z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/i)"), 'V: edge placement id uses the same regex/bounds as node ids');
}

// ─────────────────────────────────────────────────────────────────────────
// W. responsive.tablet stays dormant — no placement capability
// ─────────────────────────────────────────────────────────────────────────
{
  const tabletShape = nodeResponsiveSchema.shape.tablet.unwrap().shape as Record<string, unknown>;
  assert(!('placement' in tabletShape), 'W: nodeResponsiveSchema.tablet has no placement field');

  const parsedWithTabletPlacement = siteNodeSchema.safeParse(
    node({
      id: 'x_01',
      type: 'newsletter',
      variant: 'quiet',
      responsive: { tablet: { placement: { beforeId: 'y_01' } } as never },
    })
  );
  assert(parsedWithTabletPlacement.success, 'W: an unrecognized tablet.placement key does not fail parsing (default strip mode)');
  if (parsedWithTabletPlacement.success) {
    assert(
      !('placement' in (parsedWithTabletPlacement.data.responsive.tablet ?? {})),
      'W: an authored tablet.placement is silently stripped, never persisted'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Extra: buildPlacementEdges/stableTopologicalSort direct unit coverage
// ─────────────────────────────────────────────────────────────────────────
{
  const selfRef = buildPlacementEdges([
    { id: 'a', type: 'hero', responsive: { mobile: { placement: { beforeId: 'a' } } } },
  ]);
  assert(selfRef.dropped[0]?.reason === 'self_reference', 'extra: self-reference is dropped with the right reason');

  const missing = buildPlacementEdges([
    { id: 'a', type: 'hero', responsive: { mobile: { placement: { beforeId: 'ghost' } } } },
  ]);
  assert(missing.dropped[0]?.reason === 'missing_target', 'extra: missing target is dropped with the right reason');

  const restrictedMover = buildPlacementEdges([
    { id: 'nav_01', type: 'nav', responsive: { mobile: { placement: { beforeId: 'x' } } } },
    { id: 'x', type: 'hero' },
  ]);
  assert(restrictedMover.dropped[0]?.reason === 'restricted_mover', 'extra: nav as mover is dropped with the right reason');

  const restrictedAnchor = buildPlacementEdges([
    { id: 'x', type: 'hero', responsive: { mobile: { placement: { beforeId: 'footer_01' } } } },
    { id: 'footer_01', type: 'footer' },
  ]);
  assert(restrictedAnchor.dropped[0]?.reason === 'restricted_anchor', 'extra: footer as anchor is dropped with the right reason');

  assert(
    validatePlacementGraph([{ id: 'a', type: 'hero', responsive: { mobile: { placement: { beforeId: 'a' } } } }]).length === 1,
    'extra: validatePlacementGraph surfaces exactly one human-readable message for one bad placement'
  );

  assert(
    JSON.stringify(stableTopologicalSort(['x', 'y', 'z'], [])) === JSON.stringify(['x', 'y', 'z']),
    'extra: stableTopologicalSort is a no-op with no edges'
  );
}

if (failed > 0) {
  console.error(`\n${failed} Phase 6C placement self-test(s) FAILED.`);
  process.exit(1);
} else {
  console.log('\nAll Phase 6C placement self-tests passed.');
}
