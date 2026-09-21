/**
 * Sanitized, compact merchant catalog context for Cursor storefront prompts.
 * Excludes PII beyond public contact email, Stripe, and secrets.
 */

export const CONTEXT_EXCLUSIONS = [
  'stripe_*',
  'netopia_*',
  'eawb_*',
  'store_api_key',
  'payment_provider secrets',
  'customer PII (phone, address, order history)',
  'staff emails beyond public contact_email',
  'mapbox / third-party tokens',
  'supabase service keys',
  'cursor api keys',
] as const;

const DEFAULT_MAX_PRODUCTS = 24;
const DESC_LIMIT = 280;
const MAX_IMAGES = 3;

export type MerchantContextStrategy = {
  maxProducts?: number;
  featuredIds?: string[];
};

/** store-api-like product snapshot (loose; sanitized on output). */
export type MerchantContextProductInput = {
  id: string;
  title?: string;
  name?: string;
  description?: string | null;
  price?: number;
  final_price?: number;
  original_price?: number | null;
  compare_at_price?: number | null;
  image?: string | null;
  images?: Array<{ url?: string; image_url?: string; alt?: string | null }>;
  collection_ids?: string[];
  category?: string;
  stock?: number;
  in_stock?: boolean;
  variants?: Array<{
    id: string;
    title?: string;
    label?: string;
    stock?: number;
    active?: boolean;
    in_stock?: boolean;
    available?: boolean;
  }>;
};

export type MerchantContextCollectionInput = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  product_count?: number;
};

export type MerchantContextStoreInput = {
  user_id: string;
  store_name?: string | null;
  logo_url?: string | null;
  currency?: string | null;
  preferred_language?: string | null;
  locale?: string | null;
  tagline?: string | null;
  contact_email?: string | null;
  hero_subtitle?: string | null;
};

export type MerchantContextInput = {
  store: MerchantContextStoreInput;
  products?: MerchantContextProductInput[];
  collections?: MerchantContextCollectionInput[];
  strategy?: MerchantContextStrategy;
};

export type CursorStorefrontContext = {
  store: {
    id: string;
    name: string;
    logo: string | null;
    currency: string;
    locale: string;
    tagline: string;
    contactEmail: string;
  };
  products: Array<{
    id: string;
    title: string;
    description: string;
    images: string[];
    price: number;
    compareAt: number | null;
    categoryId: string;
    inStock: boolean;
    variants: Array<{ id: string; label: string; inStock: boolean }>;
  }>;
  categories: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl: string | null;
    productCount: number;
  }>;
  strategy: {
    maxProducts: number;
    featuredIds: string[];
  };
};

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function pickImages(p: MerchantContextProductInput): string[] {
  const urls: string[] = [];
  if (p.image) urls.push(p.image);
  for (const img of p.images || []) {
    const u = img.url || img.image_url;
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls.slice(0, MAX_IMAGES);
}

function selectProducts(
  products: MerchantContextProductInput[],
  maxProducts: number,
  featuredIds: string[],
): MerchantContextProductInput[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const selected: MerchantContextProductInput[] = [];
  const seen = new Set<string>();

  for (const id of featuredIds) {
    const p = byId.get(id);
    if (p && !seen.has(p.id)) {
      selected.push(p);
      seen.add(p.id);
    }
    if (selected.length >= maxProducts) return selected;
  }

  for (const p of products) {
    if (seen.has(p.id)) continue;
    selected.push(p);
    seen.add(p.id);
    if (selected.length >= maxProducts) break;
  }
  return selected;
}

export function buildCursorStorefrontContext(input: MerchantContextInput): CursorStorefrontContext {
  const maxProducts = Math.max(1, Math.min(100, input.strategy?.maxProducts ?? DEFAULT_MAX_PRODUCTS));
  const featuredIds = (input.strategy?.featuredIds || []).filter(Boolean).slice(0, maxProducts);
  const currency = input.store.currency || 'RON';
  const locale = input.store.locale || input.store.preferred_language || 'ro';
  const tagline =
    truncate(input.store.tagline || input.store.hero_subtitle || '', 160) || '';

  const products = selectProducts(input.products || [], maxProducts, featuredIds).map((p) => {
    const price = Number(p.final_price ?? p.price ?? 0) || 0;
    const compareRaw = p.compare_at_price ?? p.original_price;
    const compareAt =
      compareRaw != null && Number(compareRaw) > price ? Number(compareRaw) : null;
    return {
      id: p.id,
      title: truncate(p.title || p.name || 'Product', 120),
      description: truncate(p.description || '', DESC_LIMIT),
      images: pickImages(p),
      price,
      compareAt,
      categoryId: p.collection_ids?.[0] || p.category || '',
      inStock: p.in_stock !== false && (p.stock == null || Number(p.stock) > 0),
      variants: (p.variants || []).map((v) => ({
        id: v.id,
        label: truncate(v.label || v.title || 'Default', 64),
        inStock: v.in_stock ?? v.available ?? (v.stock == null || Number(v.stock) > 0),
      })),
    };
  });

  const categories = (input.collections || []).slice(0, 40).map((c) => ({
    id: c.id,
    name: truncate(c.name || 'Collection', 80),
    description: truncate(c.description || '', 160),
    imageUrl: c.image_url ?? null,
    productCount: Number(c.product_count) || 0,
  }));

  return {
    store: {
      id: input.store.user_id,
      name: truncate(input.store.store_name || 'Store', 80),
      logo: input.store.logo_url ?? null,
      currency,
      locale,
      tagline,
      contactEmail: truncate(input.store.contact_email || '', 120),
    },
    products,
    categories,
    strategy: { maxProducts, featuredIds },
  };
}

export function estimateContextChars(ctx: CursorStorefrontContext): number {
  return JSON.stringify(ctx).length;
}
