// PROTECTED: featured products by durable IDs via commerce.getProduct. Cursor may not edit.
import { useEffect, useState, type ReactNode } from 'react';
import { useCommerce } from '../hooks';
import type { Product } from '../types';
import ProductCard from './ProductCard';
import CommerceLoading from './CommerceLoading';

export interface FeaturedProductsProps {
  ids: string[];
  onOpenProduct: (productId: string) => void;
  loadingFallback?: ReactNode;
  loadingLabel?: string;
}

export default function FeaturedProducts({
  ids,
  onOpenProduct,
  loadingFallback,
  loadingLabel = 'Loading products',
}: FeaturedProductsProps) {
  const commerce = useCommerce();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(ids.map((id) => commerce.getProduct(id)))
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows.filter((p): p is Product => p != null));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [commerce, ids.join('|')]);

  if (loading && products.length === 0) {
    return (
      <CommerceLoading label={loadingLabel} visuallyHidden={Boolean(loadingFallback)}>
        {loadingFallback}
      </CommerceLoading>
    );
  }

  if (products.length === 0) return null;

  return (
    <div className="sf-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} onOpen={onOpenProduct} />
      ))}
    </div>
  );
}
