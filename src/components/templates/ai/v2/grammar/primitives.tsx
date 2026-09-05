import type { CSSProperties, ReactNode } from 'react';
import { ShoppingBag } from 'lucide-react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { StorefrontProduct } from '@/lib/storefront/types';
import { formatStoreMoney } from '@/components/templates/ai/v2/money';
import type { MediaCrop, ProductTreatment, TypographyRoleId } from '@/lib/ai-studio/v2/layoutGrammar/types';
import { clampCopy } from '@/lib/ai-studio/v2/layoutGrammar/extractContent';

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
  variant = 'text',
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
      <button type="button" className="lg-cart" onClick={() => commerce.setCartOpen(true)} aria-label="Open cart">
        <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
        {commerce.cartCount > 0 ? <span className="lg-cart-badge">{commerce.cartCount}</span> : null}
      </button>
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
      <LgType role="editorialHeading" as="p" className="lg-footer-mark">
        {name}
      </LgType>
      {blurb ? (
        <LgType role="supporting" as="p">
          {blurb}
        </LgType>
      ) : null}
      <div className="lg-footer-links">
        <button type="button" onClick={() => commerce.openCatalog()}>
          Shop
        </button>
        <button type="button" onClick={() => commerce.setView('home')}>
          Home
        </button>
      </div>
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
        {product.category && treatment !== 'editorial_borderless' ? (
          <LgType role="kicker" as="p">
            {product.category}
          </LgType>
        ) : null}
        <button type="button" className="lg-product-name" onClick={() => commerce.openProduct(product)}>
          {product.title}
        </button>
        <p className="lg-product-price">{price}</p>
        {treatment === 'dense_catalog' || treatment === 'campaign_poster' || treatment === 'artifact_stage' ? (
          <div className="lg-product-actions">
            <LgCta variant={treatment === 'campaign_poster' ? 'solid' : 'text'} onClick={() => commerce.openProduct(product)}>
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
        ) : null}
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

export function shellStyle(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties;
}

export { clampCopy };
