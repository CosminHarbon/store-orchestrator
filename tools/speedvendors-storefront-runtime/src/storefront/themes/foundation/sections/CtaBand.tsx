import { useState } from 'react';
import type { ContentSlots } from '../../../contentSlots';
import { isSafeMediaUrl } from '../../../contentSlots';
import { foundationContentDefaults } from '../defaults';
import { ArrowIcon } from './icons';

export default function CtaBand({
  content,
  onNav,
}: {
  content: ContentSlots;
  onNav: (id: string) => void;
}) {
  const d = foundationContentDefaults;
  const title = content.ctaTitle || d.ctaTitle;
  if (!title) return null;
  const bg = content.ctaBackgroundImage;
  const [bgFailed, setBgFailed] = useState(false);
  const showBg = bg && !bgFailed && isSafeMediaUrl(bg.src);

  return (
    <section className="fd-section fd-cta" id="cta">
      <div className="fd-wrap">
        <div className={`fd-cta__panel fd-reveal is-in${showBg ? ' has-photo' : ''}`}>
          {showBg ? (
            <img
              className="fd-cta__bg"
              src={bg!.src}
              alt={bg!.alt || ''}
              aria-hidden={bg!.alt ? undefined : true}
              onError={() => setBgFailed(true)}
            />
          ) : null}
          <svg
            className="fd-cta__deco"
            viewBox="0 0 400 400"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="200" cy="200" r="198" />
            <circle cx="200" cy="200" r="150" />
            <circle cx="200" cy="200" r="102" />
            <circle cx="200" cy="200" r="54" />
            <path d="M0 200h400M200 0v400" strokeDasharray="2 8" />
          </svg>
          <div>
            {content.ctaEyebrow || d.ctaEyebrow ? (
              <p className="fd-eyebrow">{content.ctaEyebrow || d.ctaEyebrow}</p>
            ) : null}
            <h2 className="fd-h2">{title}</h2>
            {content.ctaBody || d.ctaBody ? <p>{content.ctaBody || d.ctaBody}</p> : null}
          </div>
          {content.ctaLabel || d.ctaLabel ? (
            <button type="button" className="fd-btn fd-btn--light" onClick={() => onNav('shop')}>
              <span>{content.ctaLabel || d.ctaLabel}</span>
              <ArrowIcon className="fd-btn__arrow" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
