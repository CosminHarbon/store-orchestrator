// PROTECTED: single import surface for the design layer. Cursor may not edit this file.
export type * from './types';
export type { SpeedVendorsCommerce, CartApi, CheckoutApi } from './commerce';
export { createMockCommerce } from './mockCommerce';
export { createStoreApiCommerce } from './storeApiCommerce';
export { readRuntimeConfig, hasLiveCommerceConfig } from './runtimeConfig';
export type { SvRuntimeConfig } from './runtimeConfig';
export {
  CommerceProvider,
  useCommerce,
  useMerchant,
  useCategories,
  useProducts,
  useProduct,
  useCart,
  useCheckout,
} from './hooks';

// Protected presentation components — compose these from src/storefront/ only.
export { formatPrice } from './ui/formatMoney';
export { default as ProductCard } from './ui/ProductCard';
export type { ProductCardProps } from './ui/ProductCard';
export { default as ProductGrid } from './ui/ProductGrid';
export type { ProductGridProps } from './ui/ProductGrid';
export { default as FeaturedProducts } from './ui/FeaturedProducts';
export type { FeaturedProductsProps } from './ui/FeaturedProducts';
export { default as ProductDetail } from './ui/ProductDetail';
export type { ProductDetailProps } from './ui/ProductDetail';
export { default as VariantSelector } from './ui/VariantSelector';
export type { VariantSelectorProps } from './ui/VariantSelector';
export { default as AddToCartButton } from './ui/AddToCartButton';
export type { AddToCartButtonProps } from './ui/AddToCartButton';
export { default as CartDrawer } from './ui/CartDrawer';
export type { CartDrawerProps } from './ui/CartDrawer';
export { default as CheckoutForm } from './ui/CheckoutForm';
export type { CheckoutFormProps } from './ui/CheckoutForm';
export { default as CheckoutButton } from './ui/CheckoutButton';
export type { CheckoutButtonProps, CheckoutButtonMode } from './ui/CheckoutButton';
export { default as Header } from './ui/Header';
export type { HeaderProps } from './ui/Header';
/** Alias for Header — primary nav chrome is protected. */
export { default as Nav } from './ui/Header';
export { default as Footer } from './ui/Footer';
export type { FooterProps } from './ui/Footer';
