// PROTECTED: add-to-cart via commerce.cart.addItem. Cursor may not edit this file.
import { useState } from 'react';
import { useCart } from '../hooks';
import type { Product } from '../types';

export interface AddToCartButtonProps {
  product: Product;
  variantId: string | null;
  quantity?: number;
  className?: string;
}

export default function AddToCartButton({
  product,
  variantId,
  quantity = 1,
  className = 'sf-btn',
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const needsVariant = product.variants.length > 0;
  const canAdd = product.inStock && (!needsVariant || variantId !== null);

  return (
    <button
      type="button"
      className={className}
      disabled={!canAdd}
      onClick={async () => {
        await addItem(product.id, variantId, quantity);
        setAdded(true);
        setTimeout(() => setAdded(false), 1600);
      }}
    >
      {!product.inStock
        ? 'Sold out'
        : needsVariant && !variantId
          ? 'Select a size'
          : added
            ? 'Added ✓'
            : 'Add to cart'}
    </button>
  );
}
