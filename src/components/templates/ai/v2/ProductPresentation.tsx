import type { StorefrontProduct } from '@/lib/storefront/types';
import { formatStoreMoney, type PresentationMode } from './money';
import { resolveMerchandisingBadge, resolveSaleInfo, resolveStockState } from './merchandising';

type Props = {
  product: StorefrontProduct;
  mode: PresentationMode;
  currency: string;
  locale?: string;
  /** Only affects new merchandising copy (badge/rating text) — matches the
   *  `language` prop every composition already receives from CompositionRenderProps. */
  language?: 'en' | 'ro';
  onOpen: (p: StorefrontProduct) => void;
  onAdd?: (p: StorefrontProduct) => void;
  showQuickAdd?: boolean;
  featured?: boolean;
  showSpec?: boolean;
  showRating?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  compact?: boolean;
};

/**
 * Product presentation for AI Studio V2.
 * Same product data, different art direction — does not reuse Premium ProductCard chrome.
 *
 * Merchandising truth (sale/stock/rating) is computed once here from real StorefrontProduct/
 * StorefrontReview data and then only *presented* differently per mode — see
 * merchandising.ts for the shared, tested rules. Each mode still decides how much of it to
 * show (e.g. luxury/editorial never show ratings) — that's presentation, not truth.
 */
export function ProductPresentation({
  product,
  mode,
  currency,
  locale = 'en-EU',
  language = 'en',
  onOpen,
  onAdd,
  showQuickAdd = false,
  featured = false,
  showSpec = false,
  showRating = false,
  ratingAvg = 0,
  ratingCount = 0,
  compact = false,
}: Props) {
  const price = formatStoreMoney(product.price, currency, locale);
  const stockState = resolveStockState(product);
  const out = stockState === 'out_of_stock';
  const sale = resolveSaleInfo(product);
  const originalPriceLabel =
    sale.onSale && sale.originalPrice != null ? formatStoreMoney(sale.originalPrice, currency, locale) : null;
  const badge = resolveMerchandisingBadge(product, language);

  const cardClass = (base: string) =>
    `ai-v2-pp ${base} ${featured ? 'is-featured' : ''} ${compact ? 'is-compact' : ''} ${out ? 'is-out' : ''}`;

  const badgeEl = badge ? (
    <span className={`ai-v2-pp-badge ai-v2-pp-badge-${badge.kind.replace(/_/g, '-')}`}>{badge.label}</span>
  ) : null;

  const priceLine = (quiet?: boolean) => (
    <p className={`ai-v2-pp-price${quiet ? ' quiet' : ''}`}>
      <span className="ai-v2-pp-price-current">{price}</span>
      {originalPriceLabel ? <span className="ai-v2-pp-price-original">{originalPriceLabel}</span> : null}
    </p>
  );

  const ratingLine =
    showRating && ratingCount > 0 ? (
      <p className="ai-v2-pp-rating">
        {ratingAvg.toFixed(1)} <span aria-hidden="true">★</span>
        <span className="ai-v2-pp-rating-count">({ratingCount})</span>
      </p>
    ) : null;

  if (mode === 'luxury') {
    return (
      <article className={cardClass('ai-v2-pp-luxury')}>
        <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
          {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
          {badgeEl}
        </button>
        <div className="ai-v2-pp-meta">
          <button type="button" className="ai-v2-pp-name" title={product.title} onClick={() => onOpen(product)}>
            {product.title}
          </button>
          {priceLine(true)}
        </div>
      </article>
    );
  }

  if (mode === 'street') {
    return (
      <article className={cardClass('ai-v2-pp-street')}>
        <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
          {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
          {badgeEl}
        </button>
        <div className="ai-v2-pp-meta">
          {product.category ? <p className="ai-v2-pp-cat">{product.category}</p> : null}
          <button type="button" className="ai-v2-pp-name" title={product.title} onClick={() => onOpen(product)}>
            {product.title}
          </button>
          <div className="ai-v2-pp-row">
            {priceLine()}
            {showQuickAdd && onAdd && !out ? (
              <button type="button" className="ai-v2-pp-add" onClick={() => onAdd(product)}>
                Add
              </button>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  if (mode === 'tech') {
    const spec = product.description?.split(/[.!\n]/)[0]?.slice(0, 72);
    return (
      <article className={cardClass('ai-v2-pp-tech')}>
        <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
          {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
          {badgeEl}
        </button>
        <div className="ai-v2-pp-meta">
          <button type="button" className="ai-v2-pp-name" title={product.title} onClick={() => onOpen(product)}>
            {product.title}
          </button>
          {(showSpec || spec) && spec ? <p className="ai-v2-pp-spec">{spec}</p> : null}
          {ratingLine}
          <div className="ai-v2-pp-row">
            {priceLine()}
            {showQuickAdd && onAdd && !out ? (
              <button type="button" className="ai-v2-pp-cta" onClick={() => onAdd(product)}>
                Add to cart
              </button>
            ) : (
              <button type="button" className="ai-v2-pp-cta ghost" onClick={() => onOpen(product)}>
                Details
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  // editorial default
  return (
    <article className={cardClass('ai-v2-pp-editorial')}>
      <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
        {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
        {badgeEl}
      </button>
      <div className="ai-v2-pp-meta">
        <button type="button" className="ai-v2-pp-name" title={product.title} onClick={() => onOpen(product)}>
          {product.title}
        </button>
        {priceLine()}
      </div>
    </article>
  );
}
