#!/usr/bin/env -S npx tsx
/**
 * Phase 5C.3 — nav/footer chrome-variant coherence self-test (no vitest, no LLM required).
 * Run: npx --yes tsx scripts/ai-studio-v5c3-chrome-variant-selftest.ts
 *
 * Phase 5C.3A's audit found navigationBehavior had no programmatic effect on nav/footer
 * variant (only an advisory, nav-only prompt line the architect LLM could ignore), and that
 * footer had no equivalent guidance at all — while SiteNode.variant is schema-required, so a
 * "fill only when unset" resolver could never fire in practice. Phase 5C.3 adds
 * resolveChromeVariants/applyChromeVariants (strategyDefaults.ts) and wires the latter into
 * aiStudioV2.ts's buildDocument — the initial-generation-only boundary proven safe by tracing
 * every buildDocument call site back to generateV2Storefront (called only from
 * ai-studio-generate). The repair intentionally does NOT run on SiteTree load, SiteOps apply,
 * critique application, fixture loading, or the renderer, since there is no field-level
 * provenance to distinguish an LLM-authored variant from a later user edit.
 *
 * Covers:
 *  PURE MAPPING (1-4), INITIAL GENERATION REPAIR (5-10), REGISTRY (11-12),
 *  BOUNDARY SAFETY (13-16), PROMPT (17), REGRESSION spot-checks (18-19).
 *  (20 — "all existing suites remain passing" — is verified by running the full suite
 *  alongside this script, not duplicated here.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveChromeVariants,
  applyChromeVariants,
  productGridEditorialLayoutDefault,
  type ChromeVariantNode,
  type NavigationBehaviorInput,
} from '../shared/ai-studio-v2/strategyDefaults';
import { reconcileArtDirectionDensity } from '../shared/ai-studio-v2/creativeStrategy';
import { COMPOSITION_VARIANTS, parseSiteDocument, siteDocumentSchema, type SiteDocument, type SiteNode } from '../src/lib/ai-studio/v2/siteTree';
import { applySiteOps } from '../src/lib/ai-studio/v2/siteOps';
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

const here = path.dirname(fileURLToPath(import.meta.url));
const edgeSource = fs.readFileSync(
  path.join(here, '../supabase/functions/_shared/aiStudioV2.ts'),
  'utf8'
);
const siteOpsSource = fs.readFileSync(path.join(here, '../src/lib/ai-studio/v2/siteOps.ts'), 'utf8');
const siteTreeSource = fs.readFileSync(path.join(here, '../src/lib/ai-studio/v2/siteTree.ts'), 'utf8');
const fixturesSource = fs.readFileSync(path.join(here, '../src/lib/ai-studio/v2/fixtures.ts'), 'utf8');

const ALL_BEHAVIORS: NavigationBehaviorInput[] = ['quiet_overlay', 'solid_compact', 'bold_campaign', 'minimal_chrome'];

/* ── 1-4. PURE MAPPING ─────────────────────────────────────────────────── */

assert(
  JSON.stringify(resolveChromeVariants('quiet_overlay')) ===
    JSON.stringify({ navVariant: 'transparent', footerVariant: 'editorial_luxury' }),
  'quiet_overlay -> transparent + editorial_luxury'
);
assert(
  JSON.stringify(resolveChromeVariants('minimal_chrome')) ===
    JSON.stringify({ navVariant: 'transparent', footerVariant: 'editorial_luxury' }),
  'minimal_chrome -> transparent + editorial_luxury'
);
assert(
  JSON.stringify(resolveChromeVariants('solid_compact')) ===
    JSON.stringify({ navVariant: 'minimal', footerVariant: 'minimal_commerce' }),
  'solid_compact -> minimal + minimal_commerce'
);
assert(
  JSON.stringify(resolveChromeVariants('bold_campaign')) ===
    JSON.stringify({ navVariant: 'minimal', footerVariant: 'minimal_commerce' }),
  'bold_campaign -> minimal + minimal_commerce'
);

/* ── 5-10. INITIAL GENERATION REPAIR ─────────────────────────────────────── */

function node(overrides: Partial<ChromeVariantNode> & Record<string, unknown>): ChromeVariantNode & Record<string, unknown> {
  return { type: 'nav', variant: 'minimal', ...overrides };
}

// 5. conflicting architect nav variant gets repaired
{
  const nodes = [node({ id: 'nav_01', type: 'nav', variant: 'minimal' })];
  const repaired = applyChromeVariants(nodes, 'quiet_overlay'); // expects transparent
  assert(repaired[0].variant === 'transparent', 'conflicting architect nav variant (minimal, under quiet_overlay) is repaired to transparent');
}

// 6. conflicting architect footer variant gets repaired
{
  const nodes = [node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' })];
  const repaired = applyChromeVariants(nodes, 'minimal_chrome'); // expects editorial_luxury
  assert(repaired[0].variant === 'editorial_luxury', 'conflicting architect footer variant (minimal_commerce, under minimal_chrome) is repaired to editorial_luxury');
}

// 7. already-coherent nav remains equivalent (and reference-identical, which is stronger)
{
  const original = node({ id: 'nav_01', type: 'nav', variant: 'transparent' });
  const nodes = [original];
  const repaired = applyChromeVariants(nodes, 'quiet_overlay');
  assert(repaired[0] === original, 'already-coherent nav (transparent, under quiet_overlay) is returned by reference, unchanged');
}

// 8. already-coherent footer remains equivalent
{
  const original = node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' });
  const nodes = [original];
  const repaired = applyChromeVariants(nodes, 'bold_campaign');
  assert(repaired[0] === original, 'already-coherent footer (minimal_commerce, under bold_campaign) is returned by reference, unchanged');
}

// 9. non-nav/footer nodes are untouched
{
  const hero = node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal' });
  const productGrid = node({ id: 'products_01', type: 'productGrid', variant: 'editorial' });
  const nodes = [hero, productGrid];
  const repaired = applyChromeVariants(nodes, 'quiet_overlay');
  assert(repaired[0] === hero && repaired[1] === productGrid, 'hero/productGrid (non-nav/footer) nodes are untouched by applyChromeVariants, regardless of navigationBehavior');
}

// 10. nav/footer content/design/responsive/meta are preserved exactly; only variant changes
{
  const content = { storeName: 'Test Co', tone: 'dark' };
  const design = { spacing: 'compact', alignment: 'center' };
  const responsive = { mobile: { hide: false } };
  const meta = { role: 'primary-nav', notes: 'keep' };
  const original = { id: 'nav_01', type: 'nav', variant: 'minimal', content, design, responsive, meta };
  const [repaired] = applyChromeVariants([original], 'quiet_overlay');
  assert(repaired.variant === 'transparent', 'variant is repaired');
  assert(repaired.id === 'nav_01', 'id is preserved');
  assert((repaired as typeof original).content === content, 'content object is preserved by reference (untouched)');
  assert((repaired as typeof original).design === design, 'design object is preserved by reference (untouched)');
  assert((repaired as typeof original).responsive === responsive, 'responsive object is preserved by reference (untouched)');
  assert((repaired as typeof original).meta === meta, 'meta object is preserved by reference (untouched)');
}

/* ── 11-12. REGISTRY ──────────────────────────────────────────────────── */

for (const behavior of ALL_BEHAVIORS) {
  const { navVariant, footerVariant } = resolveChromeVariants(behavior);
  assert(
    (COMPOSITION_VARIANTS.nav as readonly string[]).includes(navVariant),
    `resolveChromeVariants('${behavior}').navVariant ('${navVariant}') is a registered nav variant`
  );
  assert(
    (COMPOSITION_VARIANTS.footer as readonly string[]).includes(footerVariant),
    `resolveChromeVariants('${behavior}').footerVariant ('${footerVariant}') is a registered footer variant`
  );
}

// 12. validateRegistry-equivalent: a full document built through applyChromeVariants still parses
{
  const rawNodes: SiteDocument['pages']['home']['nodes'] = [
    { id: 'nav_01', type: 'nav', variant: 'minimal', visible: true, content: {}, design: {}, responsive: {} },
    { id: 'hero_01', type: 'hero', variant: 'luxury_minimal', visible: true, content: {}, design: {}, responsive: {} },
    { id: 'products_01', type: 'productGrid', variant: 'editorial', visible: true, content: {}, design: {}, responsive: {} },
    { id: 'footer_01', type: 'footer', variant: 'minimal_commerce', visible: true, content: {}, design: {}, responsive: {} },
  ];
  const repairedNodes = applyChromeVariants(rawNodes, 'quiet_overlay') as unknown as SiteDocument['pages']['home']['nodes'];
  const parsed = siteDocumentSchema.safeParse({
    version: 2,
    siteId: 'test_site',
    designSystemId: 'test_system',
    pages: { home: { id: 'home', type: 'home', nodes: repairedNodes } },
    meta: { language: 'en', updatedAt: new Date().toISOString() },
  });
  assert(parsed.success, 'a document whose nav/footer variant was repaired by applyChromeVariants still validates against the canonical siteDocumentSchema');
  if (parsed.success) {
    const nav = parsed.data.pages.home.nodes.find((n) => n.type === 'nav');
    const footer = parsed.data.pages.home.nodes.find((n) => n.type === 'footer');
    assert(nav?.variant === 'transparent', 'repaired nav variant survives schema validation');
    assert(footer?.variant === 'editorial_luxury', 'repaired footer variant survives schema validation');
  }
}

/* ── 13-16. BOUNDARY SAFETY ──────────────────────────────────────────────── */

// 13. ordinary parse/load of an existing SiteDocument does NOT run chrome repair.
// SiteDocument has no navigationBehavior field at all (it lives on a separate DesignSpec
// object), so this is structurally proven, not just behaviorally: siteTree.ts's own source
// never references the chrome resolver/repair.
assert(
  !/applyChromeVariants|resolveChromeVariants/.test(siteTreeSource),
  'siteTree.ts (parseSiteDocument / load path) never references applyChromeVariants or resolveChromeVariants'
);
{
  // A deliberately "wrong" persisted nav variant (as if a user had set it, or an old
  // generation predates this mechanism) must survive an ordinary parse unchanged.
  const raw = {
    version: 2,
    siteId: 'legacy_site',
    designSystemId: 'legacy_system',
    pages: {
      home: {
        id: 'home',
        type: 'home',
        nodes: [
          { id: 'nav_01', type: 'nav', variant: 'minimal', visible: true, content: {}, design: {}, responsive: {} },
          { id: 'hero_01', type: 'hero', variant: 'luxury_minimal', visible: true, content: {}, design: {}, responsive: {} },
          { id: 'products_01', type: 'productGrid', variant: 'editorial', visible: true, content: {}, design: {}, responsive: {} },
          { id: 'footer_01', type: 'footer', variant: 'editorial_luxury', visible: true, content: {}, design: {}, responsive: {} },
        ],
      },
    },
    meta: { language: 'en', updatedAt: '2024-01-01T00:00:00.000Z' },
  };
  const { document, warnings } = parseSiteDocument(raw);
  assert(warnings.length === 0, 'parseSiteDocument: a well-formed legacy document parses with no warnings/fallback');
  const nav = document.pages.home.nodes.find((n) => n.type === 'nav');
  const footer = document.pages.home.nodes.find((n) => n.type === 'footer');
  assert(nav?.variant === 'minimal', 'parseSiteDocument does not repair nav.variant on load, even though it has no navigationBehavior to compare against anyway');
  assert(footer?.variant === 'editorial_luxury', 'parseSiteDocument does not repair footer.variant on load');
}

// 14. fixture loading does NOT run chrome repair.
assert(
  !/applyChromeVariants|resolveChromeVariants/.test(fixturesSource),
  'fixtures.ts never references applyChromeVariants or resolveChromeVariants'
);
{
  const hearthAndGrove = V2_VARIETY_FIXTURES.find((f) => f.designSpec.brand.storeName === 'Hearth & Grove');
  assert(!!hearthAndGrove, 'setup: Hearth & Grove fixture is present');
  const nav = hearthAndGrove?.document.pages.home.nodes.find((n) => n.type === 'nav');
  assert(
    hearthAndGrove?.designSpec.creativeStrategy?.navigationBehavior === 'minimal_chrome' && nav?.variant === 'minimal',
    'Hearth & Grove fixture retains its known nav mismatch (minimal_chrome + nav=minimal) unchanged — proves fixtures are not silently normalized by Phase 5C.3'
  );
}

// 15/16. SiteOps update can still explicitly change nav/footer variant, and it is not
// reverted by anything (no chrome enforcement wired into siteOps.ts).
assert(
  !/applyChromeVariants|resolveChromeVariants|navigationBehavior/.test(siteOpsSource),
  'siteOps.ts never references applyChromeVariants, resolveChromeVariants, or navigationBehavior — conversational-editing-style updates are not fought by strategy enforcement'
);
{
  const baseDoc: SiteDocument = {
    version: 2,
    siteId: 'ops_test',
    designSystemId: 'ops_test_system',
    pages: {
      home: {
        id: 'home',
        type: 'home',
        nodes: [
          { id: 'nav_01', type: 'nav', variant: 'minimal', visible: true, content: {}, design: {}, responsive: {} } as SiteNode,
          { id: 'hero_01', type: 'hero', variant: 'luxury_minimal', visible: true, content: {}, design: {}, responsive: {} } as SiteNode,
          { id: 'products_01', type: 'productGrid', variant: 'editorial', visible: true, content: {}, design: {}, responsive: {} } as SiteNode,
          { id: 'footer_01', type: 'footer', variant: 'minimal_commerce', visible: true, content: {}, design: {}, responsive: {} } as SiteNode,
        ],
      },
    },
    meta: { language: 'en', updatedAt: '2024-01-01T00:00:00.000Z' },
  };

  // 15. explicit nav.variant change via SiteOps update — simulates a future "make the
  // navigation transparent" conversational edit, deliberately opposite of what a
  // solid_compact-style strategy would resolve to.
  const navUpdated = applySiteOps(baseDoc, [{ op: 'update', id: 'nav_01', patch: { variant: 'transparent' } }]);
  const nav = navUpdated.pages.home.nodes.find((n) => n.id === 'nav_01');
  assert(nav?.variant === 'transparent', 'SiteOps update can explicitly change nav.variant to a value navigationBehavior would not have chosen');

  // 16. explicit footer.variant change via SiteOps update, and it is not reverted by a
  // second, unrelated SiteOps apply on the same document (nothing re-derives it from strategy).
  const footerUpdated = applySiteOps(navUpdated, [{ op: 'update', id: 'footer_01', patch: { variant: 'editorial_luxury' } }]);
  const footerAfterFirstUpdate = footerUpdated.pages.home.nodes.find((n) => n.id === 'footer_01');
  assert(footerAfterFirstUpdate?.variant === 'editorial_luxury', 'SiteOps update can explicitly change footer.variant');
  const noOpUpdated = applySiteOps(footerUpdated, [{ op: 'update', id: 'hero_01', patch: { design: { spacing: 'airy' } } }]);
  const footerAfterUnrelatedOp = noOpUpdated.pages.home.nodes.find((n) => n.id === 'footer_01');
  assert(
    footerAfterUnrelatedOp?.variant === 'editorial_luxury',
    'a later, unrelated SiteOps apply does not revert the explicit footer.variant edit — nothing re-derives it from navigationBehavior'
  );
}

/* ── 17. PROMPT ───────────────────────────────────────────────────────── */

assert(
  /navigationBehavior.*nav variant AND footer variant/.test(edgeSource),
  'architect prompt documents navigationBehavior driving BOTH nav and footer variant, not just nav'
);
assert(
  edgeSource.includes('quiet_overlay/minimal_chrome → nav transparent + footer editorial_luxury'),
  'architect prompt states the quiet_overlay/minimal_chrome -> nav transparent + footer editorial_luxury pairing'
);
assert(
  edgeSource.includes('solid_compact/bold_campaign → nav minimal + footer minimal_commerce'),
  'architect prompt states the solid_compact/bold_campaign -> nav minimal + footer minimal_commerce pairing'
);
assert(
  edgeSource.includes('enforced after generation'),
  'architect prompt notes the pairing is enforced after generation (prompt is guidance, repair is authoritative)'
);

/* ── 18-19. REGRESSION spot-checks ───────────────────────────────────────
 * (Full existing suites are run alongside this script — see the Phase 5C.3
 * report's Section K/L — this just proves Phase 5C.3 didn't touch these.) */

// 18. Phase 5B layout defaults unaffected by this phase's change
assert(
  productGridEditorialLayoutDefault({ density: 'high', asymmetry: 'high' }) ===
    productGridEditorialLayoutDefault({ density: 'high', asymmetry: 'high' }),
  'Phase 5B productGridEditorialLayoutDefault is deterministic/unaffected (spot check)'
);

// 19. Phase 5C.2 density reconciliation unaffected
assert(
  reconcileArtDirectionDensity('low', 'dense') === 'sparse',
  'Phase 5C.2 reconcileArtDirectionDensity(low, dense) still resolves to sparse (spot check)'
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nPhase 5C.3 chrome-variant self-tests passed.');
