/**
 * Maps generated storefront commerce types → real SpeedVendors store-api shapes.
 *
 * Presentation layer (AI) consumes the runtime SpeedVendorsCommerce interface.
 * Authoritative prices/stock/checkout remain on SpeedVendors APIs (store-api).
 *
 * Phase 1: type bridging + contract rules only. Live fetch adapter comes later.
 * Do not invent a second checkout.
 */

export type Money = { amount: number; currency: string };

export type Merchant = {
  id: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  contactEmail: string;
  locale: string;
  currency: string;
};

export type Category = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  productCount: number;
};

export type ProductVariant = { id: string; label: string; inStock: boolean };

export type Product = {
  id: string;
  title: string;
  description: string;
  price: Money;
  compareAtPrice: Money | null;
  images: Array<{ url: string; alt: string }>;
  categoryId: string;
  inStock: boolean;
  variants: ProductVariant[];
};

/** Subset of StorefrontProduct fields the AI presentation may display. */
export type SvStorefrontProduct = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  compare_at_price?: number | null;
  currency?: string;
  images?: Array<{ url: string; alt?: string | null }>;
  collection_ids?: string[];
  in_stock?: boolean;
  variants?: Array<{
    id: string;
    title?: string;
    available?: boolean;
    in_stock?: boolean;
  }>;
};

export type SvStorefrontCollection = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
};

export type SvStoreConfig = {
  store_name?: string;
  logo_url?: string | null;
  contact_email?: string | null;
  preferred_language?: string | null;
  currency?: string | null;
};

export function toMoney(amount: number, currency = 'RON'): Money {
  return { amount, currency };
}

export function mapMerchant(config: SvStoreConfig, userId: string): Merchant {
  return {
    id: userId,
    name: config.store_name || 'Store',
    tagline: '',
    logoUrl: config.logo_url ?? null,
    contactEmail: config.contact_email || '',
    locale: config.preferred_language || 'ro',
    currency: config.currency || 'RON',
  };
}

export function mapCollection(c: SvStorefrontCollection, productCount = 0): Category {
  return {
    id: c.id,
    name: c.name,
    description: c.description || '',
    imageUrl: c.image_url ?? null,
    productCount,
  };
}

export function mapProduct(p: SvStorefrontProduct, currency = 'RON'): Product {
  const variants: ProductVariant[] = (p.variants || []).map((v) => ({
    id: v.id,
    label: v.title || 'Default',
    inStock: v.in_stock ?? v.available ?? true,
  }));
  return {
    id: p.id,
    title: p.name,
    description: p.description || '',
    price: toMoney(Number(p.price) || 0, p.currency || currency),
    compareAtPrice:
      p.compare_at_price != null
        ? toMoney(Number(p.compare_at_price), p.currency || currency)
        : null,
    images: (p.images || []).map((img) => ({ url: img.url, alt: img.alt || p.name })),
    categoryId: p.collection_ids?.[0] || '',
    inStock: p.in_stock !== false,
    variants,
  };
}

export const COMMERCE_CONTRACT_RULES = [
  'Presentation only — no payment, order, or inventory authority in generated code.',
  'All product IDs must be SpeedVendors UUIDs / durable IDs.',
  'Prices and stock are read through the commerce adapter at runtime.',
  'Checkout submits via SpeedVendorsCommerce.checkout.submit — never a custom payment backend.',
  'Do not import Supabase service keys, Stripe secrets, or Cursor credentials.',
] as const;
