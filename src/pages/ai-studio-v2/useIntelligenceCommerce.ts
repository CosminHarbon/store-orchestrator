import { useMemo, useState } from 'react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { StorefrontProduct, StorefrontView } from '@/lib/storefront/types';
import type { IntelligencePreviewCatalog } from '@/lib/ai-studio/v2/designIntelligence';

/** DEV-only commerce stub for design-intelligence fixtures. Checkout stays inert. */
export function useIntelligenceCommerce(catalog: IntelligencePreviewCatalog): StorefrontCommerce {
  const [view, setView] = useState<StorefrontView>('home');
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);

  return useMemo(() => {
    const products = catalog.products;
    const commerce = {
      loading: false,
      demo: true,
      theme: 'premium' as const,
      currency: catalog.currency,
      locale: catalog.locale,
      products,
      bestSellers: [...products].slice(0, 4),
      newestProducts: [...products].slice().reverse(),
      collections: catalog.collections,
      reviews: catalog.reviews,
      cartCount,
      cartOpen,
      setCartOpen,
      view,
      setView,
      selectedProduct,
      activeCollectionId,
      customization: {
        store_name: catalog.storeName,
        hero_title: catalog.tagline,
        hero_subtitle: catalog.tagline,
        primary_color: '#111111',
        secondary_color: '#f5f5f5',
        accent_color: '#666666',
        logo_url: null,
        show_reviews: true,
        currency: catalog.currency,
      },
      openCatalog: (collectionId?: string | null) => {
        setActiveCollectionId(collectionId ?? null);
        setView('catalog');
      },
      openProduct: (product: StorefrontProduct) => {
        setSelectedProduct(product);
        setView('product');
      },
      addToCart: () => {
        setCartCount((c) => c + 1);
        setCartOpen(true);
      },
    };
    return commerce as unknown as StorefrontCommerce;
  }, [catalog, cartCount, cartOpen, view, selectedProduct, activeCollectionId]);
}
