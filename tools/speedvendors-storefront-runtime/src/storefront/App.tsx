// EDITABLE presentation layer entry. Compose protected SpeedVendors UI only.
// Do not reimplement cart, checkout, payments, or order APIs.
import { useState } from 'react';
import './theme.css';
import {
  CartDrawer,
  CheckoutForm,
  Footer,
  Header,
  ProductDetail,
  useCart,
  useMerchant,
} from '../speedvendors';
import HeroSection from './sections/Hero';
import MerchandisingSection from './sections/Merchandising';
import { storefrontConfig } from './storefront.config';

type View = { name: 'home' } | { name: 'product'; id: string } | { name: 'checkout' };

export default function StorefrontApp() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [cartOpen, setCartOpen] = useState(false);

  const { data: merchant } = useMerchant();
  const { cart } = useCart();

  const goHome = () => {
    setView({ name: 'home' });
    window.scrollTo({ top: 0 });
  };

  const openProduct = (id: string) => setView({ name: 'product', id });

  return (
    <div className="sf-root">
      <Header
        merchant={merchant}
        cartCount={cart.itemCount}
        onOpenCart={() => setCartOpen(true)}
        onHome={goHome}
      />
      <main>
        {view.name === 'home' && (
          <>
            <HeroSection
              merchant={merchant}
              ctaLabel={storefrontConfig.heroCtaLabel}
              onCta={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}
            />
            <MerchandisingSection
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
              featuredIds={storefrontConfig.featuredProductIds}
              onOpenProduct={openProduct}
              showFilters={storefrontConfig.showCategoryFilters}
            />
          </>
        )}
        {view.name === 'product' && <ProductDetail productId={view.id} onBack={goHome} />}
        {view.name === 'checkout' && <CheckoutForm onBack={goHome} />}
      </main>
      <Footer merchant={merchant} />
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
