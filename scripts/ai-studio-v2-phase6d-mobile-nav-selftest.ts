#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Phase 6D mobile navigation self-test (no vitest, no browser/DOM runner
 * required — none is installed in this repo; see the Phase 6D report for why this stays in
 * the same source-contract / pure-function style as the existing Phase 6A/6C selftests).
 * Run: npx --yes tsx scripts/ai-studio-v2-phase6d-mobile-nav-selftest.ts
 *
 * Covers what is mechanically provable without rendering a DOM:
 *  A. Both nav variants (minimal/transparent) still resolve through the one shared
 *     NavChrome component reference.
 *  B. Desktop nav actions (commerce.setView('home') / commerce.openCatalog()) still exist.
 *  C. The mobile trigger carries aria-expanded, aria-controls, and a LOCALIZED (t(...), not
 *     a hardcoded literal) accessible label.
 *  D. Mobile menu actions call the exact same commerce handlers as desktop — no
 *     content.links / second link list / new routing model was introduced.
 *  E. Cart stays outside the menu panel, both structurally (source order) and behaviorally
 *     (the panel's own source slice never mentions the cart).
 *  F. The new menu CSS is governed by the existing max-width:960px breakpoint.
 *  G. No 768px / Tailwind `md:` breakpoint was introduced into the V2 nav files.
 *  H. The panel's background is an opaque tokenized surface (var(--ai-bg)), not
 *     transparent, and is NOT scoped only to the minimal variant.
 *  I. SITE_DOCUMENT_VERSION is unchanged (2).
 *  J. Existing variety fixtures still construct/parse (fixtures.ts calls
 *     siteDocumentSchema.parse at module load — an import failure here IS a regression).
 *  K. responsive.tablet remains untouched by the new hide-on-nav rule.
 *  L. responsive.mobile.hide === true on a nav node is rejected via validateResponsiveApplicability,
 *     end-to-end via SiteOps (update op throws), AND at raw persisted-document parse time
 *     (siteDocumentSchema.safeParse — the path AiStorefrontTemplate.tsx actually loads
 *     through for both a draft preview and a published live storefront; Phase 6D.1 found
 *     this path did NOT enforce the rule before).
 *  M. hide: false / omitted remains valid on nav (both via the validator and via a raw
 *     persisted-document parse), and hide: true on a NON-nav type (footer) is still accepted
 *     everywhere (validator, SiteOps, and raw persisted parse) — nav-only, not chrome-wide.
 *  N. No new SiteTree field was added anywhere for hamburger/menuOpen state — the
 *     responsive.mobile object's field set is exactly the pre-6D set, and siteNodeSchema's
 *     own top-level field set is unchanged too.
 *  O. Desktop nav labels no longer hardcode English — NavChrome uses tNav('nav.home')/
 *     tNav('nav.shop') (a { lng: language } override pinned to document.meta.language,
 *     since Phase 6D.1 found the ambient i18n.language actually follows the merchant's own
 *     dashboard/account language, not this specific storefront's generation language) and
 *     the old literal ">Home<"/">Shop<" JSX text is gone.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  validateResponsiveApplicability,
} from '../shared/ai-studio-v2/responsiveApplicability';
import {
  siteDocumentSchema,
  siteNodeSchema,
  nodeResponsiveSchema,
  SITE_DOCUMENT_VERSION,
  type SiteNode,
} from '../src/lib/ai-studio/v2/siteTree';
import { applySiteOps, siteOpsSchema } from '../src/lib/ai-studio/v2/siteOps';
import { resolveComposition } from '../src/components/templates/ai/v2/registry';
import { V2_VARIETY_FIXTURES } from '../src/lib/ai-studio/v2/fixtures';

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
    siteId: 'phase6d-selftest',
    designSystemId: 'phase6d-selftest',
    pages: { home: { id: 'home', type: 'home' as const, nodes } },
    meta: { language: 'en' as const, updatedAt: new Date().toISOString() },
  };
}

function opsDoc() {
  return baseDocument([
    node({ id: 'nav_01', type: 'nav', variant: 'minimal' }),
    node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' } }),
    node({
      id: 'products_01',
      type: 'productGrid',
      variant: 'editorial',
      dataBindings: { products: 'featured', limit: 8 },
    }),
    node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
  ]);
}

/* Scope text-presence checks to NavChrome's own function body, not the whole 1000+ line
 * file, so an unrelated match elsewhere (e.g. a different composition) can't false-positive. */
const navChromeStart = compositionsSource.indexOf('function NavChrome(');
const navChromeEnd = compositionsSource.indexOf('export function NavMinimal(');
assert(navChromeStart !== -1 && navChromeEnd !== -1 && navChromeEnd > navChromeStart, 'NavChrome function body is present and precedes NavMinimal/NavTransparent exports');
const navChromeSource = compositionsSource.slice(navChromeStart, navChromeEnd);

/* A. Shared component identity across both nav variants ------------------------------ */

const minimalEntry = resolveComposition('nav', 'minimal');
const transparentEntry = resolveComposition('nav', 'transparent');
assert(minimalEntry && transparentEntry, 'both nav/minimal and nav/transparent resolve to a registered composition');
assert(
  minimalEntry?.Component !== transparentEntry?.Component,
  'nav/minimal and nav/transparent are distinct thin wrappers (NavMinimal/NavTransparent), not literally the same export'
);
const navMinimalSource = compositionsSource.slice(
  compositionsSource.indexOf('export function NavMinimal('),
  compositionsSource.indexOf('export function NavTransparent(')
);
const navTransparentSource = compositionsSource.slice(
  compositionsSource.indexOf('export function NavTransparent('),
  compositionsSource.indexOf('export function AnnouncementSlim(')
);
assert(
  navMinimalSource.includes('<NavChrome') && navTransparentSource.includes('<NavChrome'),
  'both NavMinimal and NavTransparent delegate to the one shared NavChrome component (no third mobile-only variant)'
);

/* B. Desktop nav actions still exist --------------------------------------------------- */

assert(navChromeSource.includes("commerce.setView('home')"), "desktop nav still calls commerce.setView('home')");
assert(navChromeSource.includes('commerce.openCatalog()'), 'desktop nav still calls commerce.openCatalog()');

/* C. Mobile trigger accessibility contract -------------------------------------------- */

assert(navChromeSource.includes('aria-expanded={menuOpen}'), 'mobile trigger carries aria-expanded bound to open state');
assert(navChromeSource.includes('aria-controls={panelId}'), 'mobile trigger carries aria-controls referencing the panel id');
assert(
  navChromeSource.includes("tNav('nav.openMenu')") && navChromeSource.includes("tNav('nav.closeMenu')"),
  'trigger accessible label is localized via t(...), not a hardcoded literal, for both open and closed states'
);
assert(
  navChromeSource.includes('useId()'),
  'panel id uses a stable local id strategy (useId) rather than a hardcoded global id'
);
assert(!/role=["']menu["']/.test(navChromeSource), 'no menu/menubar ARIA role is used for the compact panel');

/* Phase 6D.1 — render-timing guard: menuOpen alone is not enough. On a compact -> desktop
 * viewport transition, menuOpen only resets via a useEffect, which runs AFTER the first
 * desktop-width render — a `{menuOpen && (...)}` guard would transiently render the mobile
 * panel on that first desktop paint regardless of effect timing. The JSX condition itself
 * must include isCompact so the panel can never render while isCompact === false, independent
 * of when the effect fires. */
const panelGuardStart = navChromeSource.indexOf('isCompact && menuOpen && (');
assert(panelGuardStart !== -1, 'the panel render condition is guarded by isCompact, not menuOpen alone — never renders on a desktop-width frame regardless of effect timing');

/* D. Single source of truth for menu actions ------------------------------------------ */

const panelStart = navChromeSource.indexOf('menuOpen && (');
assert(panelStart !== -1, 'a conditionally-rendered mobile panel block exists');
assert(panelStart === panelGuardStart + 'isCompact && '.length, 'the panel block found for the remaining checks below is the SAME isCompact-guarded block, not an unguarded duplicate');
const panelSource = navChromeSource.slice(panelStart);
assert(panelSource.includes('onClick={goHome}'), "mobile panel's Home action wires to the goHome handler");
assert(panelSource.includes('onClick={goShop}'), "mobile panel's Shop action wires to the goShop handler");
// goHome/goShop are defined exactly once, above the JSX, and are the ONLY extra call site
// of each commerce action beyond the pre-existing desktop ones (brand + desktop nav-link for
// setView('home'); desktop nav-link for openCatalog()) — not a second independent implementation.
const setViewHomeCount = navChromeSource.split("commerce.setView('home')").length - 1;
const openCatalogCount = navChromeSource.split('commerce.openCatalog()').length - 1;
assert(setViewHomeCount === 3, `commerce.setView('home') is called from exactly 3 places (brand + desktop link + goHome) — found ${setViewHomeCount}`);
assert(openCatalogCount === 2, `commerce.openCatalog() is called from exactly 2 places (desktop link + goShop) — found ${openCatalogCount}`);
const goShopStart = navChromeSource.indexOf('function goShop()');
const goHomeBody = navChromeSource.slice(navChromeSource.indexOf('function goHome()'), goShopStart);
const goShopBody = navChromeSource.slice(goShopStart, navChromeSource.indexOf('return (', goShopStart));
assert(
  goHomeBody.includes("commerce.setView('home')") && goHomeBody.includes('setMenuOpen(false)'),
  'goHome performs the same Home action, then closes the menu'
);
assert(
  goShopBody.includes('commerce.openCatalog()') && goShopBody.includes('setMenuOpen(false)'),
  'goShop performs the same Shop action, then closes the menu'
);
assert(!compositionsSource.includes('content.links'), 'no content.links (second independent nav config) was introduced');
assert(!compositionsSource.includes('content?.links'), 'no content.links (second independent nav config) was introduced');

/* E. Cart stays outside the panel, structurally and behaviorally ---------------------- */

const cartButtonIndex = navChromeSource.indexOf('className="ai-v2-cart"');
assert(cartButtonIndex !== -1 && cartButtonIndex < panelStart, 'the cart button appears before (outside) the mobile panel in source order');
assert(!panelSource.includes('ai-v2-cart') && !panelSource.includes('setCartOpen'), 'the mobile panel never references the cart control or setCartOpen — cart is not moved into the menu');

/* F/G. Breakpoint contract ------------------------------------------------------------- */

const mediaQueryIndex = v2Css.indexOf('@media (max-width: 960px)');
assert(mediaQueryIndex !== -1, 'the existing 960px compact breakpoint block still exists');
const triggerShowIndex = v2Css.indexOf('.ai-v2-nav-menu-trigger {\n    display: inline-flex;');
assert(triggerShowIndex !== -1 && triggerShowIndex > mediaQueryIndex, 'the menu trigger is shown inside the existing 960px compact breakpoint block, not a new one');
const triggerHideIndex = v2Css.indexOf('.ai-v2-nav-menu-trigger {\n  display: none;');
assert(triggerHideIndex !== -1 && triggerHideIndex < mediaQueryIndex, 'the menu trigger defaults to hidden OUTSIDE the compact block (desktop stays unchanged)');
assert(!v2Css.includes('768px') && !v2Css.includes('834px'), 'v2.css introduces no 768px/834px breakpoint for the new nav CSS');
assert(!compositionsSource.includes('768px') && !/\bmd:/.test(compositionsSource), 'compositions.tsx introduces no 768px value or Tailwind md: class for V2 mobile nav');

/* Explicit compact grid, not an implicit column count ---------------------------------- */

assert(
  v2Css.includes('.ai-v2-nav-inner {\n    grid-template-columns: 1fr auto auto;\n  }'),
  'compact .ai-v2-nav-inner is an explicit 3-track grid (brand | trigger | cart), not left implicit'
);
assert(
  v2Css.includes('.ai-v2-nav-inner {\n  display: grid;\n  grid-template-columns: 1fr auto 1fr;'),
  'desktop .ai-v2-nav-inner grid-template-columns (1fr auto 1fr) is unchanged'
);

/* H. Opaque tokenized panel surface, not variant-scoped -------------------------------- */

const panelRuleStart = v2Css.indexOf('.ai-v2-nav-menu-panel {');
assert(panelRuleStart !== -1, '.ai-v2-nav-menu-panel base rule exists');
const panelRuleEnd = v2Css.indexOf('}', panelRuleStart);
const panelRule = v2Css.slice(panelRuleStart, panelRuleEnd);
assert(panelRule.includes('background: var(--ai-bg'), 'the panel background is the tokenized --ai-bg variable, not literal transparent');
assert(!panelRule.includes('transparent') || panelRule.includes('color-mix'), 'the panel rule itself does not set a transparent background (only tokenized border color-mix use is allowed)');
assert(
  !v2Css.includes('.ai-v2-nav-minimal .ai-v2-nav-menu-panel') && !v2Css.includes('.ai-v2-nav-transparent .ai-v2-nav-menu-panel'),
  'the panel rule is unscoped to a specific nav variant — both minimal and transparent nav get the same opaque panel'
);

/* I/J. Schema version + fixtures -------------------------------------------------------- */

assert(SITE_DOCUMENT_VERSION === 2, 'SITE_DOCUMENT_VERSION is unchanged at 2 — no schema version bump');
assert(V2_VARIETY_FIXTURES.length > 0, 'existing variety fixtures still construct (fixtures.ts calls siteDocumentSchema.parse at module load — an import failure here is itself a regression)');
for (const fixture of V2_VARIETY_FIXTURES) {
  const reparsed = siteDocumentSchema.safeParse(fixture.document);
  assert(reparsed.success, `fixture "${fixture.id}" document still round-trips through siteDocumentSchema`);
}

/* K. responsive.tablet dormant ---------------------------------------------------------- */

const tabletNode = node({
  id: 'hero_01',
  type: 'hero',
  variant: 'luxury_minimal',
  responsive: { tablet: { variant: 'product_focus', hide: true, spacing: 'cozy' } },
});
assert(siteNodeSchema.safeParse(tabletNode).success, 'responsive.tablet still parses, untouched by the Phase 6D nav-hide rule');
assert(
  validateResponsiveApplicability('nav', 'minimal', undefined).length === 0,
  'validateResponsiveApplicability remains a no-op with no mobile object at all (tablet-only nodes unaffected)'
);

/* L/M. nav mobile-hide hardening --------------------------------------------------------- */

assert(
  validateResponsiveApplicability('nav', 'minimal', { hide: true }).some((m) => m.includes('responsive.mobile.hide')),
  'validateResponsiveApplicability rejects responsive.mobile.hide=true on a nav node, naming the field'
);
assert(
  validateResponsiveApplicability('nav', 'transparent', { hide: true }).length > 0,
  'the hide rejection applies to BOTH nav variants (minimal and transparent), not just one'
);
assert(
  validateResponsiveApplicability('nav', 'minimal', { hide: false }).length === 0,
  'validateResponsiveApplicability accepts responsive.mobile.hide=false on nav'
);
assert(
  validateResponsiveApplicability('nav', 'minimal', {}).length === 0,
  'validateResponsiveApplicability accepts an omitted hide on nav'
);
assert(
  validateResponsiveApplicability('footer', 'minimal_commerce', { hide: true }).length === 0,
  'the hide restriction is nav-only — footer may still be hidden on mobile, unchanged behavior'
);

const hideNavOps = siteOpsSchema.parse([
  { op: 'update', id: 'nav_01', patch: { responsive: { mobile: { hide: true } } } },
]);
let rejectedNavHide = false;
try {
  applySiteOps(opsDoc(), hideNavOps);
} catch (err) {
  rejectedNavHide = err instanceof Error && err.message.includes('responsive.mobile.hide');
}
assert(rejectedNavHide, 'SiteOps update op end-to-end REJECTS setting responsive.mobile.hide=true on the nav node');

const unhideNavOps = siteOpsSchema.parse([
  { op: 'update', id: 'nav_01', patch: { responsive: { mobile: { hide: false } } } },
]);
const afterUnhide = applySiteOps(opsDoc(), unhideNavOps);
assert(
  afterUnhide.pages.home.nodes.find((n) => n.id === 'nav_01')?.responsive?.mobile?.hide === false,
  'SiteOps update op still accepts hide=false on the nav node end-to-end'
);

const hideFooterOps = siteOpsSchema.parse([
  { op: 'update', id: 'footer_01', patch: { responsive: { mobile: { hide: true } } } },
]);
const afterFooterHide = applySiteOps(opsDoc(), hideFooterOps);
assert(
  afterFooterHide.pages.home.nodes.find((n) => n.id === 'footer_01')?.responsive?.mobile?.hide === true,
  'SiteOps update op still accepts hide=true on footer end-to-end — the new rule did not generalize to a chrome-wide policy'
);

/* L (cont.) Persisted-document (raw parse) nav mobile-hide rejection ------------------- */
/* Phase 6D.1 audit finding: siteDocumentSchema.safeParse(...) — the ONLY gate a raw
 * persisted document goes through in both AiStorefrontTemplate.tsx load paths (draft
 * preview AND published live storefront) — did not call validateResponsiveApplicability
 * at all, so a document with nav.responsive.mobile.hide=true previously loaded and
 * rendered nav-less on mobile despite SiteOps/generation/critique already refusing to
 * produce one. Wired directly into siteDocumentSchema's own superRefine via the isolated
 * validateMobileHideRestriction (not the full validateResponsiveApplicability, to avoid
 * also newly gating contentOrder/columns at raw parse time — a separate, larger change). */

const persistedHideNavDoc = baseDocument([
  node({ id: 'nav_01', type: 'nav', variant: 'minimal', responsive: { mobile: { hide: true } } }),
  node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' } }),
  node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    dataBindings: { products: 'featured', limit: 8 },
  }),
  node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
]);
const persistedHideNavParsed = siteDocumentSchema.safeParse(persistedHideNavDoc);
assert(
  !persistedHideNavParsed.success &&
    persistedHideNavParsed.error.issues.some((i) => i.message.includes('responsive.mobile.hide is not allowed on nav')),
  'a raw persisted document (siteDocumentSchema.safeParse, the exact path AiStorefrontTemplate.tsx uses to load a draft or published V2 storefront) REJECTS nav.responsive.mobile.hide=true'
);

const persistedUnhideNavDoc = baseDocument([
  node({ id: 'nav_01', type: 'nav', variant: 'minimal', responsive: { mobile: { hide: false } } }),
  node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' } }),
  node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    dataBindings: { products: 'featured', limit: 8 },
  }),
  node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce' }),
]);
assert(
  siteDocumentSchema.safeParse(persistedUnhideNavDoc).success,
  'a raw persisted document with nav.responsive.mobile.hide=false still parses successfully'
);

const persistedHideFooterDoc = baseDocument([
  node({ id: 'nav_01', type: 'nav', variant: 'minimal' }),
  node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Store' } }),
  node({
    id: 'products_01',
    type: 'productGrid',
    variant: 'editorial',
    dataBindings: { products: 'featured', limit: 8 },
  }),
  node({ id: 'footer_01', type: 'footer', variant: 'minimal_commerce', responsive: { mobile: { hide: true } } }),
]);
assert(
  siteDocumentSchema.safeParse(persistedHideFooterDoc).success,
  'a raw persisted document with footer.responsive.mobile.hide=true still parses successfully — the persisted-document gate is nav-only too'
);

/* N. No new SiteTree field for hamburger/menuOpen state --------------------------------- */

const mobileFieldSet = Object.keys((nodeResponsiveSchema.shape.mobile as { unwrap: () => { shape: object } }).unwrap().shape).sort();
assert(
  JSON.stringify(mobileFieldSet) ===
    JSON.stringify(['columns', 'contentOrder', 'hide', 'minHeight', 'placement', 'spacing', 'variant'].sort()),
  `responsive.mobile field set is unchanged (no menuOpen/hamburger field added) — got ${JSON.stringify(mobileFieldSet)}`
);
const topLevelFieldSet = Object.keys(siteNodeSchema.shape).sort();
assert(
  JSON.stringify(topLevelFieldSet) ===
    JSON.stringify(['animation', 'content', 'dataBindings', 'design', 'id', 'meta', 'responsive', 'type', 'variant', 'visible'].sort()),
  `SiteNode top-level field set is unchanged — got ${JSON.stringify(topLevelFieldSet)}`
);

/* O. i18n fix: no hardcoded English labels left in NavChrome ---------------------------- */

assert(navChromeSource.includes("tNav('nav.home')"), 'NavChrome uses tNav(\'nav.home\') instead of a hardcoded label');
assert(navChromeSource.includes("tNav('nav.shop')"), 'NavChrome uses tNav(\'nav.shop\') instead of a hardcoded label');
assert(!/>\s*Home\s*</.test(navChromeSource), 'the old hardcoded ">Home<" JSX text is gone from NavChrome');
assert(!/>\s*Shop\s*</.test(navChromeSource), 'the old hardcoded ">Shop<" JSX text is gone from NavChrome');
assert(navChromeSource.includes("useTranslation('storefront')"), "NavChrome uses the existing useTranslation('storefront') mechanism already used elsewhere in the storefront (AiStorefrontTemplate.tsx, useStorefrontCommerce.ts)");

/* Phase 6D.1 — language-source fix: react-i18next's ambient i18n.language for the V2
 * storefront route is driven by the MERCHANT'S OWN dashboard/account preferred_language
 * (LanguageProvider.tsx -> useStorefrontCommerce.ts's applyStorefrontLanguage(cfg.
 * preferredLanguage), sourced from the profiles table) — NOT document.meta.language (the
 * SiteDocument's own generation language). Every other composition's copy already follows
 * document.meta.language via the `language` prop (see functionalCta) — nav must match, or a
 * storefront generated in one language could show nav chrome in a different one whenever the
 * merchant's own account language differs from the language they generated this specific
 * store in. Fixed via a per-call t(key, { lng: language }) override — same existing i18n
 * keys/JSON files, no hardcoded language map, no third translation system. */
assert(
  navChromeSource.includes('({ node, commerce, transparent, language }') || navChromeSource.includes('({ node, commerce, transparent, language,'),
  'NavChrome destructures `language` (document.meta.language) from CompositionRenderProps'
);
assert(
  /const tNav = \(key: string\) => t\(key, \{ lng: language \}\)/.test(navChromeSource),
  'nav labels are resolved via a per-call { lng: language } override — document.meta.language, not the ambient/merchant-account i18n.language'
);
assert(
  !navChromeSource.includes("t('nav."),
  'no nav label call site bypasses the tNav wrapper (which pins the correct storefront language) by calling the raw t(...) directly'
);

/* Compact -> desktop force-close + escape/outside-click wiring exist (structural proof —
 * the actual interaction can only be verified by a human in a real browser; see the manual
 * QA matrix in the Phase 6D report). */
assert(navChromeSource.includes('useIsCompactViewport()'), 'NavChrome reads compact state from the existing V2 hook, not a new breakpoint check');
assert(navChromeSource.includes("if (!isCompact) setMenuOpen(false)"), 'menu force-closes on compact -> desktop viewport transition');
assert(navChromeSource.includes("e.key !== 'Escape'") || navChromeSource.includes("e.key === 'Escape'"), 'an Escape-key handler is wired for the open menu');
assert(navChromeSource.includes('onPointerDown') && navChromeSource.includes('addEventListener'), 'an outside-click (pointerdown) handler is wired for the open menu, with listeners scoped to the open lifetime');

console.log(failed === 0 ? '\nAll Phase 6D checks passed.' : `\n${failed} Phase 6D check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
