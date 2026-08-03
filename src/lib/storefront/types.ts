/** Shared storefront types for all templates */

export type StorefrontView = 'home' | 'catalog' | 'product' | 'checkout';

export interface StorefrontProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  original_price: number;
  has_discount: boolean;
  discount_percentage: number;
  image: string;
  images: { id?: string; image_url: string; is_primary?: boolean }[];
  stock: number;
  sku: string;
  category: string;
  collection_ids: string[];
  created_at?: string;
}

export interface StorefrontCollection {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  product_count?: number;
}

export interface StorefrontReview {
  id: string;
  customer_name: string;
  rating: number;
  comment: string | null;
  merchant_reply?: string | null;
  product_id?: string | null;
  created_at: string;
}

export interface StorefrontFeeSettings {
  cash_payment_enabled: boolean;
  cash_payment_fee: number;
  home_delivery_fee: number;
  locker_delivery_fee: number;
  card_enabled: boolean;
}

export interface StorefrontCustomization {
  store_name: string;
  logo_url: string | null;
  hero_image_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_button_text: string;
  show_reviews: boolean;
  footer_text: string;
  primary_color?: string;
}

export interface CartItem {
  product: StorefrontProduct;
  quantity: number;
}

export interface CheckoutFormState {
  name: string;
  email: string;
  phone: string;
  delivery_type: 'home' | 'locker';
  city: string;
  county: string;
  street: string;
  street_number: string;
  block: string;
  apartment: string;
  selected_carrier_code: string;
  locker_id: string;
  locker_name: string;
  locker_address: string;
}

export const emptyCheckoutForm = (): CheckoutFormState => ({
  name: '',
  email: '',
  phone: '',
  delivery_type: 'home',
  city: '',
  county: '',
  street: '',
  street_number: '',
  block: '',
  apartment: '',
  selected_carrier_code: '',
  locker_id: '',
  locker_name: '',
  locker_address: '',
});
