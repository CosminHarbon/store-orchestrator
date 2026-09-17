#!/usr/bin/env -S npx tsx
/**
 * AI Studio V2 — Product Presentation Completeness self-test (no vitest, no LLM required).
 * Run: npx --yes tsx scripts/ai-studio-v2-product-presentation-selftest.ts
 *
 * Covers the "AI Studio V2 — Product Presentation Completeness" phase:
 *  1. Sale-truth recognition (has_discount is the sole gate; no fabricated percentage)
 *  2. Stock-state resolution (out_of_stock / low_stock / in_stock, incl. show_stock_to_customers)
 *  3. Badge precedence (sold out > sale > low stock), pure and deterministic
 *  4. Per-product rating comes only from that product's own reviews (productReviewStats reuse)
 *  5. Long-title CSS clamp exists on the shared product-name class
 *  6. The showcase QA fixture data added this phase actually produces the intended states
 *  7. Mobile regression guard: the dense productGrid layout has an explicit,
 *     same-specificity override inside both mobile media queries — not just a plain
 *     `.ai-v2-merch-grid` rule, which loses the cascade to dense's own base rule and
 *     silently stays at 4 columns on a real phone (the bug this guard exists to catch)
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { StorefrontProduct } from '../src/lib/storefront/types';
import { productReviewStats } from '../src/lib/storefront/api';
import {
  LOW_STOCK_THRESHOLD,
  resolveSaleInfo,
  resolveStockState,
  resolveMerchandisingBadge,
} from '../src/components/templates/ai/v2/merchandising';
import { SHOWCASE_CATALOGS } from '../src/lib/ai-studio/v2/showcaseData';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function product(partial: Partial<StorefrontProduct> & { id: string; price: number }): StorefrontProduct {
  return {
    title: 'Test Product',
    description: '',
    original_price: partial.price,
    has_discount: false,
    discount_percentage: 0,
    image: 'https://example.com/img.jpg',
    images: [],
    stock: 10,
    sku: 'SKU',
    category: '',
    collection_ids: [],
    show_stock_to_customers: true,
    ...partial,
  };
}

/* 1. Sale-truth recognition -------------------------------------------------- */

const onSale = product({ id: 'p1', price: 79, original_price: 99, has_discount: true, discount_percentage: 0 });
const saleInfo = resolveSaleInfo(onSale);
assert(saleInfo.onSale, 'has_discount=true is recognized as a real sale');
assert(saleInfo.percent === 20, `percent is computed from real prices when discount_percentage is 0 (got ${saleInfo.percent})`);
assert(saleInfo.originalPrice === 99, 'original price is surfaced for a real sale');

const notOnSale = product({ id: 'p2', price: 79, original_price: 99, has_discount: false });
const notSaleInfo = resolveSaleInfo(notOnSale);
assert(!notSaleInfo.onSale, 'has_discount=false never shows sale UI, even if original_price > price');
assert(notSaleInfo.percent === null && notSaleInfo.originalPrice === null, 'no sale data leaks through when has_discount is false');

const storedPercentSale = product({ id: 'p3', price: 40, original_price: 50, has_discount: true, discount_percentage: 15 });
assert(resolveSaleInfo(storedPercentSale).percent === 15, 'a real stored discount_percentage is used as-is, not recomputed');

const inconsistentSale = product({ id: 'p4', price: 50, original_price: 50, has_discount: true, discount_percentage: 0 });
assert(
  resolveSaleInfo(inconsistentSale).percent === null,
  'no percentage is fabricated when prices do not actually support one (original_price === price)'
);

/* 2. Stock-state resolution -------------------------------------------------- */

assert(resolveStockState(product({ id: 's1', price: 10, stock: 0 })) === 'out_of_stock', 'stock=0 is out_of_stock');
assert(resolveStockState(product({ id: 's2', price: 10, stock: -1 })) === 'out_of_stock', 'a negative stock value is treated as out_of_stock, not a crash');
assert(resolveStockState(product({ id: 's3', price: 10, stock: LOW_STOCK_THRESHOLD })) === 'low_stock', `stock === LOW_STOCK_THRESHOLD (${LOW_STOCK_THRESHOLD}) is low_stock`);
assert(resolveStockState(product({ id: 's4', price: 10, stock: LOW_STOCK_THRESHOLD + 1 })) === 'in_stock', 'stock just above the threshold is in_stock, not low_stock');
assert(resolveStockState(product({ id: 's5', price: 10, stock: 1000 })) === 'in_stock', 'a large/effectively unlimited stock value is in_stock');
assert(
  resolveStockState(product({ id: 's6', price: 10, stock: 2, show_stock_to_customers: false })) === 'in_stock',
  'low-stock urgency is suppressed when the merchant opted out of showing stock numbers'
);
assert(
  resolveStockState(product({ id: 's7', price: 10, stock: 0, show_stock_to_customers: false })) === 'out_of_stock',
  'sold-out is NEVER suppressed by show_stock_to_customers — it is purchasability, not a number reveal'
);

/* 3. Badge precedence: sold out > sale > low stock --------------------------- */

const soldOutAndOnSale = product({ id: 'b1', price: 40, original_price: 60, has_discount: true, stock: 0 });
assert(resolveMerchandisingBadge(soldOutAndOnSale)?.kind === 'sold_out', 'sold-out takes precedence over an active sale');

const onSaleAndLowStock = product({ id: 'b2', price: 40, original_price: 60, has_discount: true, stock: 2 });
assert(resolveMerchandisingBadge(onSaleAndLowStock)?.kind === 'sale', 'an active sale takes precedence over low-stock');

const lowStockOnly = product({ id: 'b3', price: 40, stock: 2 });
assert(resolveMerchandisingBadge(lowStockOnly)?.kind === 'low_stock', 'low-stock surfaces on its own when nothing stronger applies');

const plainProduct = product({ id: 'b4', price: 40, stock: 50 });
assert(resolveMerchandisingBadge(plainProduct) === null, 'a perfectly ordinary in-stock, non-sale product shows no badge at all');

assert(resolveMerchandisingBadge(product({ id: 'b5', price: 40, stock: 0 }), 'ro')?.label === 'Stoc epuizat', 'badge copy respects the language prop (ro)');
assert(
  resolveMerchandisingBadge(product({ id: 'b6', price: 40, stock: 3 }), 'en')?.label === 'Only 3 left',
  'low-stock label uses the real stock number, not a placeholder'
);

/* 4. Per-product rating from real, product-linked reviews only --------------- */

const reviews = [
  { id: 'r1', customer_name: 'A', rating: 5, comment: null, product_id: 'rated-1', created_at: '2026-01-01' },
  { id: 'r2', customer_name: 'B', rating: 3, comment: null, product_id: 'rated-1', created_at: '2026-01-02' },
  { id: 'r3', customer_name: 'C', rating: 1, comment: null, product_id: 'other-product', created_at: '2026-01-03' },
];
const rated = productReviewStats(reviews, 'rated-1');
assert(rated.count === 2, 'rating count only includes reviews whose product_id matches this product');
assert(rated.avg === 4, `rating average is computed only from this product's own reviews (got ${rated.avg})`);
const unrated = productReviewStats(reviews, 'no-reviews-product');
assert(unrated.count === 0 && unrated.avg === 0, 'a product with zero linked reviews gets {count:0, avg:0} — never a fabricated rating');
const storeWideAvg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
assert(rated.avg !== storeWideAvg, 'per-product rating is NOT the store-wide average (sanity check the two diverge in this fixture)');

/* 5. Long-title CSS clamp ----------------------------------------------------- */

const here = path.dirname(fileURLToPath(import.meta.url));
const v2Css = fs.readFileSync(path.join(here, '../src/components/templates/ai/v2/v2.css'), 'utf8');
const nameRuleMatch = v2Css.match(/^\.ai-v2-pp-name\s*\{[^}]*\}/m);
assert(!!nameRuleMatch, '.ai-v2-pp-name rule exists in v2.css');
assert(!!nameRuleMatch && /-webkit-line-clamp:\s*2/.test(nameRuleMatch[0]), '.ai-v2-pp-name clamps to 2 lines (shared by all 4 presentation modes)');

/* 6. This phase's showcase QA fixture data actually produces the intended states */

const villaPelle = SHOWCASE_CATALOGS.atelier_no8.products.find((p) => p.id === 'a4')!;
assert(resolveMerchandisingBadge(villaPelle)?.kind === 'sale', 'Villa Pelle (atelier_no8) has a real sale product (a4 Como Clutch)');

const lumenLab = SHOWCASE_CATALOGS.aurelia.products.find((p) => p.id === 's2')!;
assert(resolveMerchandisingBadge(lumenLab)?.kind === 'low_stock', 'Lumen Lab (aurelia) has a real low-stock product (s2 Botanical Gel Cleanser, visible within the luxury_image_first limit:4 window)');

const blockFormSale = SHOWCASE_CATALOGS.northline.products.find((p) => p.id === 'n1')!;
const blockFormLowStock = SHOWCASE_CATALOGS.northline.products.find((p) => p.id === 'n2')!;
const blockFormSoldOut = SHOWCASE_CATALOGS.northline.products.find((p) => p.id === 'n4')!;
const blockFormLongTitle = SHOWCASE_CATALOGS.northline.products.find((p) => p.id === 'n5')!;
assert(resolveMerchandisingBadge(blockFormSale)?.kind === 'sale', 'BLOCK FORM (northline) has a real sale product (n1)');
assert(resolveMerchandisingBadge(blockFormLowStock)?.kind === 'low_stock', 'BLOCK FORM (northline) has a real low-stock product (n2)');
assert(resolveMerchandisingBadge(blockFormSoldOut)?.kind === 'sold_out', 'BLOCK FORM (northline) has a real sold-out product (n4)');
assert(blockFormLongTitle.title.length > 40, 'BLOCK FORM (northline) has a deliberately long-titled product (n5) for grid/clamp QA');

const auricSale = SHOWCASE_CATALOGS.forma_audio.products.find((p) => p.id === 'e5')!;
const auricLowStock = SHOWCASE_CATALOGS.forma_audio.products.find((p) => p.id === 'e2')!;
assert(resolveMerchandisingBadge(auricSale)?.kind === 'sale', 'Auric (forma_audio) has a real sale product (e5, pre-existing)');
assert(resolveMerchandisingBadge(auricLowStock)?.kind === 'low_stock', 'Auric (forma_audio) has a real low-stock product (e2)');

for (const [brandId, catalog] of Object.entries(SHOWCASE_CATALOGS)) {
  const anyRated = catalog.products.some((p) => productReviewStats(catalog.reviews, p.id).count > 0);
  assert(anyRated, `${brandId} has at least one product with real product-linked reviews (rating can render)`);
}

/* 7. Mobile regression guard: dense productGrid must not silently stay 4 columns ----- */

/**
 * Extracts one `@media (max-width: Npx) { ... }` block's inner text by counting brace
 * depth from the media query's opening brace — not a CSS parser, just enough to isolate
 * one block regardless of how its rules are reordered inside it.
 */
function extractMediaBlock(css: string, maxWidthPx: number): string | null {
  const marker = `@media (max-width: ${maxWidthPx}px)`;
  const start = css.indexOf(marker);
  if (start < 0) return null;
  const openBrace = css.indexOf('{', start);
  if (openBrace < 0) return null;
  let depth = 0;
  for (let i = openBrace; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(openBrace + 1, i);
    }
  }
  return null;
}

const DENSE_OVERRIDE = /\.ai-v2-merch\[data-layout='dense'\]\s*\.ai-v2-merch-grid\s*\{/;
const baseRuleMatches = [...v2Css.matchAll(new RegExp(DENSE_OVERRIDE.source, 'g'))];
assert(baseRuleMatches.length >= 1, 'dense productGrid has its base (desktop) grid-template-columns rule');

for (const maxWidth of [960, 520]) {
  const block = extractMediaBlock(v2Css, maxWidth);
  assert(!!block, `a @media (max-width: ${maxWidth}px) block exists`);
  assert(
    !!block && DENSE_OVERRIDE.test(block),
    `@media (max-width: ${maxWidth}px) has an explicit, same-specificity dense-grid override ` +
      `(.ai-v2-merch[data-layout='dense'] .ai-v2-merch-grid) — a plain .ai-v2-merch-grid rule ` +
      `here would lose the cascade to dense's own base rule and silently stay 4-column on phones`
  );
}

console.log(failed === 0 ? '\nAll AI Studio V2 product-presentation self-tests passed.' : `\n${failed} self-test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
