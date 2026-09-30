import { useEffect, useState } from 'react';
import { FeaturedProducts, useCommerce } from '../../../../speedvendors';
import type { ContentSlots } from '../../../contentSlots';
import { foundationContentDefaults, foundationThemeOptions } from '../defaults';
import { foundationSystemUi } from '../systemUi';
import { ArrowIcon } from './icons';
import { ProductSkeleton } from './States';

export default function Featured({
  content,
  featuredIds,
  onOpenProduct,
}: {
  content: ContentSlots;
  featuredIds: string[];
  onOpenProduct: (id: string) => void;
}) {
  const commerce = useCommerce();
  const d = foundationContentDefaults;
  const ids = featuredIds.slice(0, foundationThemeOptions.maxFeatured);
  const [lead, setLead] = useState<{ title: string; description: string; id: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!ids[0]) {
      setLead(null);
      return;
    }
    void commerce.getProduct(ids[0]).then((p) => {
      if (cancelled || !p) return;
      setLead({ title: p.title, description: p.description, id: p.id });
    });
    return () => {
      cancelled = true;
    };
  }, [commerce, ids.join('|')]);

  if (!ids.length) return null;

  const title = lead?.title || content.featuredFallbackTitle || d.featuredFallbackTitle;
  const body = lead?.description || content.featuredFallbackBody || d.featuredFallbackBody;

  return (
    <section className="fd-section fd-featured" id="featured">
      <div className="fd-wrap fd-featured__in">
        <div className="fd-featured__copy fd-reveal is-in">
          {content.featuredEyebrow || d.featuredEyebrow ? (
            <p className="fd-eyebrow">{content.featuredEyebrow || d.featuredEyebrow}</p>
          ) : null}
          <h2 className="fd-h2">{title}</h2>
          {body ? <p className="fd-lead">{body}</p> : null}
          {lead ? (
            <button type="button" className="fd-textlink" onClick={() => onOpenProduct(lead.id)}>
              <span>{foundationSystemUi.viewProduct}</span>
              <ArrowIcon />
            </button>
          ) : null}
        </div>
        <div className={`fd-featured__cards fd-reveal is-in fd-featured__cards--${Math.min(ids.length, 3)}`}>
          <FeaturedProducts
            ids={ids}
            onOpenProduct={onOpenProduct}
            loadingLabel={foundationSystemUi.loadingProducts}
            loadingFallback={<ProductSkeleton count={2} />}
          />
        </div>
      </div>
    </section>
  );
}
