import { useTranslation } from 'react-i18next';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { formatRon, productReviewStats } from '@/lib/storefront/api';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { ProductCard } from './ProductCard';

interface Props {
  commerce: StorefrontCommerce;
}

export function FloralCartDrawer({ commerce }: Props) {
  const { t } = useTranslation('checkout');
  const {
    cartOpen,
    setCartOpen,
    cart,
    cartSubtotal,
    updateQty,
    removeFromCart,
    setView,
    bestSellers,
    openProduct,
    addToCart,
    reviews,
    customization,
  } = commerce;

  if (!cartOpen) return null;

  const recommended = bestSellers
    .filter((p) => !cart.some((c) => c.product.id === p.id))
    .slice(0, 4);

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label={t('cart.close')}
        onClick={() => setCartOpen(false)}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--floral-surface)] shadow-2xl flex flex-col animate-[floralFadeUp_0.35s_ease]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--floral-line)]">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            <h2 className="text-xl floral-display">{t('cart.yourBag')}</h2>
          </div>
          <button type="button" className="p-2 rounded-full hover:bg-black/5" onClick={() => setCartOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!cart.length && (
            <div className="text-center py-16 space-y-3">
              <p className="text-[var(--floral-muted)]">{t('cart.empty')}</p>
              <button
                type="button"
                className="floral-btn floral-btn-primary"
                onClick={() => {
                  setCartOpen(false);
                  commerce.openCatalog();
                }}
              >
                {t('continueShopping')}
              </button>
            </div>
          )}

          {cart.map((item) => (
            <div key={item.product.id} className="flex gap-3">
              <div className="h-24 w-20 rounded-[var(--floral-radius-sm)] overflow-hidden bg-[var(--floral-image-bg)] shrink-0">
                {item.product.image && (
                  <img src={item.product.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <p className="text-sm font-medium line-clamp-2">{item.product.title}</p>
                  <button type="button" onClick={() => removeFromCart(item.product.id)} className="text-[var(--floral-muted)]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm mt-1 tabular-nums">{formatRon(item.product.price)}</p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--floral-line)] px-2 py-1">
                  <button type="button" onClick={() => updateQty(item.product.id, item.quantity - 1)}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-sm w-6 text-center tabular-nums">{item.quantity}</span>
                  <button type="button" onClick={() => updateQty(item.product.id, item.quantity + 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {recommended.length > 0 && cart.length > 0 && (
            <div className="pt-4 border-t border-[var(--floral-line)]">
              <p className="text-sm font-medium mb-3">{t('cart.youMayAlsoLike')}</p>
              <div className="floral-rail">
                {recommended.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    compact
                    onOpen={(prod) => {
                      setCartOpen(false);
                      openProduct(prod);
                    }}
                    onAdd={addToCart}
                    ratingAvg={productReviewStats(reviews, p.id).avg}
                    ratingCount={productReviewStats(reviews, p.id).count}
                    showReviews={customization.show_reviews !== false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-[var(--floral-line)] p-5 space-y-3 bg-[var(--floral-surface)]">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--floral-muted)]">{t('summary.subtotal')}</span>
              <span className="font-semibold tabular-nums">{formatRon(cartSubtotal)}</span>
            </div>
            <p className="text-xs text-[var(--floral-muted)]">{t('cart.shippingAtCheckout')}</p>
            <button
              type="button"
              className="floral-btn floral-btn-primary w-full"
              onClick={() => {
                setCartOpen(false);
                setView('checkout');
                commerce.setCheckoutStep(1);
              }}
            >
              {t('cart.checkout')}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
