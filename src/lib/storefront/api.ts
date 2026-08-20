import type {
  DeliveryQuote,
  StorefrontCollection,
  StorefrontCustomization,
  StorefrontDeliveryConfig,
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
    show_stock_to_customers: p.show_stock_to_customers !== false,
  };
}

export async function fetchStoreConfig(apiKey: string, opts?: { templateId?: string }): Promise<{
  storeName: string;
  preferredLanguage: string;
  mapboxToken: string;
  fees: StorefrontFeeSettings;
  customization: StorefrontCustomization;
  showStockToCustomers: boolean;
  allowOrderNotes: boolean;
  deliveryConfig: StorefrontDeliveryConfig;
  aiSpec: unknown | null;
  activeTemplate: string | null;
}> {
  const qs = opts?.templateId ? `?template_id=${encodeURIComponent(opts.templateId)}` : '';
  const res = await fetch(`${STORE_API_BASE}/config${qs}`, {
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
      background_color: c.background_color,
      text_color: c.text_color,
      accent_color: c.accent_color,
      secondary_color: c.secondary_color,
      font_family: c.font_family,
      heading_font: c.heading_font,
      border_radius: c.border_radius,
      button_style: c.button_style,
    },
    aiSpec: data.ai_spec || null,
    activeTemplate: data.active_template || null,
    showStockToCustomers: data.show_stock_to_customers !== false,
    allowOrderNotes: data.allow_order_notes !== false,
    deliveryConfig: {
      custom_pricing_enabled: !!(delivery.custom_pricing_enabled),
      locker_enabled: delivery.locker_enabled !== false,
      coverage_mode: delivery.coverage_mode || 'romania',
      covered_counties: Array.isArray(delivery.covered_counties) ? delivery.covered_counties : [],
      covered_localities: Array.isArray(delivery.covered_localities)
        ? delivery.covered_localities
        : [],
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

export async function fetchDeliveryQuote(
  apiKey: string,
  payload: {
    county: string;
    city: string;
    street?: string;
    street_number?: string;
    items: { quantity: number; price?: number }[];
    subtotal?: number;
  }
): Promise<DeliveryQuote> {
  const res = await fetch(`${STORE_API_BASE}/delivery-quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...storeApiHeaders(apiKey),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      enabled: true,
      available: false,
      error: data.code,
      error_message: data.error,
    };
  }
  return {
    enabled: data.enabled !== false,
    available: !!data.available,
    error: data.error,
    error_message: data.error_message,
    delivery_fee: Number(data.delivery_fee || 0),
    distance_km: data.distance_km,
    quantity: data.quantity,
    price_per_unit: data.price_per_unit,
    charge_mode: data.charge_mode === 'per_unit' || data.snapshot?.distance_charge === 'per_unit' ? 'per_unit' : 'flat',
    county: data.county,
    locality: data.locality,
  };
}
