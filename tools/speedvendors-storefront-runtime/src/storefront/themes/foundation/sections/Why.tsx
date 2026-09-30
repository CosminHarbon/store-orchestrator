import type { ContentSlots } from '../../../contentSlots';
import { foundationContentDefaults } from '../defaults';
import { WhyIcon } from './icons';

export default function Why({ content }: { content: ContentSlots }) {
  const d = foundationContentDefaults;
  const cards = content.whyCards || d.whyCards || [];
  if (!cards.length) return null;

  return (
    <section className="fd-section fd-why" id="why">
      <div className="fd-wrap">
        <header className="fd-head fd-reveal is-in">
          <div>
            {content.whyEyebrow || d.whyEyebrow ? (
              <p className="fd-eyebrow">{content.whyEyebrow || d.whyEyebrow}</p>
            ) : null}
            <h2 className="fd-h2">{content.whyTitle || d.whyTitle}</h2>
          </div>
        </header>
        <ul className="fd-why__list">
          {cards.map((card, idx) => (
            <li key={`${card.title}-${idx}`} className="fd-why__card fd-reveal is-in">
              <span className="fd-why__num" aria-hidden="true">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="fd-why__icon">
                <WhyIcon icon={card.icon} />
              </span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
