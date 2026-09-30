// PROTECTED: product listing via commerce.listProducts. Cursor may not edit this file.
import type { ReactNode } from 'react';
import { useProducts } from '../hooks';
import type { ProductQuery } from '../types';
import ProductCard from './ProductCard';
import CommerceLoading from './CommerceLoading';

export interface ProductGridProps {
  query?: ProductQuery;
  onOpenProduct: (productId: string) => void;
  /**
   * Optional theme-owned visual skeleton. When provided, the default text label is
   * visually hidden but kept for assistive technology (role=status).
   */
  loadingFallback?: ReactNode;
  loadingLabel?: string;
}

export default function ProductGrid({
  query,
  onOpenProduct,
  loadingFallback,
  loadingLabel = 'Loading products',
}: ProductGridProps) {
  const { data: products, loading } = useProducts(query);

  if (loading && !products) {
    return (
      <CommerceLoading label={loadingLabel} visuallyHidden={Boolean(loadingFallback)}>
        {loadingFallback}
      </CommerceLoading>
    );
  }

  return (
    <div className="sf-grid">
      {products?.map((p) => (
        <ProductCard key={p.id} product={p} onOpen={onOpenProduct} />
      ))}
    </div>
  );
}
