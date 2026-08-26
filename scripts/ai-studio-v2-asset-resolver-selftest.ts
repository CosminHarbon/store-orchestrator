/**
 * Stage 1 asset-resolver self-test (no vitest required).
 * Run: npx --yes tsx scripts/ai-studio-v2-asset-resolver-selftest.ts
 *
 * Covers:
 *  A  Atelier fixture no longer collapses every single-image slot onto product[0]
 *  B  determinism
 *  C  explicit semantics for featured / bestsellers / newest / collection
 *  D  real merchant data is preserved exactly
 *  E  demo provenance
 *  F  renderer no longer supplies brand-flavoured copy defaults
 */
import { readFileSync } from 'node:fs';
import {
  buildAssetPlan,
  featuredProducts,
  productsForBinding,
  type AssetCatalog,
} from '../src/lib/ai-studio/v2/assetResolver';
import { auditCopyFallbacks } from '../src/lib/ai-studio/v2/copyFallbackAudit';
import { SHOWCASE_CATALOGS } from '../src/lib/ai-studio/v2/showcaseData';
import type { SiteDocument, SiteNode } from '../src/lib/ai-studio/v2/siteTree';
import type { StorefrontProduct } from '../src/lib/storefront/types';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function node(partial: Partial<SiteNode> & { id: string; type: string; variant: string }): SiteNode {
  return {
    content: {},
    design: {},
    responsive: {},
    ...partial,
  } as SiteNode;
}

/** A generated-style Atelier tree: eight media slots, none carrying an authored imageUrl. */
const GENERATED_NODES: SiteNode[] = [
  node({ id: 'nav_01', type: 'nav', variant: 'minimal' }),
  node({ id: 'hero_01', type: 'hero', variant: 'luxury_minimal', content: { title: 'Form held still' } }),
  node({ id: 'story_01', type: 'editorialSplit', variant: 'image_text', content: { title: 'On making', body: 'x' } }),
  node({ id: 'grid_01', type: 'productGrid', variant: 'editorial', dataBindings: { products: 'featured', limit: 4 } }),
  node({ id: 'spotlight_01', type: 'productSpotlight', variant: 'feature', dataBindings: { products: 'featured', limit: 1 } }),
  node({ id: 'story_02', type: 'editorialSplit', variant: 'image_text', content: { title: 'Proportion', body: 'x' } }),
  node({
    id: 'quote_01',
    type: 'testimonials',
    variant: 'editorial',
    content: { layout: 'imageQuote', items: [{ quote: 'Calm.', author: 'A.' }] },
  }),
  node({ id: 'rail_01', type: 'productRail', variant: 'horizontal', dataBindings: { products: 'newest', limit: 6 } }),
  node({ id: 'hero_02', type: 'hero', variant: 'product_focus' }),
  node({ id: 'footer_01', type: 'footer', variant: 'editorial_luxury' }),
];

const atelier = SHOWCASE_CATALOGS.atelier_no8;

function demoCatalog(): AssetCatalog {
  return {
    products: atelier.products,
    bestSellers: atelier.products.slice(0, 4),
    newestProducts: [...atelier.products].reverse(),
    collections: atelier.collections,
    demo: true,
  };
}

/* ── TEST A — Atelier fixture diversity ─────────────────────────── */

function testA() {
  const catalog = demoCatalog();
  const plan = buildAssetPlan({ nodes: GENERATED_NODES, catalog });
  const single = plan.summary.nodes.filter((n) => n.slot === 'image' || n.slot === 'product');

  assert(single.length === 6, `six single-image slots planned (got ${single.length})`);
  assert(
    plan.summary.uniqueImageCount === single.length,
    `every single-image slot got a distinct image (unique ${plan.summary.uniqueImageCount} of ${single.length})`
  );
  assert(plan.summary.duplicateImageCount === 0, 'no repeated image across single-image slots');
  assert(plan.summary.fallbackImageCount === 0, 'no empty media slot with a stocked catalog');

  const productIds = single.map((n) => n.productId);
  assert(new Set(productIds).size === productIds.length, `distinct products per slot: ${productIds.join(', ')}`);
  assert(productIds[0] === 'a1', 'hero anchors on the first catalog product');
  assert(productIds[1] !== 'a1', 'first editorial slot no longer repeats the hero product');

  const fixtureImages = new Set(atelier.products.map((p) => p.image));
  const resolvedImages = single
    .map((n) => plan.byNodeId[n.nodeId].imageUrl)
    .filter((url): url is string => Boolean(url));
  assert(
    resolvedImages.every((url) => fixtureImages.has(url)),
    'all resolved assets stay inside the Atelier fixture'
  );
  assert(
    atelier.products.every((p) => p.category === 'Day bags' || p.category === 'Evening' || p.category === 'Travel'),
    'no cross-category product exists in the fixture to leak in'
  );

  // Regression: the six product images must be six distinct photographs.
  assert(fixtureImages.size === 6, `Atelier fixture exposes ${fixtureImages.size} unique product images`);

  // Regression: the trademarked red-handbag asset is gone.
  const fixtureSrc = readFileSync(
    new URL('../src/lib/ai-studio/v2/showcaseData.ts', import.meta.url),
    'utf8'
  );
  for (const banned of [
    'photo-1584917865442-de89df76afd3',
    'photo-1591561954557-26941169b49e',
    'photo-1548036328-c9fa89d128fa',
  ]) {
    assert(!fixtureSrc.includes(banned), `branded fixture asset removed: ${banned}`);
  }
}

/* ── TEST B — determinism ───────────────────────────────────────── */

function testB() {
  const a = buildAssetPlan({ nodes: GENERATED_NODES, catalog: demoCatalog() });
  const b = buildAssetPlan({ nodes: GENERATED_NODES, catalog: demoCatalog() });
  assert(
    JSON.stringify(a.summary) === JSON.stringify(b.summary),
    'same tree + same catalog yields an identical plan'
  );
  const c = buildAssetPlan({ nodes: [...GENERATED_NODES].reverse(), catalog: demoCatalog() });
  assert(
    JSON.stringify(c.summary.nodes.map((n) => n.productId)) !==
      JSON.stringify(a.summary.nodes.map((n) => n.productId)),
    'assignment follows document order (order change changes assignment)'
  );
}

/* ── TEST C — binding semantics ─────────────────────────────────── */

function testC() {
  const catalog = demoCatalog();
  const featured = productsForBinding('featured', catalog).map((p) => p.id);
  const bestsellers = productsForBinding('bestsellers', catalog).map((p) => p.id);
  const newest = productsForBinding('newest', catalog).map((p) => p.id);
  const collection = productsForBinding('collection', catalog, 'col-evening').map((p) => p.id);

  assert(featured.join() === 'a1,a2,a3,a4,a5,a6', `featured = merchant catalog order (${featured.join()})`);
  assert(bestsellers.join() === 'a1,a2,a3,a4', `bestsellers = commerce bestSellers (${bestsellers.join()})`);
  assert(newest.join() === 'a6,a5,a4,a3,a2,a1', `newest = commerce newestProducts (${newest.join()})`);
  assert(collection.join() === 'a2,a4', `collection filters by collectionId (${collection.join()})`);
  assert(
    featured.length !== bestsellers.length || featured.join() !== bestsellers.join(),
    'featured is no longer an accidental alias for bestsellers'
  );

  const outOfStock: AssetCatalog = {
    products: [
      { ...atelier.products[0], id: 'z1', stock: 0 },
      { ...atelier.products[1], id: 'z2', stock: 4 },
    ],
  };
  assert(
    featuredProducts(outOfStock).map((p) => p.id).join() === 'z2,z1',
    'featured puts in-stock first without dropping out-of-stock products'
  );

  const unknownBinding = productsForBinding(undefined, catalog).map((p) => p.id);
  assert(unknownBinding.join() === featured.join(), 'missing binding falls back to featured semantics');
}

/* ── TEST D — real merchant data wins ───────────────────────────── */

function testD() {
  const merchantProducts: StorefrontProduct[] = [
    { ...atelier.products[0], id: 'm1', title: 'Black Handbag A', price: 100, image: 'https://cdn.merchant.test/a.jpg' },
    { ...atelier.products[1], id: 'm2', title: 'Tan Handbag B', price: 200, image: 'https://cdn.merchant.test/b.jpg' },
    { ...atelier.products[2], id: 'm3', title: 'Wallet C', price: 50, image: 'https://cdn.merchant.test/c.jpg' },
  ];
  const snapshot = JSON.stringify(merchantProducts);
  const catalog: AssetCatalog = {
    products: merchantProducts,
    bestSellers: merchantProducts.slice(0, 2),
    newestProducts: [...merchantProducts].reverse(),
    demo: false,
  };

  const plan = buildAssetPlan({ nodes: GENERATED_NODES, catalog });
  const merchantImages = new Set(merchantProducts.map((p) => p.image));
  const single = plan.summary.nodes.filter((n) => n.slot === 'image' || n.slot === 'product');
  const urls = single.map((n) => plan.byNodeId[n.nodeId].imageUrl).filter((u): u is string => Boolean(u));

  assert(urls.length > 0 && urls.every((u) => merchantImages.has(u)), 'every resolved image is a merchant image');
  assert(
    !urls.some((u) => u.includes('images.unsplash.com')),
    'no demo/fixture imagery leaks into a merchant catalog'
  );
  assert(
    single.every((n) => n.provenance === 'merchant'),
    'merchant catalog assets carry merchant provenance'
  );
  assert(JSON.stringify(merchantProducts) === snapshot, 'merchant products are not mutated by the resolver');

  const resolved = single
    .map((n) => plan.byNodeId[n.nodeId].product)
    .filter((p): p is StorefrontProduct => Boolean(p));
  assert(
    resolved.every((p) => {
      const original = merchantProducts.find((m) => m.id === p.id);
      return Boolean(original) && original!.title === p.title && original!.price === p.price;
    }),
    'resolved products keep merchant id, title and price'
  );

  // Six slots, three products: reuse is expected, but must not all collapse to m1.
  assert(plan.summary.uniqueImageCount === 3, 'a three-product catalog uses all three images');
  const reusedIds = single.filter((n) => n.source === 'catalog_reuse').map((n) => n.productId);
  assert(reusedIds.length === single.length - 3, `only the surplus slots reuse (${reusedIds.join(', ')})`);
  assert(new Set(reusedIds).size === reusedIds.length, 'consecutive reuse cycles instead of repeating one product');
}

/* ── TEST E — demo provenance ───────────────────────────────────── */

function testE() {
  const plan = buildAssetPlan({ nodes: GENERATED_NODES, catalog: demoCatalog() });
  const single = plan.summary.nodes.filter((n) => n.slot === 'image' || n.slot === 'product');
  assert(single.every((n) => n.provenance === 'demo'), 'demo catalog assets are tagged demo, never merchant');
  assert(plan.summary.provenance.merchant === 0, 'no demo asset masquerades as merchant media');

  const authored = buildAssetPlan({
    nodes: [node({ id: 'hero_x', type: 'hero', variant: 'editorial_split', content: { imageUrl: 'https://elsewhere.test/x.jpg' } })],
    catalog: demoCatalog(),
  });
  assert(authored.summary.nodes[0].source === 'authored', 'explicit content.imageUrl is respected');
  assert(
    authored.summary.nodes[0].provenance === 'fallback',
    'an image outside the catalog is tagged fallback, not merchant'
  );

  const empty = buildAssetPlan({ nodes: GENERATED_NODES, catalog: { products: [] } });
  assert(
    empty.summary.fallbackImageCount === empty.summary.singleImageSlotCount,
    'empty catalog leaves media slots empty instead of inventing assets'
  );
  assert(empty.summary.productIdsUsed.length === 0, 'no products are invented for an empty catalog');
}

/* ── TEST F — renderer copy fallbacks ───────────────────────────── */

function testF() {
  const compositions = readFileSync(
    new URL('../src/components/templates/ai/v2/compositions.tsx', import.meta.url),
    'utf8'
  );
  const banned = [
    'Quiet luxury',
    'New season',
    'Selected',
    'New arrivals',
    'Our story',
    'Lookbook',
    'Made with restraint',
    'Thoughtfully made',
    'Designed with intention',
    'Featured piece',
    'Shop by world',
    'Stay in the know',
    'Exceptional quality',
    'Sofia Martin',
    'Spotlight',
    'Editorial',
  ];
  for (const phrase of banned) {
    assert(!compositions.includes(`'${phrase}`), `renderer no longer supplies "${phrase}"`);
  }
  assert(
    !compositions.includes('commerce.products[0]?.image') && !compositions.includes('commerce.bestSellers[0]'),
    'no composition picks its own index-0 asset'
  );

  const document = {
    version: 2,
    siteId: 's',
    designSystemId: 'd',
    pages: { home: { id: 'home', type: 'home', nodes: GENERATED_NODES } },
    meta: { language: 'en', updatedAt: new Date().toISOString() },
  } as unknown as SiteDocument;
  const audit = auditCopyFallbacks(document);
  assert(audit.count > 0, `copy audit reports missing fields (${audit.count})`);
  assert(
    audit.findings.some((f) => f.nodeId === 'footer_01' && f.field === 'blurb' && f.kind === 'omitted'),
    'omitted footer blurb is reported instead of being filled with brand voice'
  );
  assert(
    audit.findings.some((f) => f.nodeId === 'hero_02' && f.field === 'cta' && f.kind === 'functional'),
    'missing CTA is reported as a functional fallback (label still renders)'
  );
  assert(
    !audit.findings.some((f) => f.nodeId === 'hero_01' && f.field === 'title'),
    'supplied copy is not reported as missing'
  );
}

/* ── enrichNodes (edge) ─────────────────────────────────────────── */

function testEnrich() {
  const edge = readFileSync(
    new URL('../supabase/functions/_shared/aiStudioV2.ts', import.meta.url),
    'utf8'
  );
  assert(
    edge.includes('DEFAULT_PRODUCT_BINDINGS'),
    'enrichNodes rotates default product bindings instead of emitting one binding everywhere'
  );
  assert(
    edge.includes('dataBindings?.products ??'),
    'enrichNodes preserves an explicit architect binding'
  );
  assert(
    !edge.includes("dataBindings = { products: 'featured'"),
    'the blanket featured default is gone'
  );
}

function main() {
  testA();
  testB();
  testC();
  testD();
  testE();
  testF();
  testEnrich();
  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll asset-resolver self-tests passed.');
}

main();
