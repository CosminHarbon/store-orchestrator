// Novatee theme root — composes protected SpeedVendors commerce UI only.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './theme.css';
import {
  CartDrawer,
  CheckoutForm,
  Footer,
  Header,
  ProductDetail,
  useCart,
  useMerchant,
  useProducts,
} from '../../../speedvendors';
import {
  isSafeMediaUrl,
  resolveContentSlots,
  type ContentSlots,
  type MarketingSectionId,
} from '../../contentSlots';
import { novateeContentDefaults, novateeThemeOptions } from './defaults';
import { novateeSystemUi } from './systemUi';
import HeroSection from './sections/Hero';
import Marquee from './sections/Marquee';
import MerchandisingSection from './sections/Merchandising';
import WhySection from './sections/Why';

type View = { name: 'home' } | { name: 'product'; id: string } | { name: 'checkout' };

const DEFAULT_SECTION_ORDER: MarketingSectionId[] = ['marquee', 'featured', 'why'];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export type NovateeStorefrontProps = {
  /** Optional content overrides (already merged by caller, or raw defaults). */
  content?: ContentSlots;
};

export default function NovateeStorefront({ content: contentProp }: NovateeStorefrontProps) {
  const [view, setView] = useState<View>({ name: 'home' });
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const { data: merchant } = useMerchant();
  const { cart } = useCart();
  const { data: products } = useProducts({});

  const content = useMemo(() => {
    if (contentProp) return contentProp;
    return resolveContentSlots(novateeContentDefaults);
    // Re-resolve when search changes only if preview hints are enabled inside resolveContentSlots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentProp, typeof window !== 'undefined' ? window.location.search : '']);

  const featuredIds = useMemo(() => {
    const configured = novateeThemeOptions.featuredProductIds || [];
    if (configured.length) return configured;
    const withImage = (products || []).filter((p) => p.images?.[0]?.url);
    if (withImage.length) return [withImage[0].id];
    return (products || []).slice(0, 1).map((p) => p.id);
  }, [products]);

  const nav = content.navLabels || novateeContentDefaults.navLabels!;
  const sectionOrder =
    content.sections?.order?.length
      ? content.sections.order
      : novateeContentDefaults.sections?.order || DEFAULT_SECTION_ORDER;
  const sectionHidden = new Set<MarketingSectionId>(
    content.sections?.hidden || novateeContentDefaults.sections?.hidden || [],
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

  const logo = content.logo && isSafeMediaUrl(content.logo.src) && !logoFailed ? content.logo : null;

  const homeSections: ReactNode[] = [];
  let shopRendered = false;
  const pushShop = () => {
    shopRendered = true;
    homeSections.push(
      <MerchandisingSection
        key="shop"
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        featuredIds={novateeThemeOptions.featuredProductIds}
        onOpenProduct={openProduct}
        showFilters={novateeThemeOptions.showCategoryFilters}
        content={content}
        showShop
        showFeatured={false}
      />,
    );
  };

  for (const id of sectionOrder) {
    if (sectionHidden.has(id)) continue;
    if (id === 'marquee') {
      homeSections.push(
        <Marquee
          key="marquee"
          items={content.marqueeItems || novateeContentDefaults.marqueeItems || []}
        />,
      );
      continue;
    }
    if (id === 'featured') {
      if (!shopRendered) pushShop();
      homeSections.push(
        <MerchandisingSection
          key="featured"
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
          featuredIds={novateeThemeOptions.featuredProductIds}
          onOpenProduct={openProduct}
          showFilters={novateeThemeOptions.showCategoryFilters}
          content={content}
          showShop={false}
          showFeatured
        />,
      );
      continue;
    }
    if (id === 'why') {
      homeSections.push(<WhySection key="why" content={content} />);
    }
  }
  if (!shopRendered) pushShop();

  const socialLinks = content.socialLinks || [];

  return (
    <div className="sf-root" data-sv-theme="novatee">
      <a className="sf-skip" href="#shop">
        {novateeSystemUi.skipToShop}
      </a>

      <div className="sf-announce" role="note">
        <span>{content.announcement || novateeContentDefaults.announcement}</span>
      </div>

      <div className={`sf-site-chrome${scrolled ? ' is-scrolled' : ''}`}>
        <div className="sf-header-bar">
          <div className="sf-header-bar__main">
            {logo && (
              <img
                className="sf-logo-slot"
                src={logo.src}
                alt={logo.alt || merchant?.name || novateeSystemUi.logoAlt}
                onError={() => setLogoFailed(true)}
              />
            )}
            <Header
              merchant={merchant}
              cartCount={cart.itemCount}
              onOpenCart={() => {
                setMenuOpen(false);
                setCartOpen(true);
              }}
              onHome={goHome}
            />
            <nav className="sf-pres-nav" aria-label={novateeSystemUi.sectionsNav}>
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
          <button
            type="button"
            className={`sf-burger${menuOpen ? ' is-open' : ''}`}
            aria-label={novateeSystemUi.menu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
        <nav className={`sf-mobile-nav${menuOpen ? ' is-open' : ''}`} aria-label={novateeSystemUi.mobileNav}>
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

      <main>
        {view.name === 'home' && (
          <>
            <HeroSection
              merchant={merchant}
              content={content}
              featuredProductIds={featuredIds}
              onCta={() => scrollToId('shop')}
              onSecondary={() => scrollToId('why')}
            />
            {homeSections}
          </>
        )}
        {view.name === 'product' && <ProductDetail productId={view.id} onBack={goHome} />}
        {view.name === 'checkout' && <CheckoutForm onBack={goHome} />}
      </main>

      <div className="sf-footer-shell" id="contact">
        <div className="sf-footer-extra">
          <div>
            <div className="sf-footer-brand">
              {merchant?.name || novateeSystemUi.storeFallback}
            </div>
            <p className="sf-muted">
              {content.footerTagline ||
                merchant?.tagline ||
                novateeContentDefaults.footerTagline}
            </p>
            {socialLinks.length > 0 && (
              <div className="sf-footer-social">
                {socialLinks.map((link) => (
                  <a key={`${link.label}-${link.url}`} href={link.url} rel="noopener noreferrer">
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4>{content.footerExploreTitle || novateeContentDefaults.footerExploreTitle}</h4>
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
          <div>
            <h4>{content.footerPaymentsTitle || novateeContentDefaults.footerPaymentsTitle}</h4>
            <p className="sf-muted">
              {content.footerPaymentsCopy || novateeContentDefaults.footerPaymentsCopy}
              {merchant?.contactEmail ? ` Contact: ${merchant.contactEmail}` : ''}
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
