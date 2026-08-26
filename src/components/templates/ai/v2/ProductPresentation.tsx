import type { StorefrontProduct } from '@/lib/storefront/types';
import { formatStoreMoney, type PresentationMode } from './money';

type Props = {
  product: StorefrontProduct;
  mode: PresentationMode;
  currency: string;
  locale?: string;
  onOpen: (p: StorefrontProduct) => void;
  onAdd?: (p: StorefrontProduct) => void;
  showQuickAdd?: boolean;
  featured?: boolean;
  showSpec?: boolean;
  showRating?: boolean;
  ratingAvg?: number;
  compact?: boolean;
};

/**
 * Product presentation for AI Studio V2.
 * Same product data, different art direction — does not reuse Premium ProductCard chrome.
 */
export function ProductPresentation({
  product,
  mode,
  currency,
  locale = 'en-EU',
  onOpen,
  onAdd,
  showQuickAdd = false,
  featured = false,
  showSpec = false,
  showRating = false,
  ratingAvg = 0,
  compact = false,
}: Props) {
  const price = formatStoreMoney(product.price, currency, locale);
  const out = product.stock <= 0;

  if (mode === 'luxury') {
    return (
      <article className={`ai-v2-pp ai-v2-pp-luxury ${featured ? 'is-featured' : ''} ${compact ? 'is-compact' : ''}`}>
        <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
          {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
        </button>
        <div className="ai-v2-pp-meta">
          <button type="button" className="ai-v2-pp-name" onClick={() => onOpen(product)}>
            {product.title}
          </button>
          <p className="ai-v2-pp-price quiet">{price}</p>
        </div>
      </article>
    );
  }

  if (mode === 'street') {
    return (
      <article className={`ai-v2-pp ai-v2-pp-street ${featured ? 'is-featured' : ''} ${compact ? 'is-compact' : ''}`}>
        <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
          {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
          {out ? <span className="ai-v2-pp-badge">Sold out</span> : null}
        </button>
        <div className="ai-v2-pp-meta">
          {product.category ? <p className="ai-v2-pp-cat">{product.category}</p> : null}
          <button type="button" className="ai-v2-pp-name" onClick={() => onOpen(product)}>
            {product.title}
          </button>
          <div className="ai-v2-pp-row">
            <p className="ai-v2-pp-price">{price}</p>
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
      <article className={`ai-v2-pp ai-v2-pp-tech ${featured ? 'is-featured' : ''} ${compact ? 'is-compact' : ''}`}>
        <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
          {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
        </button>
        <div className="ai-v2-pp-meta">
          <button type="button" className="ai-v2-pp-name" onClick={() => onOpen(product)}>
            {product.title}
          </button>
          {(showSpec || spec) && spec ? <p className="ai-v2-pp-spec">{spec}</p> : null}
          {showRating && ratingAvg > 0 ? (
            <p className="ai-v2-pp-rating">{ratingAvg.toFixed(1)} · rated</p>
          ) : null}
          <div className="ai-v2-pp-row">
            <p className="ai-v2-pp-price">{price}</p>
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
    <article className={`ai-v2-pp ai-v2-pp-editorial ${featured ? 'is-featured' : ''} ${compact ? 'is-compact' : ''}`}>
      <button type="button" className="ai-v2-pp-media" onClick={() => onOpen(product)}>
        {product.image ? <img src={product.image} alt={product.title} loading="lazy" /> : <div className="ai-v2-media-fallback" />}
      </button>
      <div className="ai-v2-pp-meta">
        <button type="button" className="ai-v2-pp-name" onClick={() => onOpen(product)}>
          {product.title}
        </button>
        <p className="ai-v2-pp-price">{price}</p>
      </div>
    </article>
  );
}
