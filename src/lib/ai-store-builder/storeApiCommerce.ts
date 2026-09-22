/**
 * Live SpeedVendorsCommerce adapter over store-api (X-API-Key).
 *
 * Checkout limitations (Phase 2):
 * - CheckoutInput.address is freeform; store-api requires structured RO address
 *   fields. We send a best-effort mapping (street=full address, placeholders for
 *   city/county/number) which may fail for merchants with custom delivery quoting.
 * - Only cash (COD) is posted. Card requires Stripe/Netopia session flow — not
 *   implemented here; card submit returns a clear error.
 * - Server re-prices items; client prices are display-only.
 */

import {
  mapCollection,
  mapMerchant,
  mapProduct,
  type Category,
  type Merchant,
  type Money,
  type Product,
  type SvStorefrontCollection,
  type SvStorefrontProduct,
} from './commerceBridge';

export type CreateStoreApiCommerceOpts = {
  apiKey: string;
  baseUrl: string;
};

export type ProductQuery = { categoryId?: string; search?: string };

export type CartLine = {
  lineId: string;
  productId: string;
  variantId: string | null;
  title: string;
  variantLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
};

export type Cart = {
  lines: CartLine[];
  itemCount: number;
  subtotal: Money;
};

export type CheckoutInput = {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes?: string;
  paymentMethod: 'card' | 'cash';
};

export type CheckoutResult =
  | { ok: true; orderId: string; message: string }
  | { ok: false; error: string };

export type CartApi = {
  get(): Cart;
  addItem(productId: string, variantId: string | null, quantity?: number): Promise<void>;
  updateQuantity(lineId: string, quantity: number): void;
  removeItem(lineId: string): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

/** Matches tools/speedvendors-storefront-runtime SpeedVendorsCommerce surface. */
export type SpeedVendorsCommerce = {
  getMerchant(): Promise<Merchant>;
  listCategories(): Promise<Category[]>;
  listProducts(query?: ProductQuery): Promise<Product[]>;
  getProduct(productId: string): Promise<Product | null>;
  cart: CartApi;
  checkout: { submit(input: CheckoutInput): Promise<CheckoutResult> };
};

function money(amount: number, currency: string): Money {
  return { amount: Math.round(amount * 100) / 100, currency };
}

function apiHeaders(apiKey: string): HeadersInit {
  return { 'X-API-Key': apiKey, Accept: 'application/json' };
}

function toSvProduct(raw: Record<string, unknown>, currency: string): SvStorefrontProduct {
  const imagesRaw = Array.isArray(raw.images) ? raw.images : [];
  const primary =
    (typeof raw.primary_image === 'string' && raw.primary_image) ||
    (typeof raw.image === 'string' && raw.image) ||
    '';
  const images: Array<{ url: string; alt?: string | null }> = [];
  if (primary) images.push({ url: primary, alt: String(raw.title || raw.name || '') });
  for (const img of imagesRaw as Array<Record<string, unknown>>) {
    const url = String(img.image_url || img.url || '');
    if (url && !images.some((i) => i.url === url)) {
      images.push({ url, alt: String(img.alt || raw.title || '') });
    }
  }

  const price =
    typeof raw.final_price === 'number'
      ? raw.final_price
      : typeof raw.price === 'number'
        ? raw.price
        : Number(raw.price) || 0;
  const original = typeof raw.original_price === 'number' ? raw.original_price : null;

  const variants = Array.isArray(raw.variants)
    ? (raw.variants as Array<Record<string, unknown>>).map((v) => ({
        id: String(v.id),
        title: String(v.title || v.sku || 'Variant'),
        available: v.active !== false && Number(v.stock ?? 1) > 0,
        in_stock: Number(v.stock ?? 1) > 0,
      }))
    : undefined;

  return {
    id: String(raw.id),
    name: String(raw.title || raw.name || 'Product'),
    description: (raw.description as string) || '',
    price,
    compare_at_price: original != null && original > price ? original : null,
    currency,
    images,
    collection_ids: Array.isArray(raw.collection_ids)
      ? (raw.collection_ids as string[])
      : undefined,
    in_stock: Number(raw.stock ?? 1) > 0,
    variants,
  };
}

function recompute(lines: CartLine[], currency: string): Cart {
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + l.lineTotal.amount, 0);
  return { lines, itemCount, subtotal: money(total, currency) };
}

export function createStoreApiCommerce(opts: CreateStoreApiCommerceOpts): SpeedVendorsCommerce {
  const base = opts.baseUrl.replace(/\/$/, '');
  const apiKey = opts.apiKey;

  let currency = 'RON';
  let merchantUserId = `store:${apiKey.slice(0, 8)}`;
  let cachedMerchant: Merchant | null = null;
  let cachedCategories: Category[] | null = null;
  let cachedProducts: Product[] | null = null;

  let lines: CartLine[] = [];
  let snapshot: Cart = recompute(lines, currency);
  const listeners = new Set<() => void>();

  const publish = () => {
    snapshot = recompute(lines, currency);
    listeners.forEach((l) => l());
  };

  const withQuantity = (l: CartLine, quantity: number): CartLine => ({
    ...l,
    quantity,
    lineTotal: money(l.unitPrice.amount * quantity, l.unitPrice.currency),
  });

  async function ensureCatalog(): Promise<void> {
    if (cachedMerchant && cachedProducts && cachedCategories) return;

    const [configRes, productsRes, collectionsRes] = await Promise.all([
      fetch(`${base}/config`, { headers: apiHeaders(apiKey) }),
      fetch(`${base}/products`, { headers: apiHeaders(apiKey) }),
      fetch(`${base}/collections`, { headers: apiHeaders(apiKey) }),
    ]);

    const configJson = await configRes.json().catch(() => ({}));
    if (!configRes.ok) throw new Error(configJson.error || 'Failed to load store config');

    const customization = configJson.customization || {};
    cachedMerchant = {
      ...mapMerchant(
        {
          store_name: configJson.store_name || customization.store_name,
          logo_url: customization.logo_url ?? null,
          contact_email: null,
          preferred_language: configJson.preferred_language || 'ro',
          currency,
        },
        merchantUserId,
      ),
      tagline: customization.hero_subtitle || '',
    };

    const productsJson = await productsRes.json().catch(() => ({}));
    if (!productsRes.ok) throw new Error(productsJson.error || 'Failed to load products');
    const rawList: unknown[] = Array.isArray(productsJson)
      ? productsJson
      : productsJson.products || [];
    cachedProducts = rawList.map((raw) =>
      mapProduct(toSvProduct(raw as Record<string, unknown>, currency), currency),
    );

    const collectionsJson = await collectionsRes.json().catch(() => ({}));
    const colList: unknown[] = !collectionsRes.ok
      ? []
      : Array.isArray(collectionsJson)
        ? collectionsJson
        : collectionsJson.collections || [];
    cachedCategories = (colList as SvStorefrontCollection[]).map((c) =>
      mapCollection(
        {
          id: c.id,
          name: c.name,
          description: c.description,
          image_url: c.image_url,
        },
        Number((c as { product_count?: number }).product_count) || 0,
      ),
    );
  }

  const cart: CartApi = {
    get: () => snapshot,
    async addItem(productId, variantId, quantity = 1) {
      await ensureCatalog();
      const product = cachedProducts!.find((p) => p.id === productId);
      if (!product || !product.inStock || quantity < 1) return;
      const variant = variantId
        ? product.variants.find((v) => v.id === variantId) ?? null
        : null;
      if (product.variants.length > 0 && !variant) return;
      const lineId = `${productId}:${variant?.id ?? '-'}`;
      const existing = lines.find((l) => l.lineId === lineId);
      if (existing) {
        lines = lines.map((l) =>
          l.lineId === lineId ? withQuantity(l, l.quantity + quantity) : l,
        );
      } else {
        lines = [
          ...lines,
          {
            lineId,
            productId,
            variantId: variant?.id ?? null,
            title: product.title,
            variantLabel: variant?.label ?? null,
            imageUrl: product.images[0]?.url ?? null,
            quantity,
            unitPrice: product.price,
            lineTotal: money(product.price.amount * quantity, product.price.currency),
          },
        ];
      }
      publish();
    },
    updateQuantity(lineId, quantity) {
      lines =
        quantity < 1
          ? lines.filter((l) => l.lineId !== lineId)
          : lines.map((l) => (l.lineId === lineId ? withQuantity(l, quantity) : l));
      publish();
    },
    removeItem(lineId) {
      lines = lines.filter((l) => l.lineId !== lineId);
      publish();
    },
    clear() {
      lines = [];
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    async getMerchant() {
      await ensureCatalog();
      return cachedMerchant!;
    },
    async listCategories() {
      await ensureCatalog();
      return cachedCategories!;
    },
    async listProducts(query?: ProductQuery) {
      await ensureCatalog();
      const search = query?.search?.trim().toLowerCase();
      return cachedProducts!.filter(
        (p) =>
          (!query?.categoryId || p.categoryId === query.categoryId) &&
          (!search ||
            p.title.toLowerCase().includes(search) ||
            p.description.toLowerCase().includes(search)),
      );
    },
    async getProduct(productId) {
      await ensureCatalog();
      const local = cachedProducts!.find((p) => p.id === productId);
      if (local) return local;
      const res = await fetch(`${base}/product?id=${encodeURIComponent(productId)}`, {
        headers: apiHeaders(apiKey),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      const raw = (data.product || data) as Record<string, unknown>;
      return mapProduct(toSvProduct(raw, currency), currency);
    },
    cart,
    checkout: {
      async submit(input: CheckoutInput): Promise<CheckoutResult> {
        if (snapshot.lines.length === 0) return { ok: false, error: 'Your cart is empty.' };
        if (!input.name.trim()) return { ok: false, error: 'Please enter your name.' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
          return { ok: false, error: 'Please enter a valid email.' };
        }
        if (!input.address.trim()) {
          return { ok: false, error: 'Please enter a delivery address.' };
        }
        if (input.paymentMethod === 'card') {
          return {
            ok: false,
            error: 'Card checkout is not available in this adapter yet. Choose cash on delivery.',
          };
        }

        const address = input.address.trim();
        const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
        const customer_street = parts[0] || address;
        const customer_city = parts[1] || 'N/A';
        const customer_county = parts[2] || parts[1] || 'N/A';

        const payload = {
          customer_name: input.name.trim(),
          customer_email: input.email.trim(),
          customer_phone: input.phone?.trim() || null,
          customer_notes: input.notes?.trim() || null,
          payment_method: 'cash',
          delivery_type: 'home',
          customer_street,
          customer_street_number: '1',
          customer_city,
          customer_county,
          billing_same_as_delivery: true,
          items: snapshot.lines.map((l) => ({
            product_id: l.productId,
            variant_id: l.variantId,
            quantity: l.quantity,
          })),
        };

        const res = await fetch(`${base}/orders`, {
          method: 'POST',
          headers: { ...apiHeaders(apiKey), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { ok: false, error: String(data.error || data.message || 'Order failed') };
        }
        const orderId = String(data.order?.id || data.order_id || data.id || 'unknown');
        lines = [];
        publish();
        return {
          ok: true,
          orderId,
          message: 'Order placed (cash on delivery). Prices were confirmed by SpeedVendors.',
        };
      },
    },
  };
}
