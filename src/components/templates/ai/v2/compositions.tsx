import type { CSSProperties } from 'react';
import { ShoppingBag } from 'lucide-react';
import type { CompositionRenderProps } from './registry';
import { resolveProducts } from './registry';
import { ProductPresentation } from './ProductPresentation';
import { formatStoreMoney, resolvePresentationMode } from './money';
import { productReviewStats } from '@/lib/storefront/api';
import type { StorefrontProduct } from '@/lib/storefront/types';

/** Per-product rating from real, product-linked reviews only — never a store-wide average. */
function ratingOf(commerce: CompositionRenderProps['commerce'], product: StorefrontProduct) {
  const stats = productReviewStats(commerce.reviews || [], product.id);
  return { ratingAvg: stats.avg, ratingCount: stats.count };
}

function str(v: unknown, fallback = '') {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

/**
 * Neutral functional label for interactive controls that must stay operable when the
 * generator omits copy. Deliberately not brand voice — stylistic renderer defaults
 * ("Quiet luxury", "Our story") made unrelated generations read alike.
 */
function functionalCta(language: 'ro' | 'en') {
  return language === 'ro' ? 'Vezi produsele' : 'View products';
}

function currencyOf(commerce: CompositionRenderProps['commerce']) {
  const c = commerce as { currency?: string; locale?: string; customization?: { currency?: string } };
  return {
    currency: c.currency || c.customization?.currency || 'EUR',
    locale: c.locale || 'en-EU',
  };
}

function modeOf(props: CompositionRenderProps) {
  return resolvePresentationMode(props.brand.archetype, props.node.content.presentation);
}

function layoutOf(node: CompositionRenderProps['node'], fallback: string) {
  return str(node.content.layout, fallback);
}

/** Phase 5A — apply existing design knobs so strategy-driven SiteTree differences actually render. */
function sectionDesignProps(node: CompositionRenderProps['node']) {
  const d = node.design || {};
  const measure =
    d.measure ||
    (d.fullBleed ? 'bleed' : undefined);
  return {
    'data-spacing': d.spacing || undefined,
    'data-align': d.alignment || undefined,
    'data-emphasis': d.emphasis || undefined,
    'data-measure': measure || undefined,
    'data-bleed': d.fullBleed || measure === 'bleed' ? '1' : undefined,
    style:
      d.minHeight && d.minHeight !== 'auto'
        ? ({ minHeight: d.minHeight } as CSSProperties)
        : undefined,
  };
}

function Wrap({
  node,
  className,
  children,
  as: Tag = 'section',
}: {
  node: CompositionRenderProps['node'];
  className: string;
  children: React.ReactNode;
  as?: 'section' | 'div' | 'header' | 'footer';
}) {
  const props = sectionDesignProps(node);
  return (
    <Tag className={className} {...props}>
      <div className="ai-v2-wrap">{children}</div>
    </Tag>
  );
}

/* ─── Navigation ─────────────────────────────────────────────── */

function NavChrome({ node, commerce, transparent }: CompositionRenderProps & { transparent?: boolean }) {
  const name = str(node.content.storeName, 'Store');
  const logo = str(node.content.logoUrl);
  const tone = str(node.content.tone, transparent ? 'dark' : 'auto');
  return (
    <header
      className={`ai-v2-nav ${transparent ? 'ai-v2-nav-transparent' : 'ai-v2-nav-minimal'}`}
      data-tone={tone}
    >
      <div className="ai-v2-wrap ai-v2-nav-inner">
        <button type="button" className="ai-v2-brand" onClick={() => commerce.setView('home')}>
          {logo ? <img src={logo} alt={name} /> : <span>{name}</span>}
        </button>
        <nav className="ai-v2-nav-links" aria-label="Primary">
          <button type="button" onClick={() => commerce.setView('home')}>
            Home
          </button>
          <button type="button" onClick={() => commerce.openCatalog()}>
            Shop
          </button>
        </nav>
        <button type="button" className="ai-v2-cart" onClick={() => commerce.setCartOpen(true)} aria-label="Open cart">
          <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
          {commerce.cartCount > 0 && <span className="ai-v2-cart-badge">{commerce.cartCount}</span>}
        </button>
      </div>
    </header>
  );
}

export function NavMinimal(props: CompositionRenderProps) {
  return <NavChrome {...props} />;
}

export function NavTransparent(props: CompositionRenderProps) {
  return <NavChrome {...props} transparent />;
}

export function AnnouncementSlim({ node }: CompositionRenderProps) {
  const text = str(node.content.text);
  if (!text) return null;
  return (
    <div className="ai-v2-announcement">
      <span>{text}</span>
    </div>
  );
}

/* ─── Heroes ─────────────────────────────────────────────────── */

export function HeroEditorialSplit({ node, commerce, language, asset }: CompositionRenderProps) {
  const title = str(node.content.title);
  const subtitle = str(node.content.subtitle);
  const cta = str(node.content.cta, functionalCta(language));
  const kicker = str(node.content.kicker);
  const image = asset.imageUrl || '';
  // asymmetric: media offset off-center instead of an even 50/50 split — same data, same
  // primitives, a genuinely different silhouette (Part D: coherent hero family, not templates).
  const asymmetric = layoutOf(node, 'split') === 'asymmetric';
  return (
    <section
      className={`ai-v2-hero ai-v2-hero-split ${asymmetric ? 'ai-v2-hero-split-asymmetric' : ''}`}
      {...sectionDesignProps(node)}
      data-spacing={node.design?.spacing || 'airy'}
    >
      <div className="ai-v2-wrap ai-v2-hero-split-grid">
        <div className="ai-v2-hero-copy">
          {kicker ? <p className="ai-v2-kicker">{kicker}</p> : null}
          {title ? <h1>{title}</h1> : null}
          {subtitle ? <p className="ai-v2-lead">{subtitle}</p> : null}
          <button type="button" className="ai-v2-btn ai-v2-btn-text" onClick={() => commerce.openCatalog()}>
            {cta}
          </button>
        </div>
        <div className="ai-v2-hero-media">
          {image ? <img src={image} alt="" /> : <div className="ai-v2-media-fallback" />}
        </div>
      </div>
    </section>
  );
}

export function HeroLuxuryMinimal({ node, commerce, language, asset }: CompositionRenderProps) {
  const title = str(node.content.title);
  const subtitle = str(node.content.subtitle);
  const kicker = str(node.content.kicker);
  const cta = str(node.content.cta, functionalCta(language));
  const image = asset.imageUrl || '';
  // cinematic: deeper veil + eyebrow kicker + bottom-anchored copy for a more atmospheric,
  // slower-feeling open than the default centered-quiet treatment.
  const cinematic = layoutOf(node, 'quiet') === 'cinematic';
  return (
    <section
      className={`ai-v2-hero ai-v2-hero-luxury ${cinematic ? 'ai-v2-hero-luxury-cinematic' : ''}`}
      {...sectionDesignProps(node)}
      style={{
        ...(image ? { backgroundImage: `url(${image})` } : {}),
        ...(sectionDesignProps(node).style || {}),
      }}
      data-minh={node.design?.minHeight || '100vh'}
      data-bleed={node.design?.fullBleed !== false ? '1' : sectionDesignProps(node)['data-bleed']}
    >
      <div className="ai-v2-hero-luxury-veil" />
      <div className="ai-v2-wrap ai-v2-hero-luxury-copy">
        {/* cinematic styles the kicker as an eyebrow above a deeper veil; it must not
            gate whether authored kicker content renders at all. */}
        {kicker ? <p className="ai-v2-kicker">{kicker}</p> : null}
        {title ? <h1>{title}</h1> : null}
        {subtitle ? <p className="ai-v2-lead">{subtitle}</p> : null}
        <button type="button" className="ai-v2-btn ai-v2-btn-ghost" onClick={() => commerce.openCatalog()}>
          {cta}
        </button>
      </div>
    </section>
  );
}

/** True product hero — not a ProductCard in a hero slot. */
export function HeroProductFocus({ node, commerce, brand, language, asset }: CompositionRenderProps) {
  const product = asset.product;
  const title = str(node.content.title, product?.title || '');
  const subtitle = str(node.content.subtitle);
  const kicker = str(node.content.kicker);
  const cta = str(node.content.cta, functionalCta(language));
  const { currency, locale } = currencyOf(commerce);
  const image = asset.imageUrl || '';
  // stacked: image above copy, centered — an app-like vertical rhythm instead of the
  // default side-by-side stage, useful when the architect wants a narrower/taller feel.
  const stacked = layoutOf(node, 'stage') === 'stacked';

  return (
    <section
      className={`ai-v2-hero ai-v2-hero-product ${stacked ? 'ai-v2-hero-product-stacked' : ''}`}
      {...sectionDesignProps(node)}
      data-density={brand.tokens.density}
    >
      <div className="ai-v2-wrap ai-v2-hero-product-stage">
        <div className="ai-v2-hero-product-figure">
          {image ? <img src={image} alt={title} /> : <div className="ai-v2-media-fallback tall" />}
        </div>
        <div className="ai-v2-hero-product-copy">
          {kicker ? <p className="ai-v2-kicker">{kicker}</p> : null}
          {title ? <h1>{title}</h1> : null}
          {subtitle ? <p className="ai-v2-lead">{subtitle}</p> : null}
          {product ? (
            <p className="ai-v2-hero-product-price">{formatStoreMoney(product.price, currency, locale)}</p>
          ) : null}
          <button
            type="button"
            className="ai-v2-btn"
            onClick={() => (product ? commerce.openProduct(product) : commerce.openCatalog())}
          >
            {cta}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─── Products ───────────────────────────────────────────────── */

export function ProductGridEditorial(props: CompositionRenderProps) {
  const { node, commerce, brand, language } = props;
  const products = resolveProducts(commerce, node);
  const title = str(node.content.title);
  const layout = layoutOf(node, 'featureFirst');
  const mode = modeOf(props);
  const { currency, locale } = currencyOf(commerce);
  const [first, ...rest] = products;

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-merch" data-spacing={node.design.spacing || 'airy'} data-layout={layout}>
      <div className="ai-v2-wrap">
        <div className="ai-v2-section-head">
          {title ? <h2>{title}</h2> : <span />}
          <button type="button" className="ai-v2-text-link" onClick={() => commerce.openCatalog()}>
            View all
          </button>
        </div>

        {layout === 'asymmetricFeature' && first && rest.length === 0 ? (
          // Only one product resolved: an anchor + empty fill column isn't a real
          // asymmetry, it's a broken layout. Fall back to a single, intentional
          // full-width feature presentation instead.
          <div className="ai-v2-merch-asymmetric-solo">
            <ProductPresentation
              product={first}
              mode={mode}
              currency={currency}
              locale={locale}
              language={language}
              featured
              onOpen={commerce.openProduct}
              onAdd={(p) => commerce.addToCart(p)}
              showQuickAdd={mode !== 'luxury' && node.dataBindings?.showQuickAdd !== false}
              showSpec={mode === 'tech'}
              showRating={mode === 'tech'}
              {...ratingOf(commerce, first)}
            />
          </div>
        ) : layout === 'asymmetricFeature' && first ? (
          // Irregular grid: one oversized tile anchors the composition, the rest fill a
          // denser secondary grid around it — a real structural asymmetry, not a palette swap.
          <div className="ai-v2-merch-asymmetric" data-density={brand.tokens.density}>
            <div className="ai-v2-merch-asymmetric-anchor">
              <ProductPresentation
                product={first}
                mode={mode}
                currency={currency}
                locale={locale}
                language={language}
                featured
                onOpen={commerce.openProduct}
                onAdd={(p) => commerce.addToCart(p)}
                showQuickAdd={mode !== 'luxury' && node.dataBindings?.showQuickAdd !== false}
                showSpec={mode === 'tech'}
                showRating={mode === 'tech'}
                {...ratingOf(commerce, first)}
              />
            </div>
            <div className="ai-v2-merch-asymmetric-fill">
              {rest.slice(0, 5).map((p) => (
                <ProductPresentation
                  key={p.id}
                  product={p}
                  mode={mode}
                  currency={currency}
                  locale={locale}
                  language={language}
                  compact
                  onOpen={commerce.openProduct}
                  onAdd={(item) => commerce.addToCart(item)}
                  showQuickAdd={mode !== 'luxury' && node.dataBindings?.showQuickAdd !== false}
                  showRating={mode === 'tech'}
                  {...ratingOf(commerce, p)}
                />
              ))}
            </div>
          </div>
        ) : layout === 'featureFirst' && first ? (
          <div className="ai-v2-merch-feature">
            <ProductPresentation
              product={first}
              mode={mode}
              currency={currency}
              locale={locale}
              language={language}
              featured
              onOpen={commerce.openProduct}
              onAdd={(p) => commerce.addToCart(p)}
              showQuickAdd={mode !== 'luxury' && node.dataBindings?.showQuickAdd !== false}
              showSpec={mode === 'tech'}
              showRating={mode === 'tech'}
              {...ratingOf(commerce, first)}
            />
            <div className="ai-v2-merch-side">
              {rest.slice(0, 4).map((p) => (
                <ProductPresentation
                  key={p.id}
                  product={p}
                  mode={mode}
                  currency={currency}
                  locale={locale}
                  language={language}
                  onOpen={commerce.openProduct}
                  onAdd={(item) => commerce.addToCart(item)}
                  showQuickAdd={mode !== 'luxury' && node.dataBindings?.showQuickAdd !== false}
                  showSpec={mode === 'tech'}
                  showRating={mode === 'tech'}
                  {...ratingOf(commerce, p)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={`ai-v2-merch-grid ai-v2-merch-${mode}`} data-density={brand.tokens.density}>
            {products.map((p) => (
              <ProductPresentation
                key={p.id}
                product={p}
                mode={mode}
                currency={currency}
                locale={locale}
                language={language}
                onOpen={commerce.openProduct}
                onAdd={(item) => commerce.addToCart(item)}
                showQuickAdd={mode !== 'luxury' && node.dataBindings?.showQuickAdd !== false}
                showSpec={mode === 'tech'}
                showRating={mode === 'tech'}
                {...ratingOf(commerce, p)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Luxury image-first grid: a genuinely new registry entry (not a `content.layout` mode of
 * ProductGridEditorial) because the silhouette is structurally different — one oversized
 * column of full-bleed product imagery with minimal metadata, not a multi-column grid at any
 * density. Reuses the same product data, ProductPresentation ('luxury' mode), price formatting
 * and design-knob plumbing as every other composition — no new business logic.
 */
export function ProductGridLuxuryImageFirst(props: CompositionRenderProps) {
  const { node, commerce, language } = props;
  const products = resolveProducts(commerce, { ...node, dataBindings: { ...node.dataBindings, limit: node.dataBindings?.limit || 4 } });
  const title = str(node.content.title);
  const { currency, locale } = currencyOf(commerce);

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-luxury-grid" data-spacing={node.design.spacing || 'dramatic'}>
      <div className="ai-v2-wrap">
        {title ? (
          <div className="ai-v2-section-head">
            <h2>{title}</h2>
          </div>
        ) : null}
        <div className="ai-v2-luxury-grid-stack">
          {products.map((p) => (
            <ProductPresentation
              key={p.id}
              product={p}
              mode="luxury"
              currency={currency}
              locale={locale}
              language={language}
              featured
              onOpen={commerce.openProduct}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProductRailHorizontal(props: CompositionRenderProps) {
  const { node, commerce, language } = props;
  const products = resolveProducts(commerce, {
    ...node,
    dataBindings: { ...node.dataBindings, limit: node.dataBindings?.limit || 10 },
  });
  const title = str(node.content.title);
  const mode = modeOf(props);
  const { currency, locale } = currencyOf(commerce);
  // alternatingOversized: every third item breaks scale, giving the rail a syncopated
  // rhythm instead of a uniform filmstrip of identical tiles.
  const alternating = layoutOf(node, 'uniform') === 'alternatingOversized';

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-rail-section">
      {title ? (
        <div className="ai-v2-wrap">
          <h2 className="ai-v2-rail-title">{title}</h2>
        </div>
      ) : null}
      <div className={`ai-v2-rail ${alternating ? 'ai-v2-rail-alternating' : ''}`} data-mode={mode}>
        {products.map((p, idx) => (
          <div
            key={p.id}
            className="ai-v2-rail-item"
            data-oversized={alternating && idx % 3 === 0 ? '1' : undefined}
          >
            <ProductPresentation
              product={p}
              mode={mode}
              currency={currency}
              locale={locale}
              language={language}
              compact={!(alternating && idx % 3 === 0)}
              onOpen={commerce.openProduct}
              onAdd={(item) => commerce.addToCart(item)}
              showQuickAdd={mode === 'street' || mode === 'tech'}
              showRating={mode === 'tech'}
              {...ratingOf(commerce, p)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductSpotlightFeature({ node, commerce, asset }: CompositionRenderProps) {
  const product = asset.product;
  const title = str(node.content.title, product?.title || '');
  const body = str(node.content.body);
  const kicker = str(node.content.kicker);
  const { currency, locale } = currencyOf(commerce);

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-spotlight">
      <div className="ai-v2-wrap ai-v2-spotlight-grid">
        <div className="ai-v2-spotlight-media">
          {asset.imageUrl ? (
            <img src={asset.imageUrl} alt={product?.title || ''} />
          ) : (
            <div className="ai-v2-media-fallback tall" />
          )}
        </div>
        <div className="ai-v2-spotlight-copy">
          {kicker ? <p className="ai-v2-kicker">{kicker}</p> : null}
          {title ? <h2>{title}</h2> : null}
          {body ? <p className="ai-v2-lead">{body}</p> : null}
          {product ? <p className="ai-v2-spotlight-price">{formatStoreMoney(product.price, currency, locale)}</p> : null}
          {product ? (
            <button type="button" className="ai-v2-btn ai-v2-btn-text" onClick={() => commerce.openProduct(product)}>
              {str(node.content.cta, 'View details')}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ─── Story ──────────────────────────────────────────────────── */

export function EditorialSplitImageText({ node, asset }: CompositionRenderProps) {
  const title = str(node.content.title);
  const body = str(node.content.body);
  const image = asset.imageUrl || '';
  const reverse = Boolean(node.content.reverse);

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-editorial-split" data-spacing={node.design.spacing || 'dramatic'} data-reverse={reverse ? '1' : '0'}>
      <div className="ai-v2-wrap ai-v2-editorial-grid">
        <div className="ai-v2-editorial-media">{image ? <img src={image} alt="" /> : <div className="ai-v2-media-fallback tall" />}</div>
        <div className="ai-v2-editorial-copy">
          {title ? <h2>{title}</h2> : null}
          {body ? <p className="ai-v2-lead">{body}</p> : null}
        </div>
      </div>
    </section>
  );
}

export function BrandStatementLarge({ node }: CompositionRenderProps) {
  const statement = str(node.content.statement || node.content.title);
  if (!statement) return null;
  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-statement">
      <div className="ai-v2-wrap">
        <p className="ai-v2-statement-text">{statement}</p>
      </div>
    </section>
  );
}

/** Magazine mosaic — captions as typography, not overlay stickers. */
export function EditorialMosaicAsymmetric({ node, commerce }: CompositionRenderProps) {
  const products = resolveProducts(commerce, {
    ...node,
    dataBindings: { ...node.dataBindings, products: node.dataBindings?.products || 'newest', limit: 4 },
  });
  const title = str(node.content.title);
  const layout = layoutOf(node, 'magazine');
  const caption = str(node.content.caption);

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-mosaic-section" data-layout={layout}>
      <div className="ai-v2-wrap">
        {title || caption ? (
          <div className="ai-v2-mosaic-head">
            {title ? <h2>{title}</h2> : null}
            {caption ? <p className="ai-v2-lead">{caption}</p> : null}
          </div>
        ) : null}

        {layout === 'immersive' && products[0] ? (
          <div className="ai-v2-mosaic-immersive">
            <button type="button" className="ai-v2-mosaic-bleed" onClick={() => commerce.openProduct(products[0])}>
              {products[0].image ? <img src={products[0].image} alt={products[0].title} /> : null}
            </button>
            <div className="ai-v2-mosaic-float">
              {products.slice(1, 3).map((p) => (
                <button key={p.id} type="button" onClick={() => commerce.openProduct(p)}>
                  {p.image ? <img src={p.image} alt={p.title} /> : null}
                  <span className="ai-v2-mosaic-cap">{p.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-v2-mosaic-mag">
            {products.slice(0, 4).map((p, idx) => (
              <figure key={p.id} className={`ai-v2-mosaic-fig ai-v2-mosaic-fig-${idx + 1}`}>
                <button type="button" onClick={() => commerce.openProduct(p)}>
                  {p.image ? <img src={p.image} alt={p.title} /> : <div className="ai-v2-media-fallback" />}
                </button>
                <figcaption>
                  <span className="ai-v2-mosaic-index">{String(idx + 1).padStart(2, '0')}</span>
                  <span>{p.title}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Proof ──────────────────────────────────────────────────── */

export function TestimonialsEditorial({ node, asset }: CompositionRenderProps) {
  const layout = layoutOf(node, 'quote');
  // No invented testimonials: an empty testimonials node renders nothing rather than
  // attributing a fabricated quote to a fabricated customer.
  const items = Array.isArray(node.content.items)
    ? (node.content.items as Array<{ quote?: string; author?: string; location?: string; imageUrl?: string }>)
    : [];
  const primary = items[0];
  if (!primary || !str(primary.quote)) return null;
  const image = str(primary.imageUrl) || asset.imageUrl || '';

  if (layout === 'imageQuote') {
    return (
      <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-testimonial ai-v2-testimonial-image">
        <div className="ai-v2-wrap ai-v2-testimonial-image-grid">
          <div className="ai-v2-testimonial-photo">{image ? <img src={image} alt="" /> : <div className="ai-v2-media-fallback tall" />}</div>
          <blockquote>
            <p>{str(primary?.quote)}</p>
            <cite>
              <span>{str(primary?.author)}</span>
              {primary?.location ? <span>{primary.location}</span> : null}
            </cite>
          </blockquote>
        </div>
      </section>
    );
  }

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-testimonial ai-v2-testimonial-quote">
      <div className="ai-v2-wrap">
        <blockquote>
          <p>{str(primary?.quote)}</p>
          <cite>
            <span>— {str(primary?.author)}</span>
            {primary?.location ? <span>{primary.location}</span> : null}
          </cite>
        </blockquote>
        {items.length > 1 ? (
          <ul className="ai-v2-testimonial-list">
            {items.slice(1, 3).map((item, i) => (
              <li key={i}>
                <p>“{str(item.quote)}”</p>
                <span>{str(item.author)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** Reviews as editorial index — deliberately different from testimonials. */
export function ReviewsWall({ node, commerce, language }: CompositionRenderProps) {
  const title = str(node.content.title, language === 'ro' ? 'Recenzii' : 'Reviews');
  const reviews = commerce.reviews?.slice(0, 6) || [];
  const avg =
    reviews.length > 0 ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0;
  // grid: dense card grid instead of the editorial index list — reads better for a
  // catalogue_first / dense_campaign page composition than a long vertical list.
  const grid = layoutOf(node, 'index') === 'grid';

  if (!reviews.length) {
    return (
      <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-reviews">
        <div className="ai-v2-wrap">
          <p className="ai-v2-kicker">{title}</p>
          <p className="ai-v2-lead">Reviews will appear here once customers share their experience.</p>
        </div>
      </section>
    );
  }

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-reviews">
      <div className="ai-v2-wrap">
        <div className="ai-v2-reviews-head">
          <div>
            <p className="ai-v2-kicker">{title}</p>
            <p className="ai-v2-reviews-score">
              <span>{avg.toFixed(1)}</span>
              <small>/ 5</small>
            </p>
            <p className="ai-v2-reviews-count">{reviews.length} verified notes</p>
          </div>
        </div>
        <ol className={grid ? 'ai-v2-reviews-grid' : 'ai-v2-reviews-index'}>
          {reviews.map((r) => (
            <li key={r.id}>
              <div className="ai-v2-reviews-stars" aria-label={`${r.rating} of 5`}>
                {'★'.repeat(Math.round(r.rating || 0))}
                <span className="dim">{'★'.repeat(Math.max(0, 5 - Math.round(r.rating || 0)))}</span>
              </div>
              {r.comment ? <p>{r.comment}</p> : null}
              <footer>
                <span>Verified customer</span>
                <span>{r.customer_name}</span>
              </footer>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── Collections ────────────────────────────────────────────── */

export function CollectionsTiles({ node, commerce, language }: CompositionRenderProps) {
  const title = str(node.content.title, language === 'ro' ? 'Colecții' : 'Collections');
  const collections = commerce.collections.slice(0, 4);
  const layout = layoutOf(node, 'editorial');
  if (!collections.length) return null;

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-collections" data-layout={layout}>
      <div className="ai-v2-wrap">
        <h2 className="ai-v2-collections-title">{title}</h2>
        <div className={layout === 'stacked' ? 'ai-v2-collections-stacked' : 'ai-v2-collections-editorial'}>
          {collections.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              className={`ai-v2-collections-block ai-v2-collections-block-${idx + 1}`}
              data-reverse={layout === 'stacked' && idx % 2 === 1 ? '1' : undefined}
              onClick={() => commerce.openCatalog(c.id)}
            >
              <div className="ai-v2-collections-media">
                {c.image_url ? <img src={c.image_url} alt="" /> : <div className="ai-v2-media-fallback" />}
              </div>
              <div className="ai-v2-collections-copy">
                <span className="ai-v2-kicker">{String(idx + 1).padStart(2, '0')}</span>
                <strong>{c.name}</strong>
                {c.description ? <span>{c.description}</span> : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Newsletter ─────────────────────────────────────────────── */

export function NewsletterQuiet({ node, language }: CompositionRenderProps) {
  const layout = layoutOf(node, 'statement');
  const title = str(node.content.title, language === 'ro' ? 'Newsletter' : 'Newsletter');
  const text = str(node.content.text);
  const kicker = str(node.content.kicker);

  return (
    <section {...sectionDesignProps(node)} className="ai-v2-section ai-v2-newsletter" data-layout={layout}>
      <div className="ai-v2-wrap ai-v2-newsletter-stage">
        {kicker ? <p className="ai-v2-kicker">{kicker}</p> : null}
        <h2>{title}</h2>
        {text ? <p className="ai-v2-lead">{text}</p> : null}
        <form
          className="ai-v2-newsletter-form"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <label className="sr-only" htmlFor={`ai-v2-nl-${node.id}`}>
            Email
          </label>
          <input id={`ai-v2-nl-${node.id}`} type="email" placeholder="you@email.com" autoComplete="email" />
          <button type="submit">{language === 'ro' ? 'Trimite' : 'Subscribe'}</button>
        </form>
      </div>
    </section>
  );
}

/* ─── Footers ────────────────────────────────────────────────── */

export function FooterMinimalCommerce({ node, commerce }: CompositionRenderProps) {
  const name = str(node.content.storeName, 'Store');
  return (
    <footer className="ai-v2-footer ai-v2-footer-minimal">
      <div className="ai-v2-wrap">
        <div className="ai-v2-footer-minimal-top">
          <button type="button" className="ai-v2-footer-mark" onClick={() => commerce.setView('home')}>
            {name}
          </button>
          <nav className="ai-v2-footer-nav" aria-label="Footer">
            <button type="button" onClick={() => commerce.openCatalog()}>
              Shop
            </button>
            <button type="button" onClick={() => commerce.setView('home')}>
              Home
            </button>
            <a href="#shipping">Shipping</a>
            <a href="#contact">Contact</a>
          </nav>
        </div>
        <div className="ai-v2-footer-minimal-bottom">
          {str(node.content.text) ? <p>{str(node.content.text)}</p> : null}
          <p className="ai-v2-footer-legal">© {new Date().getFullYear()} {name}</p>
        </div>
      </div>
    </footer>
  );
}

export function FooterEditorialLuxury({ node }: CompositionRenderProps) {
  return (
    <footer className="ai-v2-footer ai-v2-footer-luxury">
      <div className="ai-v2-wrap">
        <h3>{str(node.content.storeName, 'Store')}</h3>
        {str(node.content.blurb) ? (
          <p className="ai-v2-statement-text ai-v2-footer-statement">{str(node.content.blurb)}</p>
        ) : null}
        <p className="ai-v2-footer-fine">{str(node.content.text)}</p>
      </div>
    </footer>
  );
}
