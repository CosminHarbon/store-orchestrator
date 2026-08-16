import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  Headphones,
  Lock,
  Package,
  RefreshCw,
  Star,
  Truck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatRon, productReviewStats } from '@/lib/storefront/api';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { ProductCard } from './ProductCard';

interface Props {
  commerce: StorefrontCommerce;
}

export function PremiumHome({ commerce }: Props) {
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

  const promoText = useMemo(() => {
    if (fees.home_delivery_fee <= 0) return t('premiumHome.freeDeliveryEvery');
    return t('premiumHome.deliveryLockers', {
      home: formatRon(fees.home_delivery_fee),
      locker: formatRon(fees.locker_delivery_fee),
    });
  }, [fees, t]);

  const showReviews = customization.show_reviews !== false && reviews.length > 0;

  return (
    <div>
      <section className="relative min-h-[88vh] flex items-end overflow-hidden">
        <div className="absolute inset-0">
          {heroImage ? (
            <img
              src={heroImage}
              alt=""
              className="h-full w-full object-cover scale-105 animate-[premFadeUp_1.2s_ease]"
              fetchPriority="high"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#1c2b24] via-[#2a3d34] to-[#0f1612]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20" />
        </div>
        <div className="relative prem-container w-full pb-16 md:pb-24 pt-32 prem-fade-up">
          <p className="text-white/70 text-xs uppercase tracking-[0.28em] mb-4">
            {customization.store_name}
          </p>
          <h1 className="text-white text-5xl md:text-7xl lg:text-8xl prem-display max-w-3xl leading-[0.95]">
            {customization.hero_title || customization.store_name}
          </h1>
          <p className="mt-5 text-white/80 max-w-xl text-base md:text-lg leading-relaxed">
            {customization.hero_subtitle}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="prem-btn bg-white text-[var(--prem-ink)]" onClick={() => openCatalog()}>
              {customization.hero_button_text || t('premiumHome.shopNow')}
            </button>
            {collections[0] && (
              <button
                type="button"
                className="prem-btn border border-white/40 text-white bg-transparent"
                onClick={() => openCatalog(collections[0].id)}
              >
                {t('premiumHome.explore', { name: collections[0].name })}
              </button>
            )}
          </div>
        </div>
      </section>

      {collections.length > 0 && (
        <section className="prem-container py-16 md:py-24">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--prem-muted)] mb-2">
                {t('premiumHome.collections')}
              </p>
              <h2 className="text-3xl md:text-5xl prem-display">{t('premiumHome.featuredCategories')}</h2>
            </div>
          </div>
          <div className="prem-rail md:grid md:grid-cols-3 md:overflow-visible gap-4">
            {collections.slice(0, 6).map((c, i) => {
              const cover =
                c.image_url ||
                products.find((p) => p.collection_ids.includes(c.id))?.image ||
                '';
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCatalog(c.id)}
                  className="group relative w-[78vw] max-w-[320px] md:w-full aspect-[4/5] rounded-[var(--prem-radius)] overflow-hidden text-left"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--prem-accent)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 p-5 text-white">
                    <h3 className="text-2xl prem-display">{c.name}</h3>
                    {c.description && (
                      <p className="text-sm text-white/70 line-clamp-2 mt-1">{c.description}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="bg-[var(--prem-surface)] py-16 md:py-24 border-y border-[var(--prem-line)]">
        <div className="prem-container">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--prem-muted)] mb-2">
                {t('premiumHome.curated')}
              </p>
              <h2 className="text-3xl md:text-5xl prem-display">{t('premiumHome.bestSellers')}</h2>
            </div>
            <button type="button" className="prem-btn prem-btn-ghost !py-2 text-sm" onClick={() => openCatalog()}>
              {t('premiumHome.viewAll')}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {bestSellers.slice(0, 8).map((p) => (
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
          {!bestSellers.length && (
            <p className="text-center text-[var(--prem-muted)] py-12">{t('premiumHome.emptyProducts')}</p>
          )}
        </div>
      </section>

      <section className="prem-container py-12 md:py-16">
        <div className="rounded-[var(--prem-radius)] bg-[var(--prem-accent)] text-white px-6 py-10 md:px-12 md:py-14 flex flex-col md:flex-row md:items-center md:justify-between gap-6 overflow-hidden relative">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,#ffffff33,transparent_45%)]" />
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.22em] text-white/60 mb-2">{t('premiumHome.shipping')}</p>
            <h2 className="text-3xl md:text-4xl prem-display max-w-xl">{promoText}</h2>
          </div>
          <button type="button" className="relative prem-btn bg-white text-[var(--prem-ink)]" onClick={() => openCatalog()}>
            {t('premiumHome.shopCollection')}
          </button>
        </div>
      </section>

      <section className="prem-container pb-16 md:pb-24">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--prem-muted)] mb-2">
              {t('premiumHome.justIn')}
            </p>
            <h2 className="text-3xl md:text-5xl prem-display">{t('premiumHome.newArrivals')}</h2>
          </div>
        </div>
        <div className="prem-rail">
          {newestProducts.slice(0, 10).map((p) => (
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

      <section className="bg-[var(--prem-surface)] border-y border-[var(--prem-line)] py-16 md:py-20">
        <div className="prem-container">
          <h2 className="text-3xl md:text-4xl prem-display text-center mb-10">{t('premiumHome.whyShop')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            <Why icon={Truck} title={t('premiumHome.fastDelivery')} text={t('premiumHome.fastDeliveryBody')} />
            <Why icon={Lock} title={t('premiumHome.securePayments')} text={t('premiumHome.securePaymentsBody')} />
            <Why icon={RefreshCw} title={t('premiumHome.easyReturns')} text={t('premiumHome.easyReturnsBody')} />
            <Why icon={Headphones} title={t('premiumHome.support')} text={t('premiumHome.supportBody')} />
          </div>
        </div>
      </section>

      {showReviews && (
        <section className="prem-container py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl prem-display mb-8 text-center">{t('premiumHome.whatCustomersSay')}</h2>
          <div className="prem-rail md:grid md:grid-cols-3 md:overflow-visible gap-4">
            {reviews.slice(0, 6).map((r) => (
              <blockquote
                key={r.id}
                className="w-[80vw] max-w-[340px] md:w-full bg-[var(--prem-surface)] border border-[var(--prem-line)] rounded-[var(--prem-radius)] p-5"
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`}
                    />
                  ))}
                </div>
                <p className="text-sm leading-relaxed min-h-[3.5rem]">
                  {r.comment || t('premiumHome.defaultReview')}
                </p>
                <footer className="mt-4 text-xs text-[var(--prem-muted)]">{r.customer_name}</footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <section className="prem-container pb-20">
        <div className="rounded-[var(--prem-radius)] border border-[var(--prem-line)] bg-[var(--prem-surface)] px-6 py-12 md:px-16 text-center">
          <Package className="h-8 w-8 mx-auto mb-4 text-[var(--prem-accent)]" />
          <h2 className="text-3xl md:text-4xl prem-display">{t('premiumHome.stayInLoop')}</h2>
          <p className="text-[var(--prem-muted)] mt-3 max-w-md mx-auto text-sm">
            {t('premiumHome.newsletterBody')}
          </p>
          <form
            className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (fd.get('email')) {
                e.currentTarget.reset();
                toast.success(t('premiumHome.subscribed'));
              }
            }}
          >
            <input
              name="email"
              type="email"
              required
              placeholder={t('premiumHome.emailPlaceholder')}
              className="flex-1 rounded-full border border-[var(--prem-line)] px-4 py-3 text-sm"
            />
            <button type="submit" className="prem-btn prem-btn-primary">
              {t('premiumHome.subscribe')}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Why({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Truck;
  title: string;
  text: string;
}) {
  return (
    <div className="text-center space-y-2">
      <div className="mx-auto h-12 w-12 rounded-full bg-[var(--prem-accent-soft)] flex items-center justify-center">
        <Icon className="h-5 w-5 text-[var(--prem-accent)]" />
      </div>
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="text-xs text-[var(--prem-muted)] leading-relaxed">{text}</p>
    </div>
  );
}
