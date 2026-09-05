import { useState, type CSSProperties, type ReactNode } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { StorefrontProduct } from '@/lib/storefront/types';
import { formatStoreMoney } from '@/components/templates/ai/v2/money';
import type { MediaCrop, ProductTreatment, TypographyRoleId } from '@/lib/ai-studio/v2/layoutGrammar/types';

export function LgType({
  role,
  as: Tag = 'p',
  className = '',
  children,
}: {
  role: TypographyRoleId;
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'span' | 'div';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={`lg-type lg-type-${role} ${className}`.trim()} data-role={role}>
      {children}
    </Tag>
  );
}

export function LgMedia({
  src,
  alt,
  ratio = '4 / 5',
  crop = 'center',
  className = '',
}: {
  src: string;
  alt: string;
  ratio?: string;
  crop?: MediaCrop;
  className?: string;
}) {
  const pos: Record<MediaCrop, string> = {
    center: '50% 50%',
    left: '20% 50%',
    right: '80% 50%',
    top: '50% 18%',
    bottom: '50% 82%',
  };
  if (!src) {
    return <div className={`lg-media lg-media-empty ${className}`.trim()} style={{ aspectRatio: ratio }} aria-hidden />;
  }
  return (
    <div className={`lg-media ${className}`.trim()} style={{ aspectRatio: ratio }}>
      <img src={src} alt={alt} style={{ objectPosition: pos[crop] }} width={1200} height={1500} />
    </div>
  );
}

export function LgCta({
  children,
  onClick,
  variant = 'solid',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'text' | 'solid' | 'ghost' | 'bar';
}) {
  return (
    <button type="button" className={`lg-cta lg-cta-${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function LgNav({
  name,
  commerce,
  variant,
  tone = 'auto',
}: {
  name: string;
  commerce: StorefrontCommerce;
  variant: 'overlay' | 'solid' | 'minimal' | 'campaign';
  tone?: 'auto' | 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className={`lg-nav lg-nav-${variant}`} data-tone={tone}>
      <button type="button" className="lg-brand" onClick={() => commerce.setView('home')}>
        {name}
      </button>
      <nav className="lg-nav-links" aria-label="Primary">
        <button type="button" onClick={() => commerce.setView('home')}>
          Home
        </button>
        <button type="button" onClick={() => commerce.openCatalog()}>
          Shop
        </button>
      </nav>
      <div className="lg-nav-end">
        <button
          type="button"
          className="lg-nav-toggle"
          aria-expanded={open}
          aria-controls="lg-nav-drawer"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
          <span>{open ? 'Close' : 'Menu'}</span>
        </button>
        <button type="button" className="lg-cart" onClick={() => commerce.setCartOpen(true)} aria-label="Open cart">
          <ShoppingBag className="h-5 w-5" strokeWidth={1.6} />
          <span className="lg-cart-label">Cart</span>
          <span className="lg-cart-badge" data-empty={commerce.cartCount === 0 ? '1' : '0'}>
            {commerce.cartCount}
          </span>
        </button>
      </div>
      {open ? (
        <div id="lg-nav-drawer" className="lg-nav-drawer">
          <button type="button" onClick={() => { setOpen(false); commerce.setView('home'); }}>
            Home
          </button>
          <button type="button" onClick={() => { setOpen(false); commerce.openCatalog(); }}>
            Shop the collection
          </button>
          <button type="button" onClick={() => { setOpen(false); commerce.setCartOpen(true); }}>
            Cart{commerce.cartCount ? ` (${commerce.cartCount})` : ''}
          </button>
        </div>
      ) : null}
    </header>
  );
}

export function LgFooter({
  name,
  blurb,
  commerce,
}: {
  name: string;
  blurb: string;
  commerce: StorefrontCommerce;
}) {
  return (
    <footer className="lg-footer">
      <div className="lg-footer-brand">
        <p className="lg-footer-mark">{name}</p>
        {blurb ? <p className="lg-footer-blurb">{blurb}</p> : null}
      </div>
      <nav className="lg-footer-col" aria-label="Store">
        <p className="lg-footer-head">Store</p>
        <button type="button" onClick={() => commerce.openCatalog()}>
          Shop
        </button>
        <button type="button" onClick={() => commerce.setView('home')}>
          Home
        </button>
      </nav>
      <nav className="lg-footer-col" aria-label="Visit">
        <p className="lg-footer-head">Visit</p>
        <button type="button" onClick={() => commerce.setCartOpen(true)}>
          Cart
        </button>
        <button type="button" onClick={() => commerce.openCatalog()}>
          Collections
        </button>
      </nav>
    </footer>
  );
}

export function LgProduct({
  product,
  treatment,
  commerce,
  currency,
  locale,
  featured = false,
  ratio,
}: {
  product: StorefrontProduct;
  treatment: ProductTreatment;
  commerce: StorefrontCommerce;
  currency: string;
  locale: string;
  featured?: boolean;
  ratio?: string;
}) {
  const price = formatStoreMoney(product.price, currency, locale);
  const out = product.stock <= 0;
  const r =
    ratio ||
    (treatment === 'artifact_stage'
      ? '4 / 5'
      : treatment === 'campaign_poster'
        ? '3 / 4'
        : treatment === 'film_still'
          ? '16 / 9'
          : featured
            ? '4 / 5'
            : '4 / 5');

  return (
    <article className={`lg-product lg-product-${treatment} ${featured ? 'is-featured' : ''}`}>
      <button type="button" className="lg-product-media" onClick={() => commerce.openProduct(product)}>
        <LgMedia src={product.image} alt={product.title} ratio={r} crop="center" />
      </button>
      <div className="lg-product-meta">
        {product.category ? (
          <LgType role="kicker" as="p">
            {product.category}
          </LgType>
        ) : null}
        <button type="button" className="lg-product-name" onClick={() => commerce.openProduct(product)}>
          {product.title}
        </button>
        <p className="lg-product-price">{price}</p>
        <div className="lg-product-actions">
          <LgCta variant={treatment === 'campaign_poster' ? 'solid' : 'solid'} onClick={() => commerce.openProduct(product)}>
            View
          </LgCta>
          {!out ? (
            <LgCta variant="text" onClick={() => commerce.addToCart(product)}>
              Add to cart
            </LgCta>
          ) : (
            <span className="lg-sold">Sold out</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function currencyOf(commerce: StorefrontCommerce) {
  const c = commerce as { currency?: string; locale?: string; customization?: { currency?: string } };
  return {
    currency: c.currency || c.customization?.currency || 'EUR',
    locale: c.locale || 'en-EU',
  };
}

export function priceOf(amount: number, currency: string, locale: string) {
  return formatStoreMoney(amount, currency, locale);
}

export function shellStyle(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties;
}
