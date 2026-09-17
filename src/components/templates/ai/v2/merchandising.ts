import type { StorefrontProduct } from '@/lib/storefront/types';

/**
 * Matches the storefront's own existing low-stock threshold — `displayedStock()`
 * in src/lib/storefront/variantSelection.ts already treats 1-5 units as
 * "only N left" everywhere else in the app (Premium/Floral catalog, PDP, cart).
 * Reused here rather than inventing a new number for V2.
 */
export const LOW_STOCK_THRESHOLD = 5;

export type SaleInfo = {
  onSale: boolean;
  originalPrice: number | null;
  percent: number | null;
};

/**
 * `has_discount` is already validated server-side (`mapProduct()` in
 * src/lib/storefront/api.ts: `has_discount: !!p.has_discount && final < original`),
 * so it is trusted directly here as the sale truth condition — the same way
 * the Premium/Floral ProductCard components already do
 * (`showCompareAt = product.has_discount`) — rather than re-deriving "is this
 * a sale" from a raw price comparison.
 *
 * `discount_percentage` can be a real but zero value even when a genuine
 * discount exists (e.g. the merchant only set an override price and never
 * typed a percentage) - in that case the percentage is computed from the real
 * prices, matching the same fallback already used in
 * src/components/templates/premium/ProductCard.tsx. If the prices don't
 * support a percentage either, `percent` is `null` and only the original
 * price is shown - never a fabricated number.
 */
export function resolveSaleInfo(product: StorefrontProduct): SaleInfo {
  if (!product.has_discount) {
    return { onSale: false, originalPrice: null, percent: null };
  }
  const original = product.original_price;
  const current = product.price;
  const storedPercent = Number(product.discount_percentage) || 0;
  const percent =
    storedPercent > 0
      ? Math.round(storedPercent)
      : original > current && original > 0
        ? Math.round(((original - current) / original) * 100)
        : null;
  return { onSale: true, originalPrice: original, percent };
}

export type StockState = 'out_of_stock' | 'low_stock' | 'in_stock';

/**
 * `show_stock_to_customers === false` means the merchant chose not to reveal
 * stock counts (same flag already respected by `displayedStock()` in
 * variantSelection.ts) - low-stock urgency is a *count* being shown, so it is
 * suppressed in that case. Being sold out is not a count, it's whether the
 * product can be bought at all, so it is never suppressed.
 */
export function resolveStockState(product: StorefrontProduct): StockState {
  if (product.stock <= 0) return 'out_of_stock';
  if (product.show_stock_to_customers === false) return 'in_stock';
  if (product.stock <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

export type MerchandisingBadgeKind = 'sold_out' | 'sale' | 'low_stock';

export type MerchandisingBadge = {
  kind: MerchandisingBadgeKind;
  label: string;
};

const BADGE_TEXT = {
  soldOut: { en: 'Sold out', ro: 'Stoc epuizat' },
  sale: { en: 'Sale', ro: 'Reducere' },
} as const;

function onlyLeftLabel(count: number, language: 'en' | 'ro'): string {
  return language === 'ro' ? `Mai sunt ${count}` : `Only ${count} left`;
}

/**
 * One deterministic precedence, one badge slot: sold out > sale > low stock.
 * A product can technically satisfy more than one condition (a discounted
 * item can also be low on stock) but the card only ever surfaces a single
 * merchandising signal — sold out changes what the customer can actually do
 * (strongest signal), a real discount is a firmer commercial fact than a
 * remaining-quantity estimate, and low-stock urgency is the softest of the
 * three. This matches the precedence requested for this phase; no
 * architectural reason was found to deviate from it.
 */
export function resolveMerchandisingBadge(
  product: StorefrontProduct,
  language: 'en' | 'ro' = 'en'
): MerchandisingBadge | null {
  const stockState = resolveStockState(product);
  if (stockState === 'out_of_stock') {
    return { kind: 'sold_out', label: BADGE_TEXT.soldOut[language] };
  }
  const sale = resolveSaleInfo(product);
  if (sale.onSale) {
    return { kind: 'sale', label: sale.percent ? `-${sale.percent}%` : BADGE_TEXT.sale[language] };
  }
  if (stockState === 'low_stock') {
    return { kind: 'low_stock', label: onlyLeftLabel(product.stock, language) };
  }
  return null;
}
