// PROTECTED: product card presentation. Cursor may not edit this file.
import type { Product } from '../types';
import { formatPrice } from './formatMoney';

export interface ProductCardProps {
  product: Product;
  onOpen: (productId: string) => void;
}

export default function ProductCard({ product, onOpen }: ProductCardProps) {
  const image = product.images[0];
  return (
    <button className="sf-card" onClick={() => onOpen(product.id)} type="button">
      <div className="sf-card-media">
        {image && <img src={image.url} alt={image.alt} loading="lazy" />}
        {!product.inStock && <span className="sf-badge">Sold out</span>}
        {product.compareAtPrice && product.inStock && <span className="sf-badge sf-badge-sale">Sale</span>}
      </div>
      <div className="sf-card-body">
        <span className="sf-card-title">{product.title}</span>
        <span className="sf-price">
          {formatPrice(product.price.amount, product.price.currency)}
          {product.compareAtPrice && (
            <s className="sf-price-old">
              {formatPrice(product.compareAtPrice.amount, product.compareAtPrice.currency)}
            </s>
          )}
        </span>
      </div>
    </button>
  );
}
