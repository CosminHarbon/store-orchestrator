import { ShoppingBag, Star } from 'lucide-react';
import { formatRon } from '@/lib/storefront/api';
import type { StorefrontProduct } from '@/lib/storefront/types';

interface ProductCardProps {
  product: StorefrontProduct;
  onOpen: (p: StorefrontProduct) => void;
  onAdd: (p: StorefrontProduct) => void;
  compact?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  showReviews?: boolean;
}

export function ProductCard({
  product,
  onOpen,
  onAdd,
  compact,
  ratingAvg = 0,
  ratingCount = 0,
  showReviews = true,
}: ProductCardProps) {
  const out = product.stock <= 0;

  return (
    <article
      className={`group bg-[var(--floral-surface)] overflow-hidden border border-[var(--floral-line)] transition-shadow duration-500 hover:shadow-[var(--floral-shadow)] ${
        compact ? 'w-[72vw] max-w-[260px] sm:w-[220px]' : 'w-full'
      }`}
    >
      <button
        type="button"
        className="relative block w-full aspect-[4/5] bg-[var(--floral-image-bg)] overflow-hidden text-left"
        onClick={() => onOpen(product)}
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[var(--floral-muted)] text-sm">
            No image
          </div>
        )}
        {product.has_discount && (
          <span className="absolute top-3 left-3 bg-[var(--floral-sale)] text-white text-[10px] font-semibold tracking-[0.14em] uppercase px-2.5 py-1">
            −{Math.round(product.discount_percentage) || Math.round(((product.original_price - product.price) / product.original_price) * 100)}%
          </span>
        )}
        {out && (
          <span className="absolute top-3 right-3 bg-[var(--floral-ink)] text-white text-[10px] font-semibold tracking-[0.14em] uppercase px-2.5 py-1">
            Sold out
          </span>
        )}
      </button>
      <div className="p-4 space-y-3 text-center">
        <button type="button" className="w-full" onClick={() => onOpen(product)}>
          <h3 className="text-sm font-medium leading-snug line-clamp-2">{product.title}</h3>
          {showReviews && ratingCount > 0 && (
            <div className="mt-2 flex items-center justify-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 ${i < Math.round(ratingAvg) ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`}
                />
              ))}
              <span className="text-[11px] text-[var(--floral-muted)] ml-0.5">({ratingCount})</span>
            </div>
          )}
          <div className="mt-2 flex items-baseline justify-center gap-2">
            <span className="text-sm font-semibold tabular-nums">{formatRon(product.price)}</span>
            {product.has_discount && (
              <span className="text-xs text-[var(--floral-muted)] line-through tabular-nums">
                {formatRon(product.original_price)}
              </span>
            )}
          </div>
        </button>
        <button
          type="button"
          className="floral-btn floral-btn-ghost w-full !py-2.5 !text-[0.65rem]"
          disabled={out}
          onClick={() => onAdd(product)}
        >
          <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.5} />
          {out ? 'Unavailable' : 'Add to cart'}
        </button>
      </div>
    </article>
  );
}
