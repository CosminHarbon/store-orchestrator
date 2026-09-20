// PROTECTED: SpeedVendors public commerce contract (types). Cursor may not edit this file.
// A generated storefront may only talk to commerce through these types and the
// SpeedVendorsCommerce interface in ./commerce.ts.

export interface Money {
  /** Decimal amount, e.g. 129.9 */
  amount: number;
  currency: string;
}

export interface Merchant {
  id: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  contactEmail: string;
  locale: string;
  currency: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  productCount: number;
}

export interface ProductImage {
  url: string;
  alt: string;
}

export interface ProductVariant {
  id: string;
  label: string;
  inStock: boolean;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: Money;
  /** Present only when the product is discounted. */
  compareAtPrice: Money | null;
  images: ProductImage[];
  categoryId: string;
  inStock: boolean;
  variants: ProductVariant[];
}

export interface ProductQuery {
  categoryId?: string;
  search?: string;
}

export interface CartLine {
  lineId: string;
  productId: string;
  variantId: string | null;
  title: string;
  variantLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

export interface Cart {
  lines: CartLine[];
  itemCount: number;
  subtotal: Money;
}

export interface CheckoutInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes?: string;
  paymentMethod: 'card' | 'cash';
}

export type CheckoutResult =
  | { ok: true; orderId: string; message: string }
  | { ok: false; error: string };
