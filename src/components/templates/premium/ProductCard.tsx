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
      className={`group bg-[var(--prem-surface)] rounded-[var(--prem-radius)] overflow-hidden border border-[var(--prem-line)] hover:shadow-[var(--prem-shadow)] transition-shadow duration-300 ${
        compact ? 'w-[70vw] max-w-[260px] sm:w-[220px]' : 'w-full'
      }`}
    >
      <button
        type="button"
        className="relative block w-full aspect-[4/5] bg-[var(--prem-image-bg)] overflow-hidden text-left"
        onClick={() => onOpen(product)}
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[var(--prem-muted)] text-sm">
            No image
          </div>
        )}
        {product.has_discount && (
          <span className="absolute top-3 left-3 rounded-full bg-[var(--prem-sale)] text-white text-[11px] font-medium px-2.5 py-1">
            −{Math.round(product.discount_percentage) || Math.round(((product.original_price - product.price) / product.original_price) * 100)}%
          </span>
        )}
        {out && (
          <span className="absolute top-3 right-3 rounded-full bg-[var(--prem-ink)] text-white text-[11px] font-medium px-2.5 py-1">
            Sold out
          </span>
        )}
      </button>
      <div className="p-3.5 space-y-2">
        <button type="button" className="text-left w-full" onClick={() => onOpen(product)}>
          <h3 className="text-sm font-medium leading-snug line-clamp-2">{product.title}</h3>
          {showReviews && ratingCount > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 ${i < Math.round(ratingAvg) ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`}
                />
              ))}
              <span className="text-[11px] text-[var(--prem-muted)] ml-0.5">({ratingCount})</span>
            </div>
          )}
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-sm font-semibold tabular-nums">{formatRon(product.price)}</span>
            {product.has_discount && (
              <span className="text-xs text-[var(--prem-muted)] line-through tabular-nums">
                {formatRon(product.original_price)}
              </span>
            )}
          </div>
        </button>
        <button
          type="button"
          className="prem-btn prem-btn-ghost w-full !py-2 !text-xs"
          disabled={out}
          onClick={() => onAdd(product)}
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          {out ? 'Unavailable' : 'Add to cart'}
        </button>
      </div>
    </article>
  );
}
