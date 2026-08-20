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
  show_stock_to_customers?: boolean;
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

export type DeliveryCoverageMode = 'romania' | 'counties' | 'localities';

export interface StorefrontDeliveryConfig {
  custom_pricing_enabled: boolean;
  locker_enabled: boolean;
  coverage_mode: DeliveryCoverageMode;
  covered_counties: string[];
  covered_localities: { county: string; locality: string }[];
}

export interface DeliveryQuote {
  enabled: boolean;
  available: boolean;
  error?: string;
  error_message?: string | null;
  delivery_fee?: number;
  distance_km?: number;
  quantity?: number;
  price_per_unit?: number;
  charge_mode?: 'flat' | 'per_unit';
  county?: string;
  locality?: string;
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
  background_color?: string;
  text_color?: string;
  accent_color?: string;
  secondary_color?: string;
  font_family?: string;
  heading_font?: string;
  border_radius?: string;
  button_style?: string;
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
  notes: string;
  billing_same_as_delivery: boolean;
  billing_city: string;
  billing_county: string;
  billing_street: string;
  billing_street_number: string;
  billing_block: string;
  billing_apartment: string;
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
  notes: '',
  billing_same_as_delivery: true,
  billing_city: '',
  billing_county: '',
  billing_street: '',
  billing_street_number: '',
  billing_block: '',
  billing_apartment: '',
});
