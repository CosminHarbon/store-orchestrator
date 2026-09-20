// PROTECTED: SpeedVendors public commerce interface. Cursor may not edit this file.
// Cart state and checkout live behind this interface; the design layer never
// implements payment, order, or delivery logic itself.
import type {
  Cart,
  Category,
  CheckoutInput,
  CheckoutResult,
  Merchant,
  Product,
  ProductQuery,
} from './types';

export interface CartApi {
  get(): Cart;
  addItem(productId: string, variantId: string | null, quantity?: number): Promise<void>;
  updateQuantity(lineId: string, quantity: number): void;
  removeItem(lineId: string): void;
  clear(): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface CheckoutApi {
  /** Validates and places the order. Never throws for validation problems. */
  submit(input: CheckoutInput): Promise<CheckoutResult>;
}

export interface SpeedVendorsCommerce {
  getMerchant(): Promise<Merchant>;
  listCategories(): Promise<Category[]>;
  listProducts(query?: ProductQuery): Promise<Product[]>;
  getProduct(productId: string): Promise<Product | null>;
  cart: CartApi;
  checkout: CheckoutApi;
}
