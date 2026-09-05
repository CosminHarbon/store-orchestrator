import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { LayoutPlan } from '@/lib/ai-studio/v2/layoutGrammar/types';
import type { SemanticPage } from '@/lib/ai-studio/v2/layoutGrammar/extractContent';
import { clampCopy, displayLines } from '@/lib/ai-studio/v2/layoutGrammar/extractContent';
import { LgCta, LgFooter, LgMedia, LgNav, LgProduct, LgType, currencyOf } from './primitives';

type PageProps = {
  plan: LayoutPlan;
  page: SemanticPage;
  commerce: StorefrontCommerce;
};

export function EditorialAsymmetricPage({ plan, page, commerce }: PageProps) {
  const { copy, products, reviews, featured } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const [lead, ...rest] = products;
  const storyImg = copy.storyImage || products[1]?.image || copy.heroImage;

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} />
      <section className="lg-ed-hero" data-hero={v.heroGeometry} data-side={v.mediaSide} data-ratio={v.gridRatio}>
        <div className="lg-ed-hero-copy">
          <LgType role="kicker" as="p">
            {copy.kicker}
          </LgType>
          <LgType role="display" as="h1">
            {clampCopy(copy.title, 72)}
          </LgType>
          <LgType role="body" as="p">
            {clampCopy(copy.subtitle, 180)}
          </LgType>
          <LgCta onClick={() => commerce.openCatalog()}>{copy.cta}</LgCta>
        </div>
        <div className="lg-ed-hero-media">
          <LgMedia src={copy.heroImage} alt="" ratio={v.heroGeometry === 'type_first_crop' ? '5 / 6' : '4 / 5'} crop={v.crop} />
        </div>
      </section>

      {copy.statement ? (
        <section className="lg-ed-pause">
          <LgType role="editorialHeading" as="h2">
            {clampCopy(copy.statement, 120)}
          </LgType>
        </section>
      ) : null}

      {lead ? (
        <section className="lg-ed-feature" data-side={v.mediaSide}>
          <div className="lg-ed-feature-media">
            <LgProduct
              product={lead}
              treatment="featured_oversized"
              commerce={commerce}
              currency={currency}
              locale={locale}
              featured
              ratio="3 / 4"
            />
          </div>
          <div className="lg-ed-feature-copy">
            <LgType role="kicker" as="p">
              Piece 01
            </LgType>
            <LgType role="sectionHeading" as="h2">
              {lead.title}
            </LgType>
            <LgType role="body" as="p">
              {clampCopy(lead.description || copy.storyBody, 200)}
            </LgType>
            <p className="lg-type lg-type-price">{new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(lead.price)}</p>
            <LgCta onClick={() => commerce.openProduct(lead)}>View the piece</LgCta>
          </div>
        </section>
      ) : null}

      <section className="lg-ed-story" data-group={v.grouping}>
        <div className="lg-ed-story-copy">
          <LgType role="kicker" as="p">
            Notes
          </LgType>
          <LgType role="sectionHeading" as="h2">
            {copy.storyTitle}
          </LgType>
          <LgType role="body" as="p">
            {clampCopy(copy.storyBody, 280)}
          </LgType>
        </div>
        <div className="lg-ed-cluster">
          <LgMedia src={storyImg} alt={copy.storyTitle} ratio="4 / 5" crop={v.crop} />
          {products[2]?.image ? <LgMedia src={products[2].image} alt="" ratio="1 / 1" crop="left" /> : null}
        </div>
      </section>

      <section className="lg-ed-merch">
        <div className="lg-ed-merch-head">
          <LgType role="sectionHeading" as="h2">
            {copy.merchTitle}
          </LgType>
          <LgCta onClick={() => commerce.openCatalog()}>View all</LgCta>
        </div>
        <div className="lg-ed-stagger">
          {(v.productEmphasis === 'single' ? rest.slice(0, 3) : rest.slice(0, 4)).map((p, i) => (
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
          <LgType role="supporting" as="p">
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
  const { copy, products, featured } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const overlay = v.mobileHero === 'overlay' || plan.viewport !== 'mobile';

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} tone="light" />
      <section className="lg-cin-hero" data-hero={v.heroGeometry} data-overlay={overlay ? '1' : '0'}>
        <LgMedia src={copy.heroImage} alt="" ratio={v.heroGeometry === 'cinematic_letterbox' ? '21 / 9' : '16 / 10'} crop={v.crop} />
        <div className="lg-cin-veil" />
        <div className="lg-cin-copy">
          <LgType role="kicker" as="p">
            {copy.kicker}
          </LgType>
          <LgType role="display" as="h1">
            {clampCopy(copy.title, 64)}
          </LgType>
          <LgType role="supporting" as="p">
            {clampCopy(copy.subtitle, 140)}
          </LgType>
          <LgCta variant="ghost" onClick={() => commerce.openCatalog()}>
            {copy.cta}
          </LgCta>
        </div>
      </section>

      {featured ? (
        <section className="lg-cin-still">
          <LgMedia src={featured.image} alt={featured.title} ratio="16 / 9" crop="center" />
          <div className="lg-cin-still-cap">
            <LgType role="kicker" as="p">
              Opening still
            </LgType>
            <LgType role="editorialHeading" as="h2">
              {featured.title}
            </LgType>
            <LgCta variant="ghost" onClick={() => commerce.openProduct(featured)}>
              View
            </LgCta>
          </div>
        </section>
      ) : null}

      <section className="lg-cin-story">
        <LgMedia src={copy.storyImage || copy.heroImage} alt={copy.storyTitle} ratio="16 / 9" crop={v.crop} />
        <div className="lg-cin-caption">
          <LgType role="sectionHeading" as="h2">
            {copy.storyTitle}
          </LgType>
          <LgType role="body" as="p">
            {clampCopy(copy.storyBody, 220)}
          </LgType>
        </div>
      </section>

      <section className="lg-cin-strip">
        <LgType role="kicker" as="p">
          Next frames
        </LgType>
        <div className="lg-cin-rail" role="list">
          {products.slice(0, 6).map((p) => (
            <div key={p.id} role="listitem">
              <LgProduct
                product={p}
                treatment="film_still"
                commerce={commerce}
                currency={currency}
                locale={locale}
                ratio="16 / 10"
              />
            </div>
          ))}
        </div>
      </section>

      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}

export function ProductMonumentPage({ plan, page, commerce }: PageProps) {
  const { copy, products, featured } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const hero = featured || products[0];
  if (!hero) return <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} />;
  const specs = [
    hero.description,
    copy.storyBody,
    copy.statement,
  ].filter(Boolean) as string[];

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} />
      <section className="lg-mon-hero" data-hero={v.heroGeometry} data-side={v.mediaSide}>
        <div className="lg-mon-figure">
          <LgMedia src={hero.image} alt={hero.title} ratio="4 / 5" crop={v.crop} />
        </div>
        <div className="lg-mon-copy">
          <LgType role="kicker" as="p">
            {copy.kicker}
          </LgType>
          <LgType role="display" as="h1">
            {hero.title}
          </LgType>
          <p className="lg-type lg-type-price">{new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(hero.price)}</p>
          <LgType role="body" as="p">
            {clampCopy(hero.description || copy.subtitle, 160)}
          </LgType>
          <div className="lg-mon-actions">
            <LgCta variant="solid" onClick={() => commerce.openProduct(hero)}>
              View details
            </LgCta>
            <LgCta onClick={() => commerce.addToCart(hero)}>Add to cart</LgCta>
          </div>
        </div>
      </section>

      <section className="lg-mon-specs">
        {specs.slice(0, 3).map((s, i) => (
          <article key={i} className="lg-mon-spec">
            <LgType role="kicker" as="p">
              0{i + 1}
            </LgType>
            <LgType role="sectionHeading" as="h2">
              {i === 0 ? 'Form' : i === 1 ? 'Make' : 'Use'}
            </LgType>
            <LgType role="body" as="p">
              {clampCopy(s, 180)}
            </LgType>
          </article>
        ))}
      </section>

      <section className="lg-mon-support">
        <LgType role="sectionHeading" as="h2">
          After the piece
        </LgType>
        <div className="lg-mon-rail">
          {products.slice(1, 5).map((p) => (
            <LgProduct
              key={p.id}
              product={p}
              treatment="horizontal_story"
              commerce={commerce}
              currency={currency}
              locale={locale}
              ratio="1 / 1"
            />
          ))}
        </div>
      </section>

      <LgFooter name={copy.storeName} blurb={copy.footerBlurb} commerce={commerce} />
    </>
  );
}

export function TypographicCampaignPage({ plan, page, commerce }: PageProps) {
  const { copy, products } = page;
  const { currency, locale } = currencyOf(commerce);
  const v = plan.variation;
  const lines = displayLines(copy.title, 3);

  return (
    <>
      <LgNav name={copy.storeName} commerce={commerce} variant={v.nav} tone="light" />
      <section className="lg-ty-hero" data-hero={v.heroGeometry} data-side={v.mediaSide}>
        <div className="lg-ty-display">
          {lines.map((ln) => (
            <LgType key={ln} role="display" as="h1">
              {ln}
            </LgType>
          ))}
        </div>
        <div className="lg-ty-media">
          <LgMedia src={copy.heroImage} alt="" ratio="3 / 4" crop={v.crop} />
        </div>
        <LgType role="body" as="p" className="lg-ty-sub">
          {clampCopy(copy.subtitle, 120)}
        </LgType>
        <LgCta variant="solid" onClick={() => commerce.openCatalog()}>
          {copy.cta}
        </LgCta>
      </section>

      <div className="lg-ty-marquee" aria-hidden={false}>
        <p>
          {products
            .map((p) => p.title)
            .concat(products.map((p) => p.title))
            .join('  —  ')}
        </p>
      </div>

      <section className="lg-ty-posters">
        {products.slice(0, 3).map((p, i) => (
          <article key={p.id} className="lg-ty-poster" data-i={i}>
            <LgType role="editorialHeading" as="h2">
              {p.title}
            </LgType>
            <LgMedia src={p.image} alt={p.title} ratio={i === 0 ? '4 / 5' : '1 / 1'} crop={v.crop} />
            <div className="lg-ty-poster-meta">
              <span className="lg-type lg-type-price">
                {new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(p.price)}
              </span>
              <LgCta variant="solid" onClick={() => commerce.openProduct(p)}>
                Shop
              </LgCta>
              <LgCta onClick={() => commerce.addToCart(p)}>Add</LgCta>
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

      {copy.storyTitle ? (
        <section className="lg-cat-interrupt">
          <LgType role="kicker" as="p">
            {copy.kicker}
          </LgType>
          <LgType role="editorialHeading" as="h2">
            {copy.storyTitle}
          </LgType>
          <LgType role="body" as="p">
            {clampCopy(copy.storyBody, 180)}
          </LgType>
        </section>
      ) : null}

      <section className="lg-cat-dense">
        {products.slice(0, 8).map((p) => (
          <LgProduct
            key={`dense-${p.id}`}
            product={p}
            treatment="dense_catalog"
            commerce={commerce}
            currency={currency}
            locale={locale}
            ratio="4 / 5"
          />
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
