// PROTECTED: product listing via commerce.listProducts. Cursor may not edit this file.
import { useProducts } from '../hooks';
import type { ProductQuery } from '../types';
import ProductCard from './ProductCard';

export interface ProductGridProps {
  query?: ProductQuery;
  onOpenProduct: (productId: string) => void;
}

export default function ProductGrid({ query, onOpenProduct }: ProductGridProps) {
  const { data: products, loading } = useProducts(query);

  if (loading && !products) {
    return <p className="sf-muted">Loading…</p>;
  }

  return (
    <div className="sf-grid">
      {products?.map((p) => (
        <ProductCard key={p.id} product={p} onOpen={onOpenProduct} />
      ))}
    </div>
  );
}
