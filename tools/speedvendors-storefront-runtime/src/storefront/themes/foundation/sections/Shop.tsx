import { ProductGrid, useCategories, useProducts } from '../../../../speedvendors';
import type { ContentSlots } from '../../../contentSlots';
import { foundationContentDefaults, foundationThemeOptions } from '../defaults';
import { foundationSystemUi } from '../systemUi';
import { EmptyState, ProductSkeleton } from './States';

export default function Shop({
  content,
  categoryId,
  onCategoryChange,
  onOpenProduct,
}: {
  content: ContentSlots;
  categoryId?: string;
  onCategoryChange: (id: string | undefined) => void;
  onOpenProduct: (id: string) => void;
}) {
  const d = foundationContentDefaults;
  const { data: categories } = useCategories();
  const { data: products, loading } = useProducts({ categoryId });
  const all = useProducts({});
  const count = products?.length ?? 0;
  const total = all.data?.length ?? 0;
  const emptyStore = !loading && total === 0;
  const emptyCategory = !loading && !!categoryId && count === 0 && total > 0;

  const countLabel =
    count === 1
      ? foundationSystemUi.productCountOne.replace('{n}', '1')
      : foundationSystemUi.productCountOther.replace('{n}', String(count));

  return (
    <section className="fd-section fd-shop" id="shop">
      <div className="fd-wrap">
        <header className="fd-head">
          <div>
            {content.shopEyebrow || d.shopEyebrow ? (
              <p className="fd-eyebrow">{content.shopEyebrow || d.shopEyebrow}</p>
            ) : null}
            <h2 className="fd-h2">{content.shopTitle || d.shopTitle}</h2>
          </div>
          {!emptyStore ? (
            <p className="fd-head__aside" aria-live="polite">
              {countLabel}
            </p>
          ) : null}
        </header>

        {foundationThemeOptions.showCategoryFilters && (categories || []).length > 0 && !emptyStore ? (
          <div className="fd-filters" role="tablist" aria-label={foundationSystemUi.categories}>
            <button
              type="button"
              role="tab"
              aria-selected={!categoryId}
              className={!categoryId ? 'is-active' : ''}
              onClick={() => onCategoryChange(undefined)}
            >
              {foundationSystemUi.allCategories}
            </button>
            {(categories || []).map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={categoryId === c.id}
                className={categoryId === c.id ? 'is-active' : ''}
                onClick={() => onCategoryChange(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="fd-shop__grid">
          {emptyStore ? (
            <EmptyState
              title={foundationSystemUi.emptyShopTitle}
              body={foundationSystemUi.emptyShopBody}
            />
          ) : emptyCategory ? (
            <EmptyState
              title={foundationSystemUi.emptyCategoryTitle}
              body={foundationSystemUi.emptyCategoryBody}
              actionLabel={foundationSystemUi.showAll}
              onAction={() => onCategoryChange(undefined)}
            />
          ) : (
            <ProductGrid
              query={{ categoryId }}
              onOpenProduct={onOpenProduct}
              loadingLabel={foundationSystemUi.loadingProducts}
              loadingFallback={<ProductSkeleton count={8} />}
            />
          )}
        </div>
      </div>
    </section>
  );
}
