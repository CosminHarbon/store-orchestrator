import { ChevronDown, Lock, Sparkles, Truck } from 'lucide-react';
import { useState } from 'react';
import BlockRenderer from '@/components/templates/BlockRenderer';
import { SandboxedHtml } from '@/components/templates/SandboxedHtml';
import type { TemplateBlock } from '@/components/templates/BlockEditor';
import { productReviewStats } from '@/lib/storefront/api';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { isStockHeroUrl } from '@/lib/ai-studio/layouts';
import type { HomeSection, StorefrontSpec } from '@/lib/ai-studio/spec';
import { ProductCard } from '@/components/templates/premium/ProductCard';

interface Props {
  spec: StorefrontSpec;
  commerce: StorefrontCommerce;
  section: HomeSection;
}

const ICONS = { truck: Truck, lock: Lock, sparkles: Sparkles } as const;

export function resolveHeroImage(spec: StorefrontSpec, commerce: StorefrontCommerce): string {
  const url = (spec.copy.heroImageUrl || '').trim();
  if (!isStockHeroUrl(url)) return url;
  return (
    commerce.bestSellers[0]?.image ||
    commerce.newestProducts[0]?.image ||
    commerce.products.find((p) => p.image)?.image ||
    commerce.collections.find((c) => c.image_url)?.image_url ||
    url
  );
}

export function AiSection({ spec, commerce, section }: Props) {
  if (section.visible === false) return null;
  const { customization, collections, products, reviews, bestSellers, newestProducts, openCatalog, openProduct, addToCart } =
    commerce;
  const p = section.props || {};
  const radius = spec.tokens.radius;
  const ro = spec.language === 'ro';

  switch (section.type) {
    case 'announcement':
      return (
        <div className="ai-announcement">
          {spec.copy.announcement || p.text}
        </div>
      );
    case 'hero':
      return <Hero spec={spec} commerce={commerce} onShop={() => openCatalog()} />;
    case 'split-hero':
      return (
        <Hero spec={spec} commerce={commerce} onShop={() => openCatalog()} forceSplit />
      );
    case 'collections': {
      if (!collections.length) return null;
      return (
        <section className="ai-section">
          <div className="ai-container">
            <h2 className="ai-display ai-section-title">{p.title || (ro ? 'Colecții' : 'Collections')}</h2>
            <div className="ai-collection-grid">
              {collections.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCatalog(c.id)}
                  className={`ai-collection-card overflow-hidden text-left ${radius}`}
                >
                  <div className="ai-collection-media">
                    {c.image_url ? (
                      <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full ai-media-fallback" />
                    )}
                  </div>
                  <div className="ai-collection-label">{c.name}</div>
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }
    case 'featured-collection':
    case 'products': {
      const list = bestSellers.length ? bestSellers : newestProducts.length ? newestProducts : products;
      return (
        <section className="ai-section" id="products-section">
          <div className="ai-container">
            <div className="ai-section-head">
              <h2 className="ai-display ai-section-title">{p.title || (ro ? 'Produse recomandate' : 'Featured')}</h2>
              {list.length > 0 && (
                <button type="button" className="ai-text-link" onClick={() => openCatalog()}>
                  {ro ? 'Vezi tot' : 'View all'}
                </button>
              )}
            </div>
            {list.length ? (
              <div className="ai-product-grid">
                {list.slice(0, 8).map((product) => {
                  const stats = productReviewStats(reviews, product.id);
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onOpen={openProduct}
                      onAdd={addToCart}
                      ratingAvg={stats.avg}
                      ratingCount={stats.count}
                      showReviews={spec.productCard?.showRating !== false}
                      showQuickAdd={spec.productCard?.showQuickAdd !== false}
                      cardStyle={spec.productCard?.style || spec.tokens.productCardStyle}
                      imageRatio={spec.productCard?.imageRatio || '4/5'}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="ai-empty-catalog">
                <p className="ai-display text-2xl mb-2">{ro ? 'Niciun produs încă' : 'No products yet'}</p>
                <p>
                  {ro
                    ? 'Adaugă produse în Produse — apar aici, în previzualizare.'
                    : 'Add products in Products — they appear here.'}
                </p>
              </div>
            )}
          </div>
        </section>
      );
    }
    case 'reviews': {
      if (!reviews.length) return null;
      return (
        <section className="ai-section ai-reviews">
          <div className="ai-container">
            <h2 className="ai-display ai-section-title">{p.title || (ro ? 'Recenzii' : 'Reviews')}</h2>
            <div className="ai-review-grid">
              {reviews.slice(0, 6).map((r) => (
                <blockquote key={r.id} className={`ai-review-card ${radius}`}>
                  <p>“{r.comment || `${r.rating}/5`}”</p>
                  <footer>{r.customer_name}</footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      );
    }
    case 'faq': {
      const items = (spec.copy.faq || p.faqItems || [])
        .map((i) => ({ q: i.q || '', a: i.a || '' }))
        .filter((i) => i.q);
      if (!items.length) return null;
      return <Faq title={p.title || 'FAQ'} items={items} />;
    }
    case 'about':
      return (
        <section className="ai-section ai-about">
          <div className="ai-container ai-about-inner">
            <h2 className="ai-display ai-section-title">{p.title || (ro ? 'Povestea noastră' : 'Our story')}</h2>
            <p className="ai-about-body">{spec.copy.about || p.text}</p>
          </div>
        </section>
      );
    case 'features': {
      const features = (p.features || [])
        .map((f) => ({ title: f.title || '', body: f.body || '', icon: f.icon }))
        .filter((f) => f.title);
      if (!features.length) return null;
      return (
        <section className="ai-features">
          <div className="ai-container ai-features-grid">
            {features.map((f) => {
              const Icon = ICONS[(f.icon as keyof typeof ICONS) || 'sparkles'] || Sparkles;
              return (
                <div key={f.title} className="ai-feature">
                  <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <div className="ai-feature-title">{f.title}</div>
                    <p>{f.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }
    case 'lookbook': {
      const fromProps = (p.images || []).filter((img) => img.imageUrl);
      const fromCatalog = products
        .filter((product) => product.image)
        .slice(0, 4)
        .map((product) => ({ imageUrl: product.image, alt: product.title, caption: product.title }));
      const images = fromProps.length ? fromProps : fromCatalog;
      if (!images.length) return null;
      return (
        <section className="ai-section">
          <div className="ai-container">
            {p.title && <h2 className="ai-display ai-section-title">{p.title}</h2>}
            <div className="ai-lookbook">
              {images.map((img, i) => (
                <div key={`${img.imageUrl}-${i}`} className={`ai-lookbook-cell overflow-hidden ${i === 0 ? 'ai-lookbook-hero' : ''} ${radius}`}>
                  <img src={img.imageUrl} alt={img.alt || ''} />
                  {img.caption && <span className="ai-lookbook-caption">{img.caption}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }
    case 'marquee':
      return (
        <div className="ai-marquee">
          <span>
            {`${p.marqueeText || p.text || spec.copy.announcement || spec.copy.storeName}   ·   `.repeat(8)}
          </span>
        </div>
      );
    case 'contact':
      return (
        <section className="ai-section ai-reviews">
          <div className="ai-container text-center space-y-2">
            <h2 className="ai-display ai-section-title">{p.title || 'Contact'}</h2>
            <p className="opacity-70">{p.text || p.subtitle}</p>
          </div>
        </section>
      );
    case 'custom-html':
      return (
        <div className="py-8 ai-container">
          <SandboxedHtml html={p.html} css={p.css} />
        </div>
      );
    case 'header':
    case 'footer':
      return null;
    default: {
      const block: TemplateBlock = {
        id: section.id,
        user_id: '',
        template_id: 'ai',
        block_type: section.type,
        block_order: 0,
        title: p.title || null,
        content: {
          text: p.text || p.subtitle,
          imageUrl: p.imageUrl,
          imageAlt: p.imageAlt,
          buttonText: p.buttonText,
          buttonUrl: p.buttonUrl,
          backgroundColor: p.backgroundColor,
          textColor: p.textColor,
          quote: p.quote,
          author: p.author,
          authorTitle: p.authorTitle,
          videoUrl: p.videoUrl,
          html: p.html,
          css: p.css,
          layout: p.layout === 'image-left' || p.layout === 'image-right' ? p.layout : undefined,
          images: p.images?.map((img) => ({ url: img.imageUrl, alt: img.alt, caption: img.caption })),
          faqItems: p.faqItems?.map((i) => ({ q: i.q || '', a: i.a || '' })),
          features: p.features?.map((f) => ({ title: f.title || '', body: f.body || '', icon: f.icon })),
          marqueeText: p.marqueeText,
        },
        is_visible: true,
        created_at: '',
        updated_at: '',
      };
      return <BlockRenderer block={block} customization={customization} />;
    }
  }
}

function Hero({
  spec,
  commerce,
  onShop,
  forceSplit,
}: {
  spec: StorefrontSpec;
  commerce: StorefrontCommerce;
  onShop: () => void;
  forceSplit?: boolean;
}) {
  const layout = forceSplit ? 'split' : spec.hero?.layout || spec.tokens.heroLayout;
  const overlay = spec.hero?.overlay || 'soft';
  const img = resolveHeroImage(spec, commerce);
  const ctaStyle = spec.hero?.ctaStyle || spec.tokens.buttonStyle;
  const pill = ctaStyle === 'pill';
  const btn = `ai-btn ${ctaStyle === 'outline' ? 'ai-btn-outline' : 'ai-btn-solid'} ${pill ? 'ai-btn-pill' : spec.tokens.radius}`;
  const veil =
    overlay === 'none'
      ? 'ai-hero-cover-veil ai-hero-veil-none'
      : overlay === 'strong'
        ? 'ai-hero-cover-veil ai-hero-veil-strong'
        : 'ai-hero-cover-veil';

  if (layout === 'split') {
    return (
      <section className="ai-hero ai-hero-split">
        <div className="ai-hero-copy">
          <p className="ai-kicker">{spec.copy.storeName}</p>
          <h1 className="ai-display ai-hero-title">{spec.copy.heroTitle}</h1>
          <p className="ai-hero-sub">{spec.copy.heroSubtitle}</p>
          <button type="button" className={btn} onClick={onShop}>
            {spec.copy.heroButtonText}
          </button>
        </div>
        <div className="ai-hero-media">
          {img ? <img src={img} alt="" /> : <div className="ai-media-fallback h-full w-full" />}
        </div>
      </section>
    );
  }

  const align = layout === 'left' ? 'items-start text-left' : layout === 'right' ? 'items-end text-right' : 'items-center text-center';
  const minH = layout === 'fullBleed' ? 'min-h-[92vh]' : '';
  return (
    <section className={`ai-hero ai-hero-cover ${minH}`}>
      <div className="ai-hero-cover-bg">
        {img ? <img src={img} alt="" /> : <div className="h-full w-full" style={{ background: spec.tokens.secondary }} />}
        <div className={veil} />
      </div>
      <div className={`relative ai-container w-full pb-16 md:pb-24 pt-32 flex flex-col ${align}`}>
        <p className="ai-kicker ai-kicker-on-dark">{spec.copy.storeName}</p>
        <h1 className="ai-display ai-hero-title ai-hero-title-on-dark">{spec.copy.heroTitle}</h1>
        <p className="ai-hero-sub ai-hero-sub-on-dark">{spec.copy.heroSubtitle}</p>
        <button type="button" className={`${btn} mt-8`} onClick={onShop}>
          {spec.copy.heroButtonText}
        </button>
      </div>
    </section>
  );
}

function Faq({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <section className="ai-section">
      <div className="ai-container ai-faq">
        <h2 className="ai-display ai-section-title">{title}</h2>
        <div className="ai-faq-list">
          {items.map((item, i) => (
            <button
              key={item.q}
              type="button"
              className="ai-faq-item"
              onClick={() => setOpen(open === i ? -1 : i)}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">{item.q}</span>
                <ChevronDown className={`h-4 w-4 transition ${open === i ? 'rotate-180' : ''}`} />
              </div>
              {open === i && <p className="ai-faq-answer">{item.a}</p>}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
