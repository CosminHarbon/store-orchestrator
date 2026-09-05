import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { LayoutPlan } from '@/lib/ai-studio/v2/layoutGrammar/types';
import type { SemanticPage } from '@/lib/ai-studio/v2/layoutGrammar/extractContent';
import { clampCopy, displayLines } from '@/lib/ai-studio/v2/layoutGrammar/extractContent';
import type { DesignIntelligencePlan } from '@/lib/ai-studio/v2/designIntelligence';
import { monumentSpecs, productById, supportingProducts } from '@/lib/ai-studio/v2/designIntelligence';
import { LgCta, LgFooter, LgMedia, LgNav, LgProduct, LgType, currencyOf, priceOf } from './primitives';

type PageProps = {
  plan: LayoutPlan;
  page: SemanticPage;
  commerce: StorefrontCommerce;
  intelligence?: DesignIntelligencePlan | null;
};

export function EditorialAsymmetricPage({ plan, page, commerce }: PageProps) {
  const { copy, products, reviews } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const [lead, ...rest] = products;
  const storyImg = copy.storyImage;
  const typeFirst = v.heroGeometry === 'type_first_crop';
  const merch = v.productEmphasis === 'single' ? rest.slice(0, 3) : rest.slice(0, 5);

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav === 'overlay' ? 'solid' : v.nav} />
      <section
        className="lg-ed-hero"
        data-hero={v.heroGeometry}
        data-side={v.mediaSide}
        data-ratio={v.gridRatio}
      >
        <div className="lg-ed-hero-copy">
          <LgType role="kicker" as="p">
            {copy.kicker}
          </LgType>
          <LgType role="display" as="h1">
            {clampCopy(copy.title, 80)}
          </LgType>
          <LgType role="body" as="p">
            {clampCopy(copy.subtitle, 200)}
          </LgType>
          <LgCta variant="solid" onClick={() => commerce.openCatalog()}>
            {copy.cta}
          </LgCta>
        </div>
        <div className="lg-ed-hero-media">
          <LgMedia
            src={copy.heroImage}
            alt=""
            ratio={typeFirst ? '5 / 6' : '4 / 5'}
            crop={v.crop}
          />
        </div>
      </section>

      {copy.statement ? (
        <section className="lg-ed-pause">
          <p className="lg-ed-chapter">Chapter 01</p>
          <LgType role="editorialHeading" as="h2">
            {clampCopy(copy.statement, 140)}
          </LgType>
        </section>
      ) : null}

      {lead ? (
        <section className="lg-ed-feature" data-side={v.mediaSide === 'left' ? 'right' : 'left'}>
          <div className="lg-ed-feature-media">
            <LgMedia src={lead.image} alt={lead.title} ratio="3 / 4" crop="center" />
          </div>
          <div className="lg-ed-feature-copy">
            <LgType role="kicker" as="p">
              Featured piece
            </LgType>
            <LgType role="sectionHeading" as="h2">
              {lead.title}
            </LgType>
            <p className="lg-product-price">{priceOf(lead.price, currency, locale)}</p>
            <LgType role="body" as="p">
              {clampCopy(lead.description || copy.storyBody, 220)}
            </LgType>
            <div className="lg-product-actions">
              <LgCta variant="solid" onClick={() => commerce.addToCart(lead)}>
                Add to cart
              </LgCta>
              <LgCta variant="text" onClick={() => commerce.openProduct(lead)}>
                View details
              </LgCta>
            </div>
          </div>
        </section>
      ) : null}

      <section className="lg-ed-story" data-group={v.grouping}>
        <div className="lg-ed-story-copy">
          <p className="lg-ed-chapter">Chapter 02</p>
          <LgType role="sectionHeading" as="h2">
            {copy.storyTitle}
          </LgType>
          <LgType role="body" as="p">
            {clampCopy(copy.storyBody, 280)}
          </LgType>
        </div>
        <div className="lg-ed-cluster">
          <LgMedia src={storyImg} alt={copy.storyTitle} ratio="4 / 5" crop={v.crop} />
          {products[2]?.image && products[2].image !== storyImg ? (
            <LgMedia src={products[2].image} alt="" ratio="1 / 1" crop="left" />
          ) : null}
        </div>
      </section>

      <section className="lg-ed-merch">
        <div className="lg-ed-merch-head">
          <div>
            <p className="lg-ed-chapter">The shop</p>
            <LgType role="sectionHeading" as="h2">
              {copy.merchTitle}
            </LgType>
          </div>
          <LgCta variant="text" onClick={() => commerce.openCatalog()}>
            View all
          </LgCta>
        </div>
        <div className="lg-ed-stagger" data-emphasis={v.productEmphasis}>
          {merch.map((p, i) => (
            <div key={p.id} className="lg-ed-stagger-item" data-i={i}>
              <LgProduct
                product={p}
                treatment="editorial_borderless"
                commerce={commerce}
                currency={currency}
                locale={locale}
                ratio={i === 0 ? '4 / 5' : i === 1 ? '1 / 1' : '3 / 4'}
              />
            </div>
          ))}
        </div>
      </section>

      {reviews[0] ? (
        <section className="lg-ed-note">
          <LgType role="editorialHeading" as="p">
            “{clampCopy(reviews[0].comment || '', 140)}”
          </LgType>
          <LgType role="kicker" as="p">
            {reviews[0].customer_name}
          </LgType>
        </section>
      ) : null}

      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}

export function CinematicFullBleedPage({ plan, page, commerce }: PageProps) {
  const { copy, products } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const overlay = v.heroGeometry !== 'cinematic_letterbox' && (v.mobileHero === 'overlay' || plan.viewport === 'desktop' || plan.viewport === 'tablet');
  const hero = products[0];
  const detail = products[1];
  const shop = products.filter((p) => p.id !== detail?.id).slice(0, 4);
  const letterbox = v.heroGeometry === 'cinematic_letterbox';

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} tone="light" />
      <section className="lg-cin-hero" data-hero={v.heroGeometry} data-overlay={overlay ? '1' : '0'}>
        <LgMedia src={copy.heroImage} alt="" ratio={letterbox ? '21 / 9' : '16 / 10'} crop={v.crop} />
        <div className="lg-cin-veil" />
        <div className="lg-cin-copy">
          <LgType role="kicker" as="p">
            {copy.kicker}
          </LgType>
          <LgType role="display" as="h1">
            {clampCopy(copy.title, 64)}
          </LgType>
          <LgType role="body" as="p">
            {clampCopy(copy.subtitle, 160)}
          </LgType>
          <LgCta variant="solid" onClick={() => commerce.openCatalog()}>
            {copy.cta}
          </LgCta>
        </div>
      </section>

      {detail ? (
        <section className="lg-cin-detail">
          <div className="lg-cin-detail-media">
            <LgMedia src={detail.image} alt={detail.title} ratio="4 / 5" crop="top" />
          </div>
          <div className="lg-cin-detail-copy">
            <LgType role="kicker" as="p">
              Close frame
            </LgType>
            <LgType role="editorialHeading" as="h2">
              {copy.storyTitle}
            </LgType>
            <LgType role="body" as="p">
              {clampCopy(copy.storyBody, 220)}
            </LgType>
          </div>
        </section>
      ) : null}

      <section className="lg-cin-bridge">
        <div>
          <p className="lg-ed-chapter">Now showing</p>
          <LgType role="sectionHeading" as="h2">
            Shop the sequence
          </LgType>
        </div>
        <LgCta variant="solid" onClick={() => commerce.openCatalog()}>
          View the collection
        </LgCta>
      </section>

      <section className="lg-cin-sequence" data-mode={letterbox ? 'scenes' : 'stack'}>
        {shop.map((p, i) => (
          <article key={p.id} className="lg-cin-scene" data-i={i}>
            <button type="button" className="lg-cin-scene-media" onClick={() => commerce.openProduct(p)}>
              <LgMedia src={p.image} alt={p.title} ratio={i % 2 === 0 ? '16 / 9' : '4 / 5'} crop="center" />
            </button>
            <div className="lg-cin-scene-meta">
              <span className="lg-cin-num">0{i + 1}</span>
              <div>
                <button type="button" className="lg-product-name" onClick={() => commerce.openProduct(p)}>
                  {p.title}
                </button>
                <p className="lg-product-price">{priceOf(p.price, currency, locale)}</p>
              </div>
              <div className="lg-product-actions">
                <LgCta variant="solid" onClick={() => commerce.openProduct(p)}>
                  View
                </LgCta>
                <LgCta variant="ghost" onClick={() => commerce.addToCart(p)}>
                  Add to cart
                </LgCta>
              </div>
            </div>
          </article>
        ))}
      </section>

      {hero ? (
        <p className="lg-sr-only">
          Opening product {hero.title}
        </p>
      ) : null}

      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}

export function ProductMonumentPage({ plan, page, commerce, intelligence }: PageProps) {
  const { copy, products } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const hero = intelligence
    ? productById(products, intelligence.catalog.primaryProductId) || products[0]
    : products[0];
  if (!hero) return <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} />;
  const framed = v.heroGeometry === 'product_artifact_stage' || v.heroGeometry === 'quiet_luxury_minimal';
  const specs = intelligence
    ? monumentSpecs(intelligence, products, copy)
    : [
        { id: 'form', title: 'Form', body: hero.description || copy.subtitle, imageUrl: products[1]?.image || null, imageAlt: products[1]?.title || '', productId: products[1]?.id || '' },
        { id: 'make', title: 'Make', body: copy.storyBody, imageUrl: products[2]?.image || null, imageAlt: products[2]?.title || '', productId: products[2]?.id || '' },
        { id: 'use', title: 'Use', body: copy.statement || copy.subtitle, imageUrl: products[3]?.image || null, imageAlt: products[3]?.title || '', productId: products[3]?.id || '' },
      ];
  const rail = intelligence ? supportingProducts(intelligence, products) : products.slice(1, 5);

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav === 'overlay' ? 'solid' : v.nav} />
      <section className="lg-mon-hero" data-hero={v.heroGeometry} data-side={v.mediaSide} data-framed={framed ? '1' : '0'}>
        <div className="lg-mon-figure">
          <LgMedia src={hero.image} alt={hero.title} ratio="4 / 5" crop={v.crop} />
        </div>
        <div className="lg-mon-identity">
          <LgType role="kicker" as="p">
            {hero.category || copy.kicker}
          </LgType>
          <LgType role="display" as="h1">
            {hero.title}
          </LgType>
          <p className="lg-product-price lg-mon-price">{priceOf(hero.price, currency, locale)}</p>
          <LgType role="body" as="p">
            {clampCopy(hero.description || copy.subtitle, 180)}
          </LgType>
          <div className="lg-mon-actions">
            <LgCta variant="solid" onClick={() => commerce.addToCart(hero)}>
              Add to cart
            </LgCta>
            <LgCta variant="text" onClick={() => commerce.openProduct(hero)}>
              View details
            </LgCta>
          </div>
        </div>
      </section>

      {specs.length ? (
        <section className="lg-mon-narrative" data-intelligence={intelligence ? '1' : '0'}>
          {specs.map((s, i) => (
            <article key={s.id} className="lg-mon-spec" data-spec={s.id} data-spec-product={s.productId || ''}>
              <div className="lg-mon-spec-copy">
                <LgType role="kicker" as="p">
                  0{i + 1} / {s.title}
                </LgType>
                <LgType role="sectionHeading" as="h2">
                  {s.title}
                </LgType>
                <LgType role="body" as="p">
                  {clampCopy(s.body, 200)}
                </LgType>
              </div>
              {s.imageUrl ? (
                <LgMedia src={s.imageUrl} alt={s.imageAlt} ratio={i === 1 ? '1 / 1' : '4 / 5'} crop="center" />
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {rail.length ? (
        <section className="lg-mon-support">
          <div className="lg-ed-merch-head">
            <div>
              <p className="lg-ed-chapter">Next pieces</p>
              <LgType role="sectionHeading" as="h2">
                After the monument
              </LgType>
            </div>
            <LgCta variant="text" onClick={() => commerce.openCatalog()}>
              Shop all
            </LgCta>
          </div>
          <div className="lg-mon-rail">
            {rail.slice(0, 4).map((p) => (
              <LgProduct
                key={p.id}
                product={p}
                treatment="horizontal_story"
                commerce={commerce}
                currency={currency}
                locale={locale}
                ratio="4 / 5"
              />
            ))}
          </div>
        </section>
      ) : null}

      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}

export function TypographicCampaignPage({ plan, page, commerce }: PageProps) {
  const { copy, products } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const lines = displayLines(copy.title, copy.title.length > 28 ? 3 : 2);
  const stacked = v.heroGeometry === 'campaign_stack';
  const modules = products.slice(0, 4);

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} tone="light" />
      <section className="lg-ty-hero" data-hero={v.heroGeometry} data-side={v.mediaSide} data-lines={String(lines.length)}>
        <div className="lg-ty-display">
          <h1 className="lg-ty-h1">
            {lines.map((ln) => (
              <span key={ln} className="lg-type lg-type-display">
                {ln}
              </span>
            ))}
          </h1>
        </div>
        <div className="lg-ty-media">
          <LgMedia src={copy.heroImage} alt="" ratio={stacked ? '16 / 10' : '3 / 4'} crop={v.crop} />
        </div>
        <div className="lg-ty-lead">
          <LgType role="body" as="p">
            {clampCopy(copy.subtitle, 140)}
          </LgType>
          <LgCta variant="solid" onClick={() => commerce.openCatalog()}>
            {copy.cta}
          </LgCta>
        </div>
      </section>

      <div className="lg-ty-marquee" aria-hidden="true">
        <p>{products.map((p) => p.title).join('  —  ')}</p>
      </div>

      <section className="lg-ty-bridge">
        <LgType role="sectionHeading" as="h2">
          Drop 01
        </LgType>
        <LgCta variant="ghost" onClick={() => commerce.openCatalog()}>
          Shop the campaign
        </LgCta>
      </section>

      <section className="lg-ty-posters">
        {modules.map((p, i) => (
          <article key={p.id} className="lg-ty-poster" data-mod={i % 3 === 0 ? 'band' : i % 3 === 1 ? 'split' : 'stack'}>
            <div className="lg-ty-poster-media">
              <LgMedia src={p.image} alt={p.title} ratio={i === 0 ? '4 / 5' : i === 1 ? '1 / 1' : '16 / 10'} crop={v.crop} />
              <div className="lg-ty-poster-band">
                <h2 className="lg-product-name">{p.title}</h2>
                <p className="lg-product-price">{priceOf(p.price, currency, locale)}</p>
              </div>
            </div>
            <div className="lg-ty-poster-meta">
              <LgCta variant="solid" onClick={() => commerce.openProduct(p)}>
                Shop
              </LgCta>
              <LgCta variant="ghost" onClick={() => commerce.addToCart(p)}>
                Add to cart
              </LgCta>
            </div>
          </article>
        ))}
      </section>

      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}

export function ImmersiveCatalogPage({ plan, page, commerce }: PageProps) {
  const { copy, products, collections } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const featured = products[0];
  const mosaic = products.slice(1);

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} />
      <p className="lg-experimental-flag">Experimental / rejected — not in the approved set</p>
      <section className="lg-cat-intro" data-hero={v.heroGeometry}>
        <LgType role="display" as="h1">
          {clampCopy(copy.title, 56)}
        </LgType>
        <LgType role="body" as="p">
          {clampCopy(copy.subtitle, 140)}
        </LgType>
      </section>

      {collections.length ? (
        <div className="lg-cat-chips" role="navigation" aria-label="Categories">
          {collections.map((c) => (
            <button key={c.id} type="button" className="lg-chip" onClick={() => commerce.openCatalog(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {featured ? (
        <section className="lg-cat-breakout">
          <LgProduct
            product={featured}
            treatment="featured_oversized"
            commerce={commerce}
            currency={currency}
            locale={locale}
            featured
            ratio={v.heroGeometry === 'featured_breakout_hero' ? '16 / 9' : '4 / 5'}
          />
          <div className="lg-cat-breakout-copy">
            <LgType role="kicker" as="p">
              Featured
            </LgType>
            <LgType role="sectionHeading" as="h2">
              {featured.title}
            </LgType>
            <LgType role="supporting" as="p">
              {clampCopy(featured.description, 140)}
            </LgType>
            <LgCta variant="solid" onClick={() => commerce.openProduct(featured)}>
              View
            </LgCta>
          </div>
        </section>
      ) : null}

      <section className="lg-cat-mosaic" data-ratio={v.gridRatio}>
        {mosaic.slice(0, 6).map((p, i) => (
          <div key={p.id} className="lg-cat-cell" data-span={i === 2 ? 'wide' : i === 0 ? 'tall' : 'std'}>
            <LgProduct
              product={p}
              treatment={i === 2 ? 'category_interrupt' : 'mixed_mosaic'}
              commerce={commerce}
              currency={currency}
              locale={locale}
              ratio={i === 0 ? '3 / 4' : i === 2 ? '16 / 10' : '1 / 1'}
            />
          </div>
        ))}
      </section>

      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}

export function WarmStorytellingPage({ plan, page, commerce }: PageProps) {
  const { copy, products, reviews } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const cluster = [copy.heroImage, copy.storyImage, products[1]?.image].filter(Boolean) as string[];
  const chapters = [
    { mark: 'I', title: copy.storyTitle, body: copy.storyBody, product: products[0] },
    { mark: 'II', title: copy.statement || 'Kept close', body: copy.subtitle, product: products[2] },
  ];

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} />
      <p className="lg-experimental-flag">Experimental / rejected — not in the approved set</p>
      <section className="lg-wa-hero" data-hero={v.heroGeometry}>
        <div className="lg-wa-cluster">
          {cluster.map((src, i) => (
            <LgMedia key={src} src={src} alt="" ratio={i === 0 ? '4 / 5' : i === 1 ? '1 / 1' : '3 / 4'} crop={v.crop} />
          ))}
        </div>
        <div className="lg-wa-lede">
          <LgType role="kicker" as="p">
            {copy.kicker}
          </LgType>
          <LgType role="display" as="h1">
            {clampCopy(copy.title, 70)}
          </LgType>
        </div>
      </section>

      {chapters.map((ch) => (
        <section key={ch.mark} className="lg-wa-chapter">
          <p className="lg-wa-mark">{ch.mark}</p>
          <div className="lg-wa-chapter-copy">
            <LgType role="editorialHeading" as="h2">
              {clampCopy(ch.title, 80)}
            </LgType>
            <LgType role="body" as="p">
              {clampCopy(ch.body, 260)}
            </LgType>
          </div>
          {ch.product ? (
            <div className="lg-wa-object">
              <LgProduct
                product={ch.product}
                treatment="warm_inset"
                commerce={commerce}
                currency={currency}
                locale={locale}
                ratio="4 / 5"
              />
            </div>
          ) : null}
        </section>
      ))}

      {reviews[0] ? (
        <section className="lg-wa-trust">
          <LgType role="editorialHeading" as="p">
            “{clampCopy(reviews[0].comment || '', 160)}”
          </LgType>
          <LgType role="kicker" as="p">
            {reviews[0].customer_name}
          </LgType>
        </section>
      ) : null}

      <LgCta onClick={() => commerce.openCatalog()}>{copy.cta}</LgCta>
      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}
