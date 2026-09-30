import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './theme.css';
import {
  CartDrawer,
  CheckoutForm,
  Footer,
  Header,
  ProductDetail,
  ProductGrid,
  useCart,
  useMerchant,
  useProduct,
  useProducts,
} from '../../../speedvendors';
import {
  isSafeMediaUrl,
  resolveContentSlots,
  type ContentSlots,
  type FoundationMarketingSectionId,
} from '../../contentSlots';
import { useThemePageBackground } from '../../useThemePageBackground';
import { foundationContentDefaults, foundationThemeOptions } from './defaults';
import { foundationSystemUi } from './systemUi';
import Hero from './sections/Hero';
import Marquee from './sections/Marquee';
import Collections from './sections/Collections';
import Featured from './sections/Featured';
import Shop from './sections/Shop';
import Editorial from './sections/Editorial';
import Why from './sections/Why';
import CtaBand from './sections/CtaBand';
import { WhyIcon } from './sections/icons';
import { ProductSkeleton } from './sections/States';

type View = { name: 'home' } | { name: 'product'; id: string } | { name: 'checkout' };

const DEFAULT_ORDER: FoundationMarketingSectionId[] = [
  'marquee',
  'collections',
  'featured',
  'editorial',
  'why',
  'ctaBand',
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export type FoundationStorefrontProps = {
  content?: ContentSlots;
};

export default function FoundationStorefront({ content: contentProp }: FoundationStorefrontProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useThemePageBackground(rootRef, '#fbfaf8');

  const [view, setView] = useState<View>({ name: 'home' });
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const { data: merchant } = useMerchant();
  const { cart } = useCart();
  const { data: products } = useProducts({});
  const productQuery = useProduct(view.name === 'product' ? view.id : null);

  const content = useMemo(() => {
    if (contentProp) return contentProp;
    return resolveContentSlots(foundationContentDefaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentProp, typeof window !== 'undefined' ? window.location.search : '']);

  const featuredIds = useMemo(() => {
    const configured = foundationThemeOptions.featuredProductIds || [];
    if (configured.length) return configured.slice(0, foundationThemeOptions.maxFeatured);
    const withImage = (products || []).filter((p) => p.images?.[0]?.url && p.inStock);
    return withImage.slice(0, foundationThemeOptions.maxFeatured).map((p) => p.id);
  }, [products]);

  const nav = content.navLabels || foundationContentDefaults.navLabels!;
  const sectionOrder = (content.sections?.order?.length
    ? content.sections.order
    : foundationContentDefaults.sections?.order || DEFAULT_ORDER) as FoundationMarketingSectionId[];
  const sectionHidden = new Set<FoundationMarketingSectionId>(
    (content.sections?.hidden || foundationContentDefaults.sections?.hidden || []) as FoundationMarketingSectionId[],
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen || cartOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen, cartOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setCartOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setLogoFailed(false), [content.logo?.src]);

  const goHome = () => {
    setView({ name: 'home' });
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const openProduct = (id: string) => {
    setView({ name: 'product', id });
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const navTo = (id: string) => {
    setMenuOpen(false);
    if (view.name !== 'home') {
      setView({ name: 'home' });
      window.setTimeout(() => scrollToId(id), 50);
      return;
    }
    scrollToId(id);
  };

  const selectCategory = (id: string) => {
    setCategoryId(id);
    navTo('shop');
  };

  const logo = content.logo && isSafeMediaUrl(content.logo.src) && !logoFailed ? content.logo : null;
  const whyCards = content.whyCards || foundationContentDefaults.whyCards || [];

  const homeSections: ReactNode[] = [];
  let shopRendered = false;
  const pushShop = () => {
    shopRendered = true;
    homeSections.push(
      <Shop
        key="shop"
        content={content}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        onOpenProduct={openProduct}
      />,
    );
  };

  // Shop insertion: after featured; else after collections; else after marquee; else after hero.
  const shopAfter: FoundationMarketingSectionId | 'hero' = sectionHidden.has('featured')
    ? sectionHidden.has('collections')
      ? sectionHidden.has('marquee')
        ? 'hero'
        : 'marquee'
      : 'collections'
    : 'featured';

  if (shopAfter === 'hero') pushShop();

  for (const id of sectionOrder) {
    if (sectionHidden.has(id)) continue;
    if (id === 'marquee') {
      homeSections.push(
        <Marquee key="marquee" items={content.marqueeItems || foundationContentDefaults.marqueeItems || []} />,
      );
    } else if (id === 'collections') {
      homeSections.push(
        <Collections key="collections" content={content} onSelectCategory={selectCategory} />,
      );
    } else if (id === 'featured') {
      homeSections.push(
        <Featured key="featured" content={content} featuredIds={featuredIds} onOpenProduct={openProduct} />,
      );
    } else if (id === 'editorial') {
      homeSections.push(<Editorial key="editorial" content={content} onNav={navTo} />);
    } else if (id === 'why') {
      homeSections.push(<Why key="why" content={content} />);
    } else if (id === 'ctaBand') {
      homeSections.push(<CtaBand key="cta" content={content} onNav={navTo} />);
    }
    if (!shopRendered && id === shopAfter) pushShop();
  }
  if (!shopRendered) pushShop();

  const socialLinks = content.socialLinks || [];
  const relatedCategoryId = productQuery.data?.categoryId || undefined;

  return (
    <div
      className="fd-root"
      data-sv-theme="foundation"
      data-fd-card-fit={foundationThemeOptions.productImageFit}
      ref={rootRef}
    >
      <a className="fd-skip" href="#shop">
        {foundationSystemUi.skipToShop}
      </a>

      {(content.announcement || foundationContentDefaults.announcement) && (
        <div className="fd-announce" role="note">
          <p>{content.announcement || foundationContentDefaults.announcement}</p>
        </div>
      )}

      <div className={`fd-chrome${scrolled ? ' is-scrolled' : ''}`}>
        <div className="fd-wrap fd-bar">
          {logo ? (
            <img
              className="fd-logo"
              src={logo.src}
              alt={logo.alt || merchant?.name || foundationSystemUi.logoAlt}
              onError={() => setLogoFailed(true)}
            />
          ) : null}
          <Header
            merchant={merchant}
            cartCount={cart.itemCount}
            onOpenCart={() => {
              setMenuOpen(false);
              setCartOpen(true);
            }}
            onHome={goHome}
          />
          <nav className="fd-nav" aria-label={foundationSystemUi.sectionsNav}>
            <button type="button" onClick={() => navTo('shop')}>
              {nav.shop}
            </button>
            <button type="button" onClick={() => navTo('featured')}>
              {nav.featured}
            </button>
            <button type="button" onClick={() => navTo('why')}>
              {nav.why}
            </button>
            <button type="button" onClick={() => navTo('contact')}>
              {nav.contact}
            </button>
          </nav>
          <button
            type="button"
            className="fd-burger"
            aria-expanded={menuOpen}
            aria-controls="fd-mobile-nav"
            aria-label={menuOpen ? foundationSystemUi.closeMenu : foundationSystemUi.menu}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
        <nav
          className={`fd-mobile-nav${menuOpen ? ' is-open' : ''}`}
          id="fd-mobile-nav"
          aria-label={foundationSystemUi.mobileNav}
          hidden={!menuOpen}
        >
          <button type="button" onClick={() => navTo('shop')}>
            {nav.shop}
          </button>
          <button type="button" onClick={() => navTo('featured')}>
            {nav.featured}
          </button>
          <button type="button" onClick={() => navTo('why')}>
            {nav.why}
          </button>
          <button type="button" onClick={() => navTo('contact')}>
            {nav.contact}
          </button>
        </nav>
      </div>

      <main id="fd-main">
        {view.name === 'home' && (
          <>
            <Hero
              content={content}
              featuredProductIds={featuredIds}
              onNav={navTo}
              onOpenProduct={openProduct}
            />
            {homeSections}
          </>
        )}

        {view.name === 'product' && (
          <>
            <ProductDetail
              productId={view.id}
              onBack={goHome}
              loadingFallback={<ProductSkeleton count={1} />}
            />
            {whyCards.length > 0 ? (
              <section className="fd-assure" aria-label="Assurances">
                <div className="fd-wrap fd-assure__list">
                  {whyCards.slice(0, 3).map((card, idx) => (
                    <div key={`${card.title}-${idx}`} className="fd-assure__item">
                      <WhyIcon icon={card.icon} />
                      <div>
                        <strong>{card.title}</strong>
                        <p>{card.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="fd-section fd-related">
              <div className="fd-wrap">
                <h2 className="fd-h2">{content.relatedTitle || foundationContentDefaults.relatedTitle}</h2>
                <ProductGrid
                  query={{ categoryId: relatedCategoryId }}
                  onOpenProduct={openProduct}
                  loadingLabel={foundationSystemUi.loadingProducts}
                  loadingFallback={<ProductSkeleton count={4} />}
                />
              </div>
            </section>
          </>
        )}

        {view.name === 'checkout' && (
          <section className="fd-section">
            <div className="fd-wrap">
              <CheckoutForm onBack={() => setView({ name: 'home' })} />
            </div>
          </section>
        )}
      </main>

      <div className="fd-footer-shell" id="contact">
        <div className="fd-wrap fd-footer">
          <div>
            <p className="fd-footer__name">{merchant?.name || foundationSystemUi.storeFallback}</p>
            <p className="fd-footer__tag">
              {content.footerTagline || merchant?.tagline || foundationContentDefaults.footerTagline}
            </p>
            {socialLinks.length > 0 ? (
              <ul className="fd-footer__social" aria-label={foundationSystemUi.socialNav}>
                {socialLinks.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <h2>{content.footerExploreTitle || foundationContentDefaults.footerExploreTitle}</h2>
            <div className="fd-footer__links">
              <button type="button" onClick={() => navTo('shop')}>
                {nav.shop}
              </button>
              <button type="button" onClick={() => navTo('featured')}>
                {nav.featured}
              </button>
              <button type="button" onClick={() => navTo('why')}>
                {nav.why}
              </button>
            </div>
          </div>
          <div>
            <h2>{content.footerPaymentsTitle || foundationContentDefaults.footerPaymentsTitle}</h2>
            <p className="fd-footer__pay">
              <span>{content.footerPaymentsCopy || foundationContentDefaults.footerPaymentsCopy}</span>{' '}
              {merchant?.contactEmail ? (
                <span>
                  {foundationSystemUi.contactPrefix} {merchant.contactEmail}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <Footer merchant={merchant} />
      </div>

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          setView({ name: 'checkout' });
        }}
      />
    </div>
  );
}
