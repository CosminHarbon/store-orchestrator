// PROTECTED: deterministic mock implementation of the commerce interface for the PoC.
// No network access, no credentials, no production calls. Cursor may not edit this file.
import type { CartApi, SpeedVendorsCommerce } from './commerce';
import type {
  Cart,
  CartLine,
  Category,
  CheckoutInput,
  CheckoutResult,
  Merchant,
  Money,
  Product,
  ProductQuery,
} from './types';

const CURRENCY = 'RON';

const money = (amount: number): Money => ({ amount: Math.round(amount * 100) / 100, currency: CURRENCY });

/** Deterministic offline placeholder art (SVG data URI) so nothing hits the network. */
function art(seed: string, hue: number, label: string): string {
  const h = ((hue % 360) + 360) % 360;
  const h2 = (h + 38) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${h} 22% 86%)"/>` +
    `<stop offset="1" stop-color="hsl(${h2} 26% 70%)"/></linearGradient></defs>` +
    `<rect width="800" height="1000" fill="url(#g)"/>` +
    `<circle cx="560" cy="300" r="190" fill="hsl(${h} 30% 92%)" opacity=".55"/>` +
    `<text x="60" y="930" font-family="Georgia,serif" font-size="54" fill="hsl(${h} 30% 22%)" opacity=".8">${label}</text>` +
    `<title>${seed}</title></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const MERCHANT: Merchant = {
  id: 'demo-merchant',
  name: 'Atelier Nord',
  tagline: 'Considered essentials, made to last.',
  logoUrl: null,
  contactEmail: 'hello@atelier-nord.example',
  locale: 'en',
  currency: CURRENCY,
};

const CATEGORIES: Category[] = [
  { id: 'outerwear', name: 'Outerwear', description: 'Coats and jackets for every season.', imageUrl: art('outerwear', 24, 'Outerwear'), productCount: 3 },
  { id: 'knitwear', name: 'Knitwear', description: 'Soft, structured knits.', imageUrl: art('knitwear', 200, 'Knitwear'), productCount: 3 },
  { id: 'accessories', name: 'Accessories', description: 'Small details that finish the look.', imageUrl: art('accessories', 340, 'Accessories'), productCount: 2 },
];

const SIZES = [
  { id: 's', label: 'S', inStock: true },
  { id: 'm', label: 'M', inStock: true },
  { id: 'l', label: 'L', inStock: true },
];

type Seed = {
  id: string;
  title: string;
  description: string;
  price: number;
  compareAt?: number;
  categoryId: string;
  hue: number;
  sizes: boolean;
  inStock?: boolean;
};

const SEEDS: Seed[] = [
  { id: 'p-wool-coat', title: 'Wool Overcoat', description: 'A relaxed, single-breasted overcoat in a dense Italian wool blend.', price: 899, categoryId: 'outerwear', hue: 24, sizes: true },
  { id: 'p-field-jacket', title: 'Field Jacket', description: 'Water-repellent cotton twill with four utility pockets.', price: 549, compareAt: 649, categoryId: 'outerwear', hue: 96, sizes: true },
  { id: 'p-trench', title: 'Light Trench', description: 'An unlined trench cut for layering in spring.', price: 729, categoryId: 'outerwear', hue: 38, sizes: true },
  { id: 'p-crew-knit', title: 'Merino Crewneck', description: 'Fine-gauge merino with a clean, ribbed neckline.', price: 289, categoryId: 'knitwear', hue: 210, sizes: true },
  { id: 'p-cable-knit', title: 'Cable Knit Sweater', description: 'Heavyweight cable knit in undyed wool.', price: 359, compareAt: 419, categoryId: 'knitwear', hue: 190, sizes: true },
  { id: 'p-turtleneck', title: 'Cashmere Turtleneck', description: 'Lightweight cashmere with a fold-over collar.', price: 479, categoryId: 'knitwear', hue: 260, sizes: true, inStock: false },
  { id: 'p-scarf', title: 'Wool Scarf', description: 'Generous woven scarf with hand-rolled edges.', price: 149, categoryId: 'accessories', hue: 340, sizes: false },
  { id: 'p-tote', title: 'Canvas Tote', description: 'Heavy organic canvas with leather handles.', price: 189, categoryId: 'accessories', hue: 60, sizes: false },
];

const PRODUCTS: Product[] = SEEDS.map((s) => ({
  id: s.id,
  title: s.title,
  description: s.description,
  price: money(s.price),
  compareAtPrice: s.compareAt ? money(s.compareAt) : null,
  images: [
    { url: art(s.id, s.hue, s.title), alt: s.title },
    { url: art(`${s.id}-2`, s.hue + 20, s.title), alt: `${s.title} detail` },
  ],
  categoryId: s.categoryId,
  inStock: s.inStock !== false,
  variants: s.sizes ? SIZES.map((v) => ({ ...v })) : [],
}));

function recompute(lines: CartLine[]): Cart {
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const total = lines.reduce((sum, l) => sum + l.lineTotal.amount, 0);
  return { lines, itemCount, subtotal: money(total) };
}

export function createMockCommerce(): SpeedVendorsCommerce {
  let lines: CartLine[] = [];
  let snapshot: Cart = recompute(lines);
  let orderCounter = 0;
  const listeners = new Set<() => void>();

  const publish = () => {
    snapshot = recompute(lines);
    listeners.forEach((l) => l());
  };

  const withQuantity = (l: CartLine, quantity: number): CartLine => ({
    ...l,
    quantity,
    lineTotal: money(l.unitPrice.amount * quantity),
  });

  const cart: CartApi = {
    get: () => snapshot,
    async addItem(productId, variantId, quantity = 1) {
      const product = PRODUCTS.find((p) => p.id === productId);
      if (!product || !product.inStock || quantity < 1) return;
      const variant = variantId ? product.variants.find((v) => v.id === variantId) ?? null : null;
      if (product.variants.length > 0 && !variant) return;
      const lineId = `${productId}:${variant?.id ?? '-'}`;
      const existing = lines.find((l) => l.lineId === lineId);
      if (existing) {
        lines = lines.map((l) => (l.lineId === lineId ? withQuantity(l, l.quantity + quantity) : l));
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
            lineTotal: money(product.price.amount * quantity),
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
      return MERCHANT;
    },
    async listCategories() {
      return CATEGORIES;
    },
    async listProducts(query?: ProductQuery) {
      const search = query?.search?.trim().toLowerCase();
      return PRODUCTS.filter(
        (p) =>
          (!query?.categoryId || p.categoryId === query.categoryId) &&
          (!search || p.title.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)),
      );
    },
    async getProduct(productId) {
      return PRODUCTS.find((p) => p.id === productId) ?? null;
    },
    cart,
    checkout: {
      async submit(input: CheckoutInput): Promise<CheckoutResult> {
        if (snapshot.lines.length === 0) return { ok: false, error: 'Your cart is empty.' };
        if (!input.name.trim()) return { ok: false, error: 'Please enter your name.' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
          return { ok: false, error: 'Please enter a valid email.' };
        }
        if (!input.phone?.trim()) return { ok: false, error: 'Please enter your phone number.' };
        if (!input.street.trim()) return { ok: false, error: 'Please enter your street.' };
        if (!input.streetNumber.trim()) return { ok: false, error: 'Please enter your street number.' };
        if (!input.city.trim()) return { ok: false, error: 'Please enter your city.' };
        if (!input.county.trim()) return { ok: false, error: 'Please enter your county.' };
        if (input.paymentMethod !== 'cash') {
          return {
            ok: false,
            error: 'Only cash on delivery is supported. Card checkout is not available.',
          };
        }
        orderCounter += 1;
        const orderId = `MOCK-${String(orderCounter).padStart(4, '0')}`;
        lines = [];
        publish();
        return { ok: true, orderId, message: 'Mock order placed. No payment was taken.' };
      },
    },
  };
}
