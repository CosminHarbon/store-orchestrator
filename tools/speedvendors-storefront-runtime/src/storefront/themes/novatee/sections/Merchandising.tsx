// EDITABLE: merchandising wrappers that USE protected FeaturedProducts / ProductGrid.
import { useMemo } from 'react';
import { FeaturedProducts, ProductGrid, useCategories, useProducts } from '../../../../speedvendors';
import type { ContentSlots } from '../../../contentSlots';
import { novateeContentDefaults } from '../defaults';
import { novateeSystemUi } from '../systemUi';

export interface MerchandisingSectionProps {
  categoryId?: string;
  onCategoryChange?: (categoryId: string | undefined) => void;
  featuredIds?: string[];
  onOpenProduct: (productId: string) => void;
  showFilters?: boolean;
  content: ContentSlots;
  /** Shop is commerce-critical and defaults to always shown. */
  showShop?: boolean;
  showFeatured?: boolean;
}

export default function MerchandisingSection({
  categoryId,
  onCategoryChange,
  featuredIds = [],
  onOpenProduct,
  showFilters = true,
  content,
  showShop = true,
  showFeatured = true,
}: MerchandisingSectionProps) {
  const { data: categories } = useCategories();
  const { data: products } = useProducts({});
  const defaults = novateeContentDefaults;

  const liveFeaturedIds = useMemo(() => {
    if (featuredIds.length > 0) return featuredIds;
    const withImage = (products || []).filter((p) => p.images?.[0]?.url);
    if (withImage.length) return [withImage[0].id];
    return (products || []).slice(0, 1).map((p) => p.id);
  }, [featuredIds, products]);

  const featuredProduct = useMemo(() => {
    if (!liveFeaturedIds.length || !products?.length) return null;
    return products.find((p) => p.id === liveFeaturedIds[0]) || null;
  }, [liveFeaturedIds, products]);

  const resultLabel = products
    ? `${products.length} product${products.length === 1 ? '' : 's'}`
    : '';

  return (
    <>
      {showShop && (
        <section className="sf-section" id="shop">
          <div className="sf-section__head">
            <div>
              <p className="sf-eyebrow">
                <span className="sf-dot" /> {content.shopEyebrow || defaults.shopEyebrow}
              </p>
              <h2>{content.shopTitle || defaults.shopTitle}</h2>
            </div>
            {resultLabel && (
              <p className="sf-muted" aria-live="polite">
                {resultLabel}
              </p>
            )}
          </div>

          {showFilters && onCategoryChange && (
            <div className="sf-toolbar">
              <div className="sf-filters" role="tablist" aria-label={novateeSystemUi.categories}>
                <button
                  type="button"
                  className={!categoryId ? 'is-active' : ''}
                  onClick={() => onCategoryChange(undefined)}
                >
                  {novateeSystemUi.allCategories}
                </button>
                {categories?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={categoryId === c.id ? 'is-active' : ''}
                    onClick={() => onCategoryChange(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ProductGrid query={{ categoryId }} onOpenProduct={onOpenProduct} />
        </section>
      )}

      {showFeatured && liveFeaturedIds.length > 0 && (
        <section className="sf-section sf-section--tight" id="featured">
          <div className="sf-feature">
            <div>
              <p className="sf-eyebrow">
                <span className="sf-dot" /> {content.featuredEyebrow || defaults.featuredEyebrow}
              </p>
              <h2>
                {featuredProduct?.title ||
                  content.featuredFallbackTitle ||
                  defaults.featuredFallbackTitle}
              </h2>
              <p className="sf-lead" style={{ marginTop: 0 }}>
                {featuredProduct?.description ||
                  content.featuredFallbackBody ||
                  defaults.featuredFallbackBody}
              </p>
            </div>
            <FeaturedProducts ids={liveFeaturedIds} onOpenProduct={onOpenProduct} />
          </div>
        </section>
      )}
    </>
  );
}
