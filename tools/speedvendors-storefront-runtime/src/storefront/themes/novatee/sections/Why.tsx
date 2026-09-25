// EDITABLE “why us” promotional cards.
import type { ReactNode } from 'react';
import type { ContentSlots, WhyCardSlot } from '../../../contentSlots';
import { novateeContentDefaults } from '../defaults';

const ICONS: Record<WhyCardSlot['icon'], ReactNode> = {
  star: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l2.5 5.5L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.5-.8z" />
    </svg>
  ),
  art: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20 20 4M14 4h6v6M4 10V4h6M20 14v6h-6M10 20H4v-6" />
    </svg>
  ),
  secure: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="6" width="20" height="13" rx="3" />
      <path d="M2 11h20M6 15h4" />
    </svg>
  ),
  ship: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </svg>
  ),
};

export interface WhySectionProps {
  content: ContentSlots;
}

export default function WhySection({ content }: WhySectionProps) {
  const cards = content.whyCards || novateeContentDefaults.whyCards || [];
  if (!cards.length) return null;
  const eyebrow = content.whyEyebrow || novateeContentDefaults.whyEyebrow || '';
  const title = content.whyTitle || novateeContentDefaults.whyTitle || '';
  return (
    <section className="sf-section" id="why">
      <div className="sf-section__head">
        <div>
          <p className="sf-eyebrow">
            <span className="sf-dot" /> {eyebrow}
          </p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="sf-why-cards">
        {cards.map((card) => (
          <article key={card.title} className="sf-why-card">
            <div className="sf-why-ico">{ICONS[card.icon]}</div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
