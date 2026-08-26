import type {
  StorefrontProduct,
  StorefrontProductOption,
  StorefrontVariant,
} from './types';

export type ValueAvailability = 'available' | 'out_of_stock' | 'unavailable';

export type VariantSelection = Record<string, string | null>;

export type VariantOptionSnapshot = {
  name: string;
  value: string;
};

export function cartLineKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId;
}

export function isCompleteVariantProduct(product: StorefrontProduct): boolean {
  return Boolean(product.has_variants && (product.options?.length || 0) > 0);
}

/** Catalogue payloads omit `options`; treat that as loading, not “no variants exist”. */
export function isVariantMatrixPending(product: StorefrontProduct | null | undefined): boolean {
  return Boolean(product?.has_variants && product.options == null);
}

/** Auto-select only when the option itself has a single defined value. */
export function initialVariantSelection(options: StorefrontProductOption[]): VariantSelection {
  const next: VariantSelection = {};
  for (const option of options) {
    next[option.id] = option.values.length === 1 ? option.values[0].id : null;
  }
  return next;
}

export function selectedValueIds(selection: VariantSelection): string[] {
  return Object.values(selection).filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function variantMatchesSelection(
  variant: StorefrontVariant,
  selection: VariantSelection,
  ignoreOptionId?: string
): boolean {
  for (const [optionId, valueId] of Object.entries(selection)) {
    if (!valueId || optionId === ignoreOptionId) continue;
    if (!variant.option_value_ids.includes(valueId)) return false;
  }
  return true;
}

export function isPurchasableVariant(variant: StorefrontVariant): boolean {
  return variant.active && variant.stock > 0;
}

export function findVariantBySelection(
  variants: StorefrontVariant[],
  selection: VariantSelection
): StorefrontVariant | null {
  const selected = selectedValueIds(selection);
  if (!selected.length) return null;
  return (
    variants.find((variant) =>
      selected.every((id) => variant.option_value_ids.includes(id)) &&
      variant.option_value_ids.length === selected.length
    ) || null
  );
}

export function selectionIsComplete(
  options: StorefrontProductOption[],
  selection: VariantSelection
): boolean {
  return options.every((option) => Boolean(selection[option.id]));
}

export function firstMissingOption(
  options: StorefrontProductOption[],
  selection: VariantSelection
): StorefrontProductOption | null {
  return options.find((option) => !selection[option.id]) || null;
}

/**
 * Drop option values that are no longer possible given the rest of the
 * selection. Out-of-stock (but real) combinations stay selected.
 */
export function reconcileSelection(
  options: StorefrontProductOption[],
  variants: StorefrontVariant[],
  selection: VariantSelection,
  protectOptionId?: string
): VariantSelection {
  let current: VariantSelection = { ...selection };
  let changed = true;
  const dependents = [...options].sort((a, b) => b.position - a.position);
  while (changed) {
    changed = false;
    for (const option of dependents) {
      if (protectOptionId && option.id === protectOptionId) continue;
      const valueId = current[option.id];
      if (!valueId) continue;
      if (valueFitsCurrentSelection(variants, current, option.id, valueId) === 'unavailable') {
        current = { ...current, [option.id]: null };
        changed = true;
      }
    }
  }
  return current;
}

/** Toggle a value, then clear any now-impossible selections on other options. */
export function nextVariantSelection(
  options: StorefrontProductOption[],
  variants: StorefrontVariant[],
  prev: VariantSelection,
  optionId: string,
  valueId: string
): VariantSelection {
  const toggled: VariantSelection = {
    ...prev,
    [optionId]: prev[optionId] === valueId ? null : valueId,
  };
  return reconcileSelection(options, variants, toggled, optionId);
}

export function valueFitsCurrentSelection(
  variants: StorefrontVariant[],
  selection: VariantSelection,
  optionId: string,
  valueId: string
): ValueAvailability {
  const matching = variants.filter(
    (variant) =>
      variant.option_value_ids.includes(valueId) &&
      variantMatchesSelection(variant, selection, optionId)
  );

  if (matching.length === 0) return 'unavailable';
  if (matching.some(isPurchasableVariant)) return 'available';
  if (matching.some((variant) => variant.active && variant.stock <= 0)) return 'out_of_stock';
  return 'unavailable';
}

export function valueAvailability(
  variants: StorefrontVariant[],
  selection: VariantSelection,
  optionId: string,
  valueId: string
): ValueAvailability {
  const strict = valueFitsCurrentSelection(variants, selection, optionId, valueId);
  if (strict !== 'unavailable') return strict;

  const withValue = variants.filter((variant) => variant.option_value_ids.includes(valueId));
  if (withValue.length === 0) return 'unavailable';
  // Exists on another combination: keep the chip selectable so switching this
  // option can clear the now-invalid dependent selection.
  if (withValue.some((variant) => variant.active)) return 'available';
  return 'unavailable';
}

export function variantOptionSnapshot(
  options: StorefrontProductOption[],
  variant: StorefrontVariant
): VariantOptionSnapshot[] {
  const ordered = [...options].sort((a, b) => a.position - b.position);
  const snapshots: VariantOptionSnapshot[] = [];
  for (const option of ordered) {
    const value = option.values.find((entry) => variant.option_value_ids.includes(entry.id));
    if (value) snapshots.push({ name: option.name, value: value.value });
  }
  return snapshots;
}

export function variantTitle(
  options: StorefrontProductOption[],
  variant: StorefrontVariant
): string {
  return variantOptionSnapshot(options, variant)
    .map((entry) => entry.value)
    .join(' / ');
}

export function variantSubtitle(
  options: StorefrontProductOption[] | undefined,
  variant: StorefrontVariant | null | undefined,
  fallback?: string | null
): string {
  if (fallback) return fallback;
  if (!variant || !options?.length) return '';
  return variantOptionSnapshot(options, variant)
    .map((entry) => `${entry.name}: ${entry.value}`)
    .join(' · ');
}

export function cartUnitPrice(product: {
  price: number;
}, variant?: StorefrontVariant | null): number {
  if (variant) return Number(variant.final_price);
  return Number(product.price) || 0;
}

export function cartStockLimit(
  product: { stock: number },
  variant?: StorefrontVariant | null
): number {
  if (variant) return Math.max(0, variant.stock);
  return Math.max(0, product.stock);
}

export type VariantCtaKind =
  | 'loading'
  | 'select_option'
  | 'choose_options'
  | 'unavailable'
  | 'out_of_stock'
  | 'add_to_cart';

export type VariantCta = {
  disabled: boolean;
  kind: VariantCtaKind;
  optionName?: string;
};

export function addToCartCta(
  options: StorefrontProductOption[],
  selection: VariantSelection,
  variant: StorefrontVariant | null,
  opts?: { matrixPending?: boolean }
): VariantCta {
  if (opts?.matrixPending) {
    return { disabled: true, kind: 'loading' };
  }
  const missing = firstMissingOption(options, selection);
  if (missing) {
    return { disabled: true, kind: 'select_option', optionName: missing.name };
  }
  if (!options.length) {
    return { disabled: true, kind: 'unavailable' };
  }
  if (!variant) {
    return { disabled: true, kind: 'unavailable' };
  }
  if (!isPurchasableVariant(variant)) {
    return { disabled: true, kind: variant.active ? 'out_of_stock' : 'unavailable' };
  }
  return { disabled: false, kind: 'add_to_cart' };
}

export function displayedSku(
  productSku: string | undefined,
  variant: StorefrontVariant | null
): string {
  if (variant) return variant.sku || '';
  return productSku || '';
}

export type StockDisplayKind =
  | 'loading'
  | 'choose_options'
  | 'in_stock'
  | 'out_of_stock'
  | 'in_stock_count'
  | 'only_left';

export type StockDisplay = {
  kind: StockDisplayKind;
  count?: number;
  inStock: boolean;
};

export function displayedStock(
  product: { stock: number; show_stock_to_customers?: boolean },
  variant: StorefrontVariant | null,
  selectionComplete: boolean,
  opts?: { matrixPending?: boolean }
): StockDisplay {
  if (opts?.matrixPending) {
    return { kind: 'loading', inStock: false };
  }
  const showNumbers = product.show_stock_to_customers !== false;
  const countLabel = (count: number): StockDisplay => {
    if (count > 0 && count <= 5) {
      return { kind: 'only_left', count, inStock: true };
    }
    return { kind: 'in_stock_count', count, inStock: true };
  };
  if (variant) {
    const inStock = isPurchasableVariant(variant);
    if (!inStock) return { kind: 'out_of_stock', inStock: false };
    if (!showNumbers) return { kind: 'in_stock', inStock: true };
    return countLabel(variant.stock);
  }
  if (!selectionComplete) {
    return { kind: 'choose_options', inStock: false };
  }
  const inStock = product.stock > 0;
  if (!inStock) return { kind: 'out_of_stock', inStock: false };
  if (!showNumbers) return { kind: 'in_stock', inStock: true };
  return countLabel(product.stock);
}

export function formatStorefrontPriceRange(product: {
  price: number;
  has_variants?: boolean;
  price_min?: number | null;
  price_max?: number | null;
}): string {
  if (
    product.has_variants &&
    product.price_min != null &&
    product.price_max != null &&
    Number(product.price_min) !== Number(product.price_max)
  ) {
    return `${Number(product.price_min).toFixed(2)} – ${Number(product.price_max).toFixed(2)} RON`;
  }
  if (product.has_variants && product.price_min != null) {
    return `${Number(product.price_min).toFixed(2)} RON`;
  }
  return `${Number(product.price || 0).toFixed(2)} RON`;
}

export function catalogShowsPriceRange(product: {
  has_variants?: boolean;
  price_min?: number | null;
  price_max?: number | null;
}): boolean {
  return Boolean(
    product.has_variants &&
      product.price_min != null &&
      product.price_max != null &&
      Number(product.price_min) !== Number(product.price_max)
  );
}

export function pdpUnitPrice(
  product: StorefrontProduct,
  variant: StorefrontVariant | null
): {
  amount: number;
  original: number | null;
  hasDiscount: boolean;
  range: string | null;
} {
  if (variant) {
    const hasDiscount = variant.has_discount && variant.original_price > variant.final_price;
    return {
      amount: variant.final_price,
      original: hasDiscount ? variant.original_price : null,
      hasDiscount,
      range: null,
    };
  }
  if (catalogShowsPriceRange(product)) {
    return {
      amount: Number(product.price_min),
      original: null,
      hasDiscount: false,
      range: formatStorefrontPriceRange(product),
    };
  }
  return {
    amount: product.price,
    original: product.has_discount ? product.original_price : null,
    hasDiscount: product.has_discount,
    range: null,
  };
}

export function snapshotVariantLabel(
  variantTitle?: string | null,
  variantOptions?: { name?: string; value?: string }[] | null
): string {
  if (variantTitle && variantTitle.trim()) return variantTitle.trim();
  if (!variantOptions?.length) return '';
  return variantOptions
    .map((entry) => {
      if (entry.name && entry.value) return `${entry.name}: ${entry.value}`;
      return entry.value || '';
    })
    .filter(Boolean)
    .join(' · ');
}
