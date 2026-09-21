// EDITABLE: merchandising wrappers that USE protected FeaturedProducts / ProductGrid.
import { FeaturedProducts, ProductGrid, useCategories } from '../../speedvendors';

export interface MerchandisingSectionProps {
  categoryId?: string;
  onCategoryChange?: (categoryId: string | undefined) => void;
  featuredIds?: string[];
  onOpenProduct: (productId: string) => void;
  showFilters?: boolean;
}

export default function MerchandisingSection({
  categoryId,
  onCategoryChange,
  featuredIds = [],
  onOpenProduct,
  showFilters = true,
}: MerchandisingSectionProps) {
  const { data: categories } = useCategories();

  return (
    <section className="sf-section" id="shop">
      {featuredIds.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2>Featured</h2>
          <FeaturedProducts ids={featuredIds} onOpenProduct={onOpenProduct} />
        </div>
      )}
      {showFilters && onCategoryChange && (
        <div className="sf-filters" role="tablist" aria-label="Categories">
          <button
            type="button"
            className={!categoryId ? 'is-active' : ''}
            onClick={() => onCategoryChange(undefined)}
          >
            All
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
      )}
      <ProductGrid query={{ categoryId }} onOpenProduct={onOpenProduct} />
    </section>
  );
}
