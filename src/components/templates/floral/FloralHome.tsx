import { useMemo } from 'react';
import { Flower2, Heart, Sparkles, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatRon, productReviewStats } from '@/lib/storefront/api';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { ProductCard } from './ProductCard';

interface Props {
  commerce: StorefrontCommerce;
}

export function FloralHome({ commerce }: Props) {
  const { t } = useTranslation('storefront');
  const {
    customization,
    collections,
    bestSellers,
    newestProducts,
    reviews,
    products,
    fees,
    openCatalog,
    openProduct,
    addToCart,
  } = commerce;

  const heroImage =
    customization.hero_image_url ||
    bestSellers[0]?.image ||
    newestProducts[0]?.image ||
    '';

  const triptych = useMemo(() => {
    const covers = collections.slice(0, 3).map((c) => ({
      id: c.id,
      name: c.name,
      image:
        c.image_url ||
        products.find((p) => p.collection_ids.includes(c.id))?.image ||
        '',
      onClick: () => openCatalog(c.id),
    }));
    while (covers.length < 3) {
      const fallback = bestSellers[covers.length] || newestProducts[covers.length];
      covers.push({
        id: `feature-${covers.length}`,
        name: fallback?.title || customization.store_name,
        image: fallback?.image || heroImage,
        onClick: () => (fallback ? openProduct(fallback) : openCatalog()),
      });
    }
    return covers;
  }, [collections, products, bestSellers, newestProducts, heroImage, openCatalog, openProduct, customization.store_name]);

  const showReviews = customization.show_reviews !== false && reviews.length > 0;
  const featured = (bestSellers.length ? bestSellers : newestProducts).slice(0, 8);

  return (
    <div>
      <section className="floral-container-wide pt-2 md:pt-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
          {triptych.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="group relative aspect-[4/5] overflow-hidden bg-[var(--floral-image-bg)] text-left floral-fade-up"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-105"
                  fetchPriority={i === 0 ? 'high' : 'auto'}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--floral-blush)] to-[var(--floral-image-bg)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 text-white">
                <div className="mx-auto mb-4 h-px w-12 bg-white/80 transition-all duration-500 group-hover:w-20" />
                <p className="text-center text-[0.7rem] tracking-[0.28em] uppercase font-medium">
                  {item.name}
                </p>
                <p className="mt-2 text-center text-[0.65rem] tracking-[0.22em] uppercase text-white/70 opacity-0 translate-y-2 transition-all duration-500 group-hover:opacity-100 group-hover:translate-y-0">
                  {t('home.shopNow')}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="floral-container py-16 md:py-24 text-center">
        <p className="floral-eyebrow mb-4">{customization.store_name}</p>
        <h1 className="floral-display text-4xl md:text-6xl lg:text-7xl max-w-3xl mx-auto leading-[1.05]">
          {customization.hero_title}
        </h1>
        <p className="mt-5 text-[var(--floral-muted)] max-w-xl mx-auto text-sm md:text-base leading-relaxed">
          {customization.hero_subtitle}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className="floral-btn floral-btn-primary" onClick={() => openCatalog()}>
            {customization.hero_button_text || t('home.shopNow')}
          </button>
          {collections[0] && (
            <button
              type="button"
              className="floral-btn floral-btn-ghost"
              onClick={() => openCatalog(collections[0].id)}
            >
              {t('home.explore', { name: collections[0].name })}
            </button>
          )}
        </div>
      </section>

      <div className="floral-rule" />

      <section className="floral-container py-10 md:py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {[
            { icon: Flower2, title: t('home.promiseFresh'), body: t('home.promiseFreshBody') },
            {
              icon: Truck,
              title: t('home.promiseDelivery'),
              body:
                fees.home_delivery_fee <= 0
                  ? t('home.freeDelivery')
                  : t('home.deliveryFrom', { amount: formatRon(fees.home_delivery_fee) }),
            },
            { icon: Heart, title: t('home.promiseGift'), body: t('home.promiseGiftBody') },
            { icon: Sparkles, title: t('home.promiseQuality'), body: t('home.promiseQualityBody') },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="text-center space-y-2">
              <Icon className="mx-auto h-5 w-5 text-[var(--floral-rose)]" strokeWidth={1.25} />
              <p className="text-xs tracking-[0.16em] uppercase font-semibold">{title}</p>
              <p className="text-xs text-[var(--floral-muted)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="floral-rule" />

      <section className="floral-container py-16 md:py-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
          <div>
            <p className="floral-eyebrow mb-3">{t('home.featured')}</p>
            <h2 className="floral-display text-3xl md:text-5xl">{t('home.beloved')}</h2>
          </div>
          <button type="button" className="floral-btn floral-btn-ghost" onClick={() => openCatalog()}>
            {t('home.viewAll')}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
          {featured.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onOpen={openProduct}
              onAdd={addToCart}
              ratingAvg={productReviewStats(reviews, p.id).avg}
              ratingCount={productReviewStats(reviews, p.id).count}
              showReviews={customization.show_reviews !== false}
            />
          ))}
        </div>
      </section>

      <section className="bg-[var(--floral-blush)]">
        <div className="floral-container py-16 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <p className="floral-eyebrow">{t('home.atelier')}</p>
            <h2 className="floral-display text-3xl md:text-5xl leading-tight">{t('home.atelierTitle')}</h2>
            <p className="text-sm text-[var(--floral-muted)] leading-relaxed max-w-md">
              {t('home.atelierBody')}
            </p>
            <button type="button" className="floral-btn floral-btn-primary" onClick={() => openCatalog()}>
              {t('home.discover')}
            </button>
          </div>
          <div className="relative aspect-[5/4] overflow-hidden bg-[var(--floral-image-bg)]">
            {(newestProducts[0]?.image || heroImage) && (
              <img
                src={newestProducts[0]?.image || heroImage}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            )}
          </div>
        </div>
      </section>

      {newestProducts.length > 0 && (
        <section className="floral-container py-16 md:py-24">
          <div className="mb-10 text-center">
            <p className="floral-eyebrow mb-3">{t('home.justArrived')}</p>
            <h2 className="floral-display text-3xl md:text-5xl">{t('home.newThisWeek')}</h2>
          </div>
          <div className="floral-rail md:grid md:grid-cols-4 md:overflow-visible gap-4">
            {newestProducts.slice(0, 4).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                compact
                onOpen={openProduct}
                onAdd={addToCart}
                ratingAvg={productReviewStats(reviews, p.id).avg}
                ratingCount={productReviewStats(reviews, p.id).count}
                showReviews={customization.show_reviews !== false}
              />
            ))}
          </div>
        </section>
      )}

      {showReviews && (
        <section className="border-y border-[var(--floral-line)] bg-[var(--floral-surface)]">
          <div className="floral-container py-16 md:py-20">
            <div className="text-center mb-10">
              <p className="floral-eyebrow mb-3">{t('home.kindWords')}</p>
              <h2 className="floral-display text-3xl md:text-5xl">{t('home.fromCustomers')}</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {reviews.slice(0, 3).map((r) => (
                <blockquote key={r.id} className="floral-panel p-6 space-y-3">
                  <p className="floral-display text-xl leading-snug">“{r.comment}”</p>
                  <footer className="text-xs tracking-[0.14em] uppercase text-[var(--floral-muted)]">
                    {r.customer_name}
                    {r.rating ? ` · ${r.rating}/5` : ''}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
