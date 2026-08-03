import type {
  StorefrontCollection,
  StorefrontCustomization,
  StorefrontFeeSettings,
  StorefrontProduct,
  StorefrontReview,
} from './types';

export const STORE_API_BASE = 'https://mkkqbekhvcnwcheegjpy.supabase.co/functions/v1/store-api';

export function storeApiHeaders(apiKey: string): HeadersInit {
  return { 'X-API-Key': apiKey };
}

function mapProduct(p: any): StorefrontProduct {
  const images = Array.isArray(p.images)
    ? p.images.map((img: any) => ({
        id: img.id,
        image_url: img.image_url,
        is_primary: img.is_primary,
      }))
    : [];
  const image =
    p.primary_image ||
    images.find((i: { is_primary?: boolean }) => i.is_primary)?.image_url ||
    images[0]?.image_url ||
    p.image ||
    '';

  const original = typeof p.original_price === 'number' ? p.original_price : Number(p.price) || 0;
  const final =
    typeof p.final_price === 'number'
      ? p.final_price
      : typeof p.discounted_price === 'number'
        ? p.discounted_price
        : original;

  return {
    id: p.id,
    title: p.title,
    description: p.description || '',
    price: final,
    original_price: original,
    has_discount: !!p.has_discount && final < original,
    discount_percentage: Number(p.discount_percentage) || 0,
    image,
    images,
    stock: Number(p.stock) || 0,
    sku: p.sku || '',
    category: p.category || '',
    collection_ids: Array.isArray(p.collection_ids) ? p.collection_ids : [],
    created_at: p.created_at,
  };
}

export async function fetchStoreConfig(apiKey: string): Promise<{
  storeName: string;
  preferredLanguage: string;
  mapboxToken: string;
  fees: StorefrontFeeSettings;
  customization: StorefrontCustomization;
}> {
  const res = await fetch(`${STORE_API_BASE}/config`, {
    headers: storeApiHeaders(apiKey),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load config');

  const payment = data.payment || {};
  const delivery = data.delivery || {};
  const c = data.customization || {};

  return {
    storeName: data.store_name || c.store_name || 'Store',
    preferredLanguage: data.preferred_language || 'ro',
    mapboxToken: data.mapbox_token || '',
    fees: {
      cash_payment_enabled:
        data.cash_payment_enabled ?? payment.cash_enabled ?? true,
      cash_payment_fee: Number(data.cash_payment_fee ?? payment.cash_fee ?? 0),
      home_delivery_fee: Number(data.home_delivery_fee ?? delivery.home_fee ?? 0),
      locker_delivery_fee: Number(data.locker_delivery_fee ?? delivery.locker_fee ?? 0),
      card_enabled: payment.card_enabled !== false,
    },
    customization: {
      store_name: c.store_name || data.store_name || 'Store',
      logo_url: c.logo_url || null,
      hero_image_url: c.hero_image_url || null,
      hero_title: c.hero_title || 'Welcome',
      hero_subtitle: c.hero_subtitle || 'Discover our collection',
      hero_button_text: c.hero_button_text || 'Shop now',
      show_reviews: c.show_reviews !== false,
      footer_text: c.footer_text || 'All rights reserved.',
      primary_color: c.primary_color,
    },
  };
}

export async function fetchStoreProducts(apiKey: string): Promise<StorefrontProduct[]> {
  const res = await fetch(`${STORE_API_BASE}/products`, {
    headers: storeApiHeaders(apiKey),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load products');
  const list = Array.isArray(data) ? data : data.products || [];
  return list.map(mapProduct);
}

export async function fetchStoreCollections(apiKey: string): Promise<{
  collections: StorefrontCollection[];
  productCollectionMap: Record<string, string[]>;
}> {
  const res = await fetch(`${STORE_API_BASE}/collections`, {
    headers: storeApiHeaders(apiKey),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load collections');
  const list = Array.isArray(data) ? data : data.collections || [];
  const productCollectionMap: Record<string, string[]> = {};

  const collections = list.map((c: any) => {
    const productIds = Array.isArray(c.products)
      ? c.products.map((p: any) => p.id).filter(Boolean)
      : [];
    for (const pid of productIds) {
      if (!productCollectionMap[pid]) productCollectionMap[pid] = [];
      productCollectionMap[pid].push(c.id);
    }
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      image_url: c.image_url,
      product_count: c.product_count ?? productIds.length,
    };
  });

  return { collections, productCollectionMap };
}

export async function fetchStoreReviews(apiKey: string): Promise<StorefrontReview[]> {
  const res = await fetch(`${STORE_API_BASE}/reviews`, {
    headers: storeApiHeaders(apiKey),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.reviews || [];
  return list.map((r: any) => ({
    id: r.id,
    customer_name: r.customer_name || r.name || 'Customer',
    rating: Number(r.rating) || 5,
    comment: r.comment || r.review_text || null,
    merchant_reply: r.merchant_reply || null,
    product_id: r.product_id,
    created_at: r.created_at,
  }));
}

export async function submitStoreReview(
  apiKey: string,
  payload: {
    product_id: string;
    customer_name: string;
    customer_email?: string;
    rating: number;
    review_text?: string;
  }
) {
  const res = await fetch(`${STORE_API_BASE}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...storeApiHeaders(apiKey),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to submit review');
  return data;
}

export function productReviewStats(
  reviews: StorefrontReview[],
  productId: string
): { avg: number; count: number } {
  const list = reviews.filter((r) => r.product_id === productId);
  if (!list.length) return { avg: 0, count: 0 };
  return {
    avg: list.reduce((s, r) => s + r.rating, 0) / list.length,
    count: list.length,
  };
}

export function formatRon(amount: number) {
  return `${Number(amount || 0).toFixed(2)} RON`;
}
