// EDITABLE presentation layer entry. Cursor may rewrite this freely, but must only use
// the public SpeedVendors commerce hooks from '../speedvendors' for data, cart and checkout.
import { useState } from 'react';
import '../styles/storefront.css';
import { useCart, useCategories, useMerchant, useProduct, useProducts } from '../speedvendors';
import Header from '../components/Header';
import ProductCard, { formatPrice } from '../components/ProductCard';
import CartDrawer from '../components/CartDrawer';
import CheckoutForm from '../components/CheckoutForm';

type View = { name: 'home' } | { name: 'product'; id: string } | { name: 'checkout' };

function ProductPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: product, loading } = useProduct(id);
  const { addItem } = useCart();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);

  if (loading && !product) return <p className="sf-section sf-muted">Loading…</p>;
  if (!product) return <p className="sf-section">Product not found.</p>;

  const needsVariant = product.variants.length > 0;
  const canAdd = product.inStock && (!needsVariant || variantId !== null);

  return (
    <section className="sf-section sf-product">
      <button className="sf-link" onClick={onBack}>
        ← Back
      </button>
      <div className="sf-product-grid">
        <div className="sf-gallery">
          <img className="sf-gallery-main" src={product.images[imageIndex]?.url} alt={product.images[imageIndex]?.alt} />
          <div className="sf-thumbs">
            {product.images.map((img, i) => (
              <button key={img.url} onClick={() => setImageIndex(i)} className={i === imageIndex ? 'is-active' : ''}>
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
              <s className="sf-price-old">{formatPrice(product.compareAtPrice.amount, product.compareAtPrice.currency)}</s>
            )}
          </p>
          <p>{product.description}</p>
          {needsVariant && (
            <div className="sf-variants" role="radiogroup" aria-label="Size">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  role="radio"
                  aria-checked={variantId === v.id}
                  disabled={!v.inStock}
                  className={variantId === v.id ? 'is-active' : ''}
                  onClick={() => setVariantId(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <button
            className="sf-btn"
            disabled={!canAdd}
            onClick={async () => {
              await addItem(product.id, variantId, 1);
              setAdded(true);
              setTimeout(() => setAdded(false), 1600);
            }}
          >
            {!product.inStock ? 'Sold out' : needsVariant && !variantId ? 'Select a size' : added ? 'Added ✓' : 'Add to cart'}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function StorefrontApp() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [cartOpen, setCartOpen] = useState(false);

  const { data: merchant } = useMerchant();
  const { data: categories } = useCategories();
  const { data: products, loading } = useProducts({ categoryId });
  const { cart } = useCart();

  const goHome = () => {
    setView({ name: 'home' });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="sf-root">
      <Header merchant={merchant} cartCount={cart.itemCount} onOpenCart={() => setCartOpen(true)} onHome={goHome} />
      <main>
        {view.name === 'home' && (
          <>
            <section className="sf-hero">
              <h1>{merchant?.name ?? ''}</h1>
              <p>{merchant?.tagline ?? ''}</p>
            </section>
            <section className="sf-section" id="shop">
              <div className="sf-filters" role="tablist" aria-label="Categories">
                <button className={!categoryId ? 'is-active' : ''} onClick={() => setCategoryId(undefined)}>
                  All
                </button>
                {categories?.map((c) => (
                  <button key={c.id} className={categoryId === c.id ? 'is-active' : ''} onClick={() => setCategoryId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
              {loading && !products ? (
                <p className="sf-muted">Loading…</p>
              ) : (
                <div className="sf-grid">
                  {products?.map((p) => (
                    <ProductCard key={p.id} product={p} onOpen={(id) => setView({ name: 'product', id })} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        {view.name === 'product' && <ProductPage id={view.id} onBack={goHome} />}
        {view.name === 'checkout' && <CheckoutForm onBack={goHome} />}
      </main>
      <footer className="sf-footer">
        <span>{merchant?.name}</span>
        <span className="sf-muted">{merchant?.contactEmail}</span>
      </footer>
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          setView({ name: 'checkout' });
        }}
      />
    </div>
  );
}
