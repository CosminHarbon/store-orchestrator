import { useCategories } from '../../../../speedvendors';
import type { ContentSlots } from '../../../contentSlots';
import { foundationContentDefaults, foundationThemeOptions } from '../defaults';
import { useReveal } from '../useReveal';
import { ArrowIcon } from './icons';

export default function Collections({
  content,
  onSelectCategory,
}: {
  content: ContentSlots;
  onSelectCategory: (categoryId: string) => void;
}) {
  const { data: categories } = useCategories();
  const reveal = useReveal<HTMLUListElement>();
  const list = (categories || []).slice(0, foundationThemeOptions.maxCollections);
  if (!list.length) return null;
  const d = foundationContentDefaults;

  return (
    <section className="fd-section fd-collections" id="collections">
      <div className="fd-wrap">
        <header className="fd-head fd-reveal is-in">
          <div>
            {content.collectionsEyebrow || d.collectionsEyebrow ? (
              <p className="fd-eyebrow">{content.collectionsEyebrow || d.collectionsEyebrow}</p>
            ) : null}
            <h2 className="fd-h2">{content.collectionsTitle || d.collectionsTitle}</h2>
          </div>
        </header>
        <ul className="fd-collections__list fd-reveal is-in" ref={reveal}>
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className="fd-coll" onClick={() => onSelectCategory(c.id)}>
                <span className="fd-coll__media">
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="fd-coll__fallback" aria-hidden="true">
                      {(c.name || '?').slice(0, 1)}
                    </span>
                  )}
                </span>
                <span className="fd-coll__label">
                  {c.name}
                  <ArrowIcon />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
