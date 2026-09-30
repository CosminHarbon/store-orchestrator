import { useState } from 'react';
import type { ContentSlots } from '../../../contentSlots';
import { isSafeMediaUrl } from '../../../contentSlots';
import { foundationContentDefaults } from '../defaults';
import { ArrowIcon } from './icons';
import { EditorialArt, EditorialStamp } from './HeroArt';

export default function Editorial({
  content,
  onNav,
}: {
  content: ContentSlots;
  onNav: (id: string) => void;
}) {
  const d = foundationContentDefaults;
  const title = content.editorialTitle || d.editorialTitle;
  if (!title) return null;
  const mode = content.editorialMediaMode || d.editorialMediaMode || 'template-art';
  const media = content.editorialMedia;
  const [failed, setFailed] = useState(false);
  const showMerchant =
    mode === 'image' && media && !failed && isSafeMediaUrl(media.src);
  const showArt = mode === 'template-art' || (mode === 'image' && !showMerchant);
  const hideMedia = mode === 'hidden';

  return (
    <section className="fd-section fd-editorial" id="story">
      <div className={`fd-wrap fd-editorial__in${hideMedia ? ' fd-editorial__in--text-only' : ''}`}>
        {!hideMedia ? (
          <figure className="fd-editorial__media fd-reveal is-in">
            {showMerchant ? (
              <img src={media!.src} alt={media!.alt || ''} onError={() => setFailed(true)} />
            ) : showArt ? (
              <EditorialArt />
            ) : null}
            <EditorialStamp />
          </figure>
        ) : null}
        <div className="fd-editorial__copy fd-reveal is-in">
          {content.editorialEyebrow || d.editorialEyebrow ? (
            <p className="fd-eyebrow">{content.editorialEyebrow || d.editorialEyebrow}</p>
          ) : null}
          <h2 className="fd-h2">{title}</h2>
          {content.editorialBody || d.editorialBody ? (
            <p className="fd-lead">{content.editorialBody || d.editorialBody}</p>
          ) : null}
          {content.editorialCtaLabel || d.editorialCtaLabel ? (
            <button type="button" className="fd-textlink" onClick={() => onNav('shop')}>
              <span>{content.editorialCtaLabel || d.editorialCtaLabel}</span>
              <ArrowIcon />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
