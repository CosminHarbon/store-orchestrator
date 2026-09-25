// EDITABLE: hero section — content slots + live merchant branding + media modes.
import type { Merchant } from '../../../../speedvendors';
import type { ContentSlots } from '../../../contentSlots';
import { novateeContentDefaults } from '../defaults';
import { novateeSystemUi } from '../systemUi';
import HeroMedia, { HeroBackground } from './HeroMedia';

export interface HeroSectionProps {
  merchant: Merchant | null;
  content: ContentSlots;
  featuredProductIds?: string[];
  onCta?: () => void;
  onSecondary?: () => void;
}

export default function HeroSection({
  merchant,
  content,
  featuredProductIds,
  onCta,
  onSecondary,
}: HeroSectionProps) {
  const hero = content.hero;
  const defaults = novateeContentDefaults;
  const name = merchant?.name?.trim() || novateeSystemUi.storeFallback;
  const tagline =
    merchant?.tagline?.trim() ||
    content.merchantTaglineFallback ||
    defaults.merchantTaglineFallback ||
    '';

  const eyebrow = hero.eyebrow || defaults.hero.eyebrow || '';
  const headline = hero.headline || defaults.hero.headline || '';
  const accent = hero.headlineAccent || defaults.hero.headlineAccent || '';
  const supporting = hero.supportingCopy;
  const primary = hero.primaryCtaLabel || defaults.hero.primaryCtaLabel || '';
  const secondary = hero.secondaryCtaLabel || defaults.hero.secondaryCtaLabel || '';
  const stats = content.heroStats || defaults.heroStats || [];

  return (
    <section className="sf-hero" id="top">
      <div className="sf-hero__bg" aria-hidden="true">
        <HeroBackground media={hero.backgroundImage} />
        <span className="sf-orb sf-orb--1" />
        <span className="sf-orb sf-orb--2" />
        <span className="sf-orb sf-orb--3" />
        <span className="sf-grain" />
      </div>
      <div className="sf-hero__in">
        <div className="sf-hero__copy">
          <p className="sf-eyebrow sf-reveal">
            <span className="sf-dot" /> {eyebrow}
          </p>
          <h1 className="sf-reveal">
            {headline}
            {accent ? (
              <>
                <br />
                <span className="sf-grad">{accent}</span>
              </>
            ) : null}
          </h1>
          <p className="sf-lead sf-reveal">
            {supporting ? (
              supporting
            ) : (
              <>
                <strong style={{ color: 'var(--sf-fg)', fontWeight: 600 }}>{name}</strong>
                {tagline ? (
                  <>
                    {' — '}
                    {tagline}
                  </>
                ) : null}
              </>
            )}
          </p>
          <div className="sf-hero__cta sf-reveal">
            {onCta && (
              <button type="button" className="sf-btn" onClick={onCta}>
                {primary}
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            )}
            {onSecondary && (
              <button type="button" className="sf-btn sf-btn--ghost" onClick={onSecondary}>
                {secondary}
              </button>
            )}
          </div>
          {stats.length > 0 && (
            <ul className="sf-stats sf-reveal">
              {stats.map((stat) => (
                <li key={stat.title}>
                  <strong>{stat.title}</strong>
                  <span>{stat.subtitle}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <HeroMedia hero={hero} featuredProductIds={featuredProductIds} />
      </div>
    </section>
  );
}
