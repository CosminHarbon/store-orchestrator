import { useMemo, useState } from 'react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { StorefrontProduct, StorefrontView } from '@/lib/storefront/types';
import type { ShowcaseCatalog } from '@/lib/ai-studio/v2/showcaseData';

/**
 * Lightweight commerce stub for the V2 showcase.
 * Products/collections/reviews are real demo data; checkout stays inert.
 * Currency comes from the catalog so ProductPresentation is not stuck on RON.
 */
export function useShowcaseCommerce(catalog: ShowcaseCatalog): StorefrontCommerce {
  const [view, setView] = useState<StorefrontView>('home');
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);

  return useMemo(() => {
    const products = catalog.products;
    const bestSellers = [...products].slice(0, 4);
    const newestProducts = [...products].slice().reverse();

    const commerce = {
      loading: false,
      demo: true,
      theme: 'premium' as const,
      currency: catalog.currency,
      locale: catalog.locale,
      products,
      bestSellers,
      newestProducts,
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
