// PROTECTED helper: resolve human option labels from canonical product/variant data.
// Do not infer semantics from theme or category — only from commerce option metadata.
import type { Product, ProductVariant } from './types';

const FALLBACK_OPTION = 'Option';

/**
 * Prefer a real option/attribute name from the product (Size, Colour, Material…).
 * Multi-option products join names with " / ". Falls back to neutral "Option".
 */
export function resolveVariantOptionLabel(product: Product | null | undefined): string {
  const names = (product?.optionNames || [])
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length > 1) return names.join(' / ');
  const fromVariants = (product?.variants || [])
    .map((v) => (v.optionName || '').trim())
    .find(Boolean);
  if (fromVariants) return fromVariants;
  return FALLBACK_OPTION;
}

/** Cart / summary line — show option name only when it adds meaning vs bare value. */
export function formatCartVariantLine(
  variantLabel: string | null | undefined,
  optionName?: string | null,
): string | null {
  const value = (variantLabel || '').trim();
  if (!value) return null;
  const name = (optionName || '').trim();
  if (name && name.toLowerCase() !== FALLBACK_OPTION.toLowerCase()) {
    return `${name} ${value}`;
  }
  return value;
}

export function selectOptionPrompt(product: Product | null | undefined): string {
  const label = resolveVariantOptionLabel(product);
  if (label === FALLBACK_OPTION) return 'Select an option';
  return `Select a ${label}`;
}

export type { ProductVariant };
