// EDITABLE: hero section wrapper. Compose branding only — no commerce reimplementation.
import type { Merchant } from '../../speedvendors';

export interface HeroSectionProps {
  merchant: Merchant | null;
  ctaLabel?: string;
  onCta?: () => void;
}

export default function HeroSection({ merchant, ctaLabel = 'Shop', onCta }: HeroSectionProps) {
  return (
    <section className="sf-hero">
      <h1>{merchant?.name ?? ''}</h1>
      <p>{merchant?.tagline ?? ''}</p>
      {onCta && (
        <p>
          <button type="button" className="sf-btn" style={{ width: 'auto', marginTop: '1.25rem' }} onClick={onCta}>
            {ctaLabel}
          </button>
        </p>
      )}
    </section>
  );
}
