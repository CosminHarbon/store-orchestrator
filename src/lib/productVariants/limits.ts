/**
 * Variant safeguards. Keep in sync with
 * `public.product_variant_limits()` in
 * supabase/migrations/20260825220000_phase1_product_variants.sql
 */
export const VARIANT_LIMITS = {
  maxOptions: 3,
  softWarning: 100,
  hardMaximum: 200,
} as const;

export type VariantLimits = typeof VARIANT_LIMITS;
