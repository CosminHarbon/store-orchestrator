import { useMerchant } from '../../../../speedvendors';
import type { ContentSlots } from '../../../contentSlots';
import { isSafeMediaUrl } from '../../../contentSlots';
import { foundationContentDefaults } from '../defaults';
import { useReveal } from '../useReveal';
import { ArrowIcon } from './icons';
import HeroMedia from './HeroMedia';

export default function Hero({
  content,
  featuredProductIds,
  onNav,
  onOpenProduct,
}: {
  content: ContentSlots;
  featuredProductIds: string[];
  onNav: (id: string) => void;
  onOpenProduct: (id: string) => void;
}) {
  const { data: merchant } = useMerchant();
  const hero = content.hero;
  const d = foundationContentDefaults;
  const eyebrow = hero.eyebrow ?? d.hero.eyebrow;
  const headline = hero.headline ?? d.hero.headline ?? '';
  const accent = hero.headlineAccent ?? d.hero.headlineAccent ?? '';
  const len = (headline + accent).length;
  const titleClass =
    len > 80 ? ' is-xlong' : len > 46 ? ' is-long' : '';
  const tagline =
    merchant?.tagline || content.merchantTaglineFallback || d.merchantTaglineFallback || '';
  const supporting =
    hero.supportingCopy ||
    (merchant ? (tagline ? `${merchant.name} — ${tagline}` : merchant.name) : tagline);
  const stats = content.heroStats || d.heroStats || [];
  const bg = hero.backgroundImage;
  const reveal = useReveal<HTMLDivElement>();

  return (
    <section className="fd-hero" id="top">
      {bg && isSafeMediaUrl(bg.src) ? (
        <div className="fd-hero__bg" aria-hidden="true">
          <img className="fd-hero__bgimg" src={bg.src} alt="" />
        </div>
      ) : null}
      <div className="fd-wrap fd-hero__in" ref={reveal}>
        <div className="fd-hero__copy">
          {eyebrow ? <p className="fd-eyebrow fd-reveal is-in">{eyebrow}</p> : null}
          <h1 className={`fd-hero__title fd-reveal is-in${titleClass}`}>
            <span>{headline}</span>{' '}
            {accent ? <em className="fd-hero__accent">{accent}</em> : null}
          </h1>
          {supporting ? <p className="fd-lead fd-hero__lead fd-reveal is-in">{supporting}</p> : null}
          <div className="fd-hero__cta fd-reveal is-in">
            <button type="button" className="fd-btn" onClick={() => onNav('shop')}>
              <span>{hero.primaryCtaLabel || d.hero.primaryCtaLabel}</span>
              <ArrowIcon className="fd-btn__arrow" />
            </button>
            <button type="button" className="fd-btn fd-btn--ghost" onClick={() => onNav('why')}>
              {hero.secondaryCtaLabel || d.hero.secondaryCtaLabel}
            </button>
          </div>
          {stats.length > 0 ? (
            <ul className="fd-stats fd-reveal is-in">
              {stats.map((s) => (
                <li key={`${s.title}-${s.subtitle}`}>
                  <strong>{s.title}</strong>
                  <span>{s.subtitle}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="fd-hero__stage fd-reveal is-in">
          <div className="fd-hero__frame" aria-hidden="true" />
          <HeroMedia hero={hero} featuredProductIds={featuredProductIds} onOpenProduct={onOpenProduct} />
        </div>
      </div>
    </section>
  );
}
