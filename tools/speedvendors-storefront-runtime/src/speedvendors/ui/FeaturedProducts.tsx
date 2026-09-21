// PROTECTED: featured products by durable IDs via commerce.getProduct. Cursor may not edit.
import { useEffect, useState } from 'react';
import { useCommerce } from '../hooks';
import type { Product } from '../types';
import ProductCard from './ProductCard';

export interface FeaturedProductsProps {
  ids: string[];
  onOpenProduct: (productId: string) => void;
}

export default function FeaturedProducts({ ids, onOpenProduct }: FeaturedProductsProps) {
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
    return <p className="sf-muted">Loading…</p>;
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
