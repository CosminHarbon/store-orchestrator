import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Package,
  Share2,
  Star,
  Truck,
  ZoomIn,
} from 'lucide-react';
import { formatRon, productReviewStats } from '@/lib/storefront/api';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { StorefrontReviewForm } from '@/components/templates/StorefrontReviewForm';
import { ProductCard } from './ProductCard';

interface Props {
  commerce: StorefrontCommerce;
}

export function PremiumProduct({ commerce }: Props) {
  const {
    apiKey,
    selectedProduct,
    setView,
    addToCart,
    collections,
    products,
    reviews,
    recentProducts,
    openProduct,
    fees,
    customization,
  } = commerce;

  const [imageIndex, setImageIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const gallery = useMemo(() => {
    if (!selectedProduct) return [''];
    const urls = selectedProduct.images?.map((i) => i.image_url).filter(Boolean) || [];
    if (selectedProduct.image && !urls.includes(selectedProduct.image)) {
      urls.unshift(selectedProduct.image);
    }
    return urls.length ? urls : [''];
  }, [selectedProduct]);

  const productReviews = useMemo(
    () => (selectedProduct ? reviews.filter((r) => r.product_id === selectedProduct.id) : []),
    [reviews, selectedProduct]
  );

  const related = useMemo(() => {
    if (!selectedProduct) return [];
    return products
      .filter(
        (p) =>
          p.id !== selectedProduct.id &&
          (p.category === selectedProduct.category ||
            p.collection_ids.some((id) => selectedProduct.collection_ids.includes(id)))
      )
      .slice(0, 8);
  }, [products, selectedProduct]);

  const inCollections = useMemo(() => {
    if (!selectedProduct) return [];
    return collections.filter((c) => selectedProduct.collection_ids.includes(c.id));
  }, [collections, selectedProduct]);

  if (!selectedProduct) return null;

  const current = gallery[Math.min(imageIndex, gallery.length - 1)];

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: selectedProduct.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="prem-container py-6 md:py-10 pb-28">
      <button
        type="button"
        className="text-sm text-[var(--prem-muted)] mb-6 hover:text-[var(--prem-ink)]"
        onClick={() => setView('catalog')}
      >
        ← Back to shop
      </button>

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-14">
        <div className="space-y-3">
          <button
            type="button"
            className="relative w-full aspect-[4/5] rounded-[var(--prem-radius)] overflow-hidden bg-[var(--prem-image-bg)] group"
            onClick={() => setZoomed(true)}
          >
            {current ? (
              <img
                src={current}
                alt={selectedProduct.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : null}
            <span className="absolute bottom-3 right-3 rounded-full bg-white/90 p-2 shadow">
              <ZoomIn className="h-4 w-4" />
            </span>
            {selectedProduct.has_discount && (
              <span className="absolute top-4 left-4 rounded-full bg-[var(--prem-sale)] text-white text-xs px-3 py-1">
                Sale
              </span>
            )}
          </button>
          {gallery.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-2 rounded-full border border-[var(--prem-line)]"
                onClick={() => setImageIndex((i) => (i - 1 + gallery.length) % gallery.length)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 prem-rail !gap-2">
                {gallery.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    className={`h-16 w-14 rounded-md overflow-hidden border-2 shrink-0 ${
                      i === imageIndex ? 'border-[var(--prem-ink)]' : 'border-transparent'
                    }`}
                    onClick={() => setImageIndex(i)}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="p-2 rounded-full border border-[var(--prem-line)]"
                onClick={() => setImageIndex((i) => (i + 1) % gallery.length)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="prem-fade-up">
            <h1 className="text-4xl md:text-5xl prem-display leading-tight">{selectedProduct.title}</h1>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-2xl font-semibold tabular-nums">{formatRon(selectedProduct.price)}</span>
              {selectedProduct.has_discount && (
                <span className="text-[var(--prem-muted)] line-through tabular-nums">
                  {formatRon(selectedProduct.original_price)}
                </span>
              )}
            </div>
          </div>

          {selectedProduct.description && (
            <p className="text-[var(--prem-muted)] leading-relaxed whitespace-pre-wrap">
              {selectedProduct.description}
            </p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-[var(--prem-muted)]">
            {selectedProduct.sku && (
              <span className="rounded-full border border-[var(--prem-line)] px-3 py-1">
                SKU {selectedProduct.sku}
              </span>
            )}
            <span className="rounded-full border border-[var(--prem-line)] px-3 py-1 inline-flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {selectedProduct.stock > 0 ? `${selectedProduct.stock} in stock` : 'Out of stock'}
            </span>
            {inCollections.map((c) => (
              <span key={c.id} className="rounded-full bg-[var(--prem-accent-soft)] px-3 py-1">
                {c.name}
              </span>
            ))}
          </div>

          <div className="flex items-start gap-3 text-sm bg-[var(--prem-surface)] border border-[var(--prem-line)] rounded-[var(--prem-radius)] p-4">
            <Truck className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Delivery estimate</p>
              <p className="text-[var(--prem-muted)] mt-0.5">
                1–3 business days · Home from {formatRon(fees.home_delivery_fee)} · Locker from{' '}
                {formatRon(fees.locker_delivery_fee)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-[var(--prem-muted)]">
            <CreditCard className="h-4 w-4" />
            Card & cash on delivery accepted
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="prem-btn prem-btn-primary flex-1"
              disabled={selectedProduct.stock <= 0}
              onClick={() => addToCart(selectedProduct)}
            >
              {selectedProduct.stock <= 0 ? 'Sold out' : 'Add to cart'}
            </button>
            <button type="button" className="prem-btn prem-btn-ghost" onClick={() => void share()}>
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          {customization?.show_reviews !== false && (
            <div className="pt-4 border-t border-[var(--prem-line)] space-y-4">
              <div className="flex items-end justify-between gap-3">
                <h3 className="text-xl prem-display">Reviews</h3>
                {productReviews.length > 0 && (
                  <p className="text-sm text-[var(--prem-muted)] tabular-nums">
                    {(
                      productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length
                    ).toFixed(1)}{' '}
                    · {productReviews.length} review{productReviews.length === 1 ? '' : 's'}
                  </p>
                )}
              </div>
              {productReviews.length === 0 ? (
                <p className="text-sm text-[var(--prem-muted)]">No reviews yet — be the first.</p>
              ) : (
                <div className="space-y-3">
                  {productReviews.slice(0, 8).map((r) => (
                    <div key={r.id} className="text-sm space-y-1.5">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`}
                          />
                        ))}
                        <span className="ml-2 font-medium">{r.customer_name}</span>
                      </div>
                      {r.comment && <p className="text-[var(--prem-muted)]">{r.comment}</p>}
                      {r.merchant_reply && (
                        <div className="ml-2 pl-3 border-l border-[var(--prem-line)] text-[var(--prem-muted)]">
                          <span className="text-xs font-medium text-[var(--prem-fg)]">Store reply</span>
                          <p className="mt-0.5">{r.merchant_reply}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <StorefrontReviewForm
                apiKey={apiKey}
                productId={selectedProduct.id}
                productTitle={selectedProduct.title}
                className="border-[var(--prem-line)] bg-[var(--prem-surface)]"
              />
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-3xl prem-display mb-6">Related products</h2>
          <div className="prem-rail">
            {related.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                compact
                onOpen={openProduct}
                onAdd={addToCart}
                ratingAvg={productReviewStats(reviews, p.id).avg}
                ratingCount={productReviewStats(reviews, p.id).count}
                showReviews={customization?.show_reviews !== false}
              />
            ))}
          </div>
        </section>
      )}

      {recentProducts.filter((p) => p.id !== selectedProduct.id).length > 0 && (
        <section className="mt-12">
          <h2 className="text-3xl prem-display mb-6">Recently viewed</h2>
          <div className="prem-rail">
            {recentProducts
              .filter((p) => p.id !== selectedProduct.id)
              .map((p) => (
                <ProductCard
                key={p.id}
                product={p}
                compact
                onOpen={openProduct}
                onAdd={addToCart}
                ratingAvg={productReviewStats(reviews, p.id).avg}
                ratingCount={productReviewStats(reviews, p.id).count}
                showReviews={customization?.show_reviews !== false}
              />
              ))}
          </div>
        </section>
      )}

      {/* Sticky ATC */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--prem-line)] bg-[var(--prem-surface)]/95 backdrop-blur px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{selectedProduct.title}</p>
            <p className="text-sm tabular-nums">{formatRon(selectedProduct.price)}</p>
          </div>
          <button
            type="button"
            className="prem-btn prem-btn-primary !py-2.5"
            disabled={selectedProduct.stock <= 0}
            onClick={() => addToCart(selectedProduct)}
          >
            Add
          </button>
        </div>
      </div>

      {zoomed && current && (
        <div
          className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
        >
          <img src={current} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}
