// PROTECTED: product detail with gallery, variants, and add-to-cart. Cursor may not edit.
import { useState } from 'react';
import { useProduct } from '../hooks';
import { formatPrice } from './formatMoney';
import VariantSelector from './VariantSelector';
import AddToCartButton from './AddToCartButton';

export interface ProductDetailProps {
  productId: string;
  onBack: () => void;
}

export default function ProductDetail({ productId, onBack }: ProductDetailProps) {
  const { data: product, loading } = useProduct(productId);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);

  if (loading && !product) return <p className="sf-section sf-muted">Loading…</p>;
  if (!product) return <p className="sf-section">Product not found.</p>;

  return (
    <section className="sf-section sf-product">
      <button type="button" className="sf-link" onClick={onBack}>
        ← Back
      </button>
      <div className="sf-product-grid">
        <div className="sf-gallery">
          <img
            className="sf-gallery-main"
            src={product.images[imageIndex]?.url}
            alt={product.images[imageIndex]?.alt}
          />
          <div className="sf-thumbs">
            {product.images.map((img, i) => (
              <button
                key={img.url}
                type="button"
                onClick={() => setImageIndex(i)}
                className={i === imageIndex ? 'is-active' : ''}
              >
                <img src={img.url} alt={img.alt} />
              </button>
            ))}
          </div>
        </div>
        <div className="sf-product-info">
          <h1>{product.title}</h1>
          <p className="sf-price">
            {formatPrice(product.price.amount, product.price.currency)}
            {product.compareAtPrice && (
              <s className="sf-price-old">
                {formatPrice(product.compareAtPrice.amount, product.compareAtPrice.currency)}
              </s>
            )}
          </p>
          <p>{product.description}</p>
          <VariantSelector variants={product.variants} value={variantId} onChange={setVariantId} />
          <AddToCartButton product={product} variantId={variantId} />
        </div>
      </div>
    </section>
  );
}
