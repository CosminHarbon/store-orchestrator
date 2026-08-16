import { useMemo, useState, type ReactNode } from 'react';
import { Grid3X3, List, Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { productReviewStats } from '@/lib/storefront/api';
import { ProductCard } from './ProductCard';

interface Props {
  commerce: StorefrontCommerce;
}

type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'name';

export function PremiumCatalog({ commerce }: Props) {
  const { t } = useTranslation('storefront');
  const {
    products,
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
    openProduct,
    addToCart,
    reviews,
    customization,
  } = commerce;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortKey>('featured');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pageSize = 12;

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (selectedCollectionId) {
      list = list.filter((p) => p.collection_ids.includes(selectedCollectionId));
    }
    if (category !== 'all') {
      list = list.filter((p) => p.category === category);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      );
    }
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    if (min != null && Number.isFinite(min)) list = list.filter((p) => p.price >= min);
    if (max != null && Number.isFinite(max)) list = list.filter((p) => p.price <= max);

    list.sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'name':
          return a.title.localeCompare(b.title);
        case 'newest':
          return (
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );
        default:
          return 0;
      }
    });
    return list;
  }, [products, selectedCollectionId, category, search, priceMin, priceMax, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const rows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const activeCollection = collections.find((c) => c.id === selectedCollectionId);

  return (
    <div className="prem-container py-8 md:py-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--prem-muted)] mb-2">Shop</p>
          <h1 className="text-4xl md:text-5xl prem-display">
            {activeCollection?.name || 'All products'}
          </h1>
          <p className="text-sm text-[var(--prem-muted)] mt-2">{filtered.length} products</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`p-2 rounded-full border ${layout === 'grid' ? 'bg-[var(--prem-ink)] text-white' : 'border-[var(--prem-line)]'}`}
            onClick={() => setLayout('grid')}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`p-2 rounded-full border ${layout === 'list' ? 'bg-[var(--prem-ink)] text-white' : 'border-[var(--prem-line)]'}`}
            onClick={() => setLayout('list')}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="prem-btn prem-btn-ghost !py-2 md:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-8">
        <aside
          className={`space-y-5 ${filtersOpen ? 'block' : 'hidden'} lg:block bg-[var(--prem-surface)] lg:bg-transparent rounded-[var(--prem-radius)] border lg:border-0 border-[var(--prem-line)] p-4 lg:p-0`}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--prem-muted)]" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search…"
              className="w-full rounded-full border border-[var(--prem-line)] bg-white pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          <FilterGroup title={t('catalog.collections')}>
            <Chip
              active={!selectedCollectionId}
              onClick={() => {
                setSelectedCollectionId(null);
                setPage(1);
              }}
              label="All"
            />
            {collections.map((c) => (
              <Chip
                key={c.id}
                active={selectedCollectionId === c.id}
                onClick={() => {
                  setSelectedCollectionId(c.id);
                  setPage(1);
                }}
                label={c.name}
              />
            ))}
          </FilterGroup>

          {categories.length > 0 && (
            <FilterGroup title={t('catalog.category')}>
              <select
                className="w-full rounded-[var(--prem-radius-sm)] border border-[var(--prem-line)] bg-white px-3 py-2 text-sm"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterGroup>
          )}

          <FilterGroup title={t('catalog.price')}>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => {
                  setPriceMin(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-[var(--prem-radius-sm)] border border-[var(--prem-line)] px-2 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => {
                  setPriceMax(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-[var(--prem-radius-sm)] border border-[var(--prem-line)] px-2 py-2 text-sm"
              />
            </div>
          </FilterGroup>

          <FilterGroup title={t('catalog.sort')}>
            <select
              className="w-full rounded-[var(--prem-radius-sm)] border border-[var(--prem-line)] bg-white px-3 py-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </FilterGroup>
        </aside>

        <div>
          {!rows.length ? (
            <div className="text-center py-20 text-[var(--prem-muted)]">No products match your filters.</div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
              {rows.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onOpen={openProduct}
                  onAdd={addToCart}
                  ratingAvg={productReviewStats(reviews, p.id).avg}
                  ratingCount={productReviewStats(reviews, p.id).count}
                  showReviews={customization.show_reviews !== false}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((p) => (
                <div
                  key={p.id}
                  className="flex gap-4 bg-[var(--prem-surface)] border border-[var(--prem-line)] rounded-[var(--prem-radius)] p-3"
                >
                  <button
                    type="button"
                    className="h-28 w-24 rounded-md overflow-hidden bg-[var(--prem-image-bg)] shrink-0"
                    onClick={() => openProduct(p)}
                  >
                    {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </button>
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                    <div>
                      <button type="button" className="text-left font-medium" onClick={() => openProduct(p)}>
                        {p.title}
                      </button>
                      <p className="text-sm text-[var(--prem-muted)] line-clamp-2 mt-1">{p.description}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="font-semibold tabular-nums text-sm">
                        {p.price.toFixed(2)} RON
                      </span>
                      <button
                        type="button"
                        className="prem-btn prem-btn-ghost !py-1.5 !text-xs"
                        disabled={p.stock <= 0}
                        onClick={() => addToCart(p)}
                      >
                        Quick add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              <button
                type="button"
                className="prem-btn prem-btn-ghost !py-2"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-sm self-center text-[var(--prem-muted)]">
                {pageSafe} / {totalPages}
              </span>
              <button
                type="button"
                className="prem-btn prem-btn-ghost !py-2"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-[0.16em] text-[var(--prem-muted)] mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full text-left text-sm rounded-full px-3 py-1.5 border ${
        active
          ? 'bg-[var(--prem-ink)] text-white border-transparent'
          : 'border-[var(--prem-line)] hover:bg-black/5'
      }`}
    >
      {label}
    </button>
  );
}
