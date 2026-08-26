import type {
  StorefrontProduct,
  StorefrontProductImage,
  StorefrontProductOption,
  StorefrontVariant,
} from './types';
import type { VariantSelection } from './variantSelection';

export function baseProductImages(product: StorefrontProduct): StorefrontProductImage[] {
  const images = [...(product.images || [])].filter((image) => Boolean(image.image_url));
  if (product.image && !images.some((image) => image.image_url === product.image)) {
    images.unshift({ image_url: product.image, is_primary: true });
  }
  return images;
}

/**
 * Mapped images for selected option values first (options in `position` order,
 * then each value's assigned `image_ids` order), de-duplicated by image id,
 * then remaining gallery images. Partial selections are valid.
 */
export function resolveProductImagesForSelection(
  product: StorefrontProduct,
  selection: VariantSelection
): StorefrontProductImage[] {
  const base = baseProductImages(product);
  const options = [...(product.options || [])].sort((a, b) => a.position - b.position);
  const byId = new Map(
    base.filter((image) => image.id).map((image) => [image.id as string, image])
  );
  const seen = new Set<string>();
  const mapped: StorefrontProductImage[] = [];

  for (const option of options) {
    const valueId = selection[option.id];
    if (!valueId) continue;
    const value = option.values.find((entry) => entry.id === valueId);
    if (!value?.image_ids?.length) continue;
    for (const imageId of value.image_ids) {
      if (seen.has(imageId)) continue;
      seen.add(imageId);
      const image = byId.get(imageId);
      if (image) mapped.push(image);
    }
  }

  if (mapped.length === 0) {
    return base.length ? base : product.image ? [{ image_url: product.image }] : [];
  }

  const rest = base.filter((image) => {
    if (image.id) return !seen.has(image.id);
    return !mapped.some((row) => row.image_url === image.image_url);
  });
  return [...mapped, ...rest];
}

export function resolveVariantDisplayImage(
  product: StorefrontProduct,
  selection: VariantSelection
): string {
  return resolveProductImagesForSelection(product, selection)[0]?.image_url || product.image || '';
}

export function selectionFromValueIds(
  options: StorefrontProductOption[] | undefined,
  valueIds: string[]
): VariantSelection {
  const selection: VariantSelection = {};
  for (const option of options || []) {
    const hit = option.values.find((value) => valueIds.includes(value.id));
    selection[option.id] = hit?.id ?? null;
  }
  return selection;
}

export function productWithResolvedCartImage(
  product: StorefrontProduct,
  variant: StorefrontVariant | null
): StorefrontProduct {
  const selection =
    variant && product.options?.length
      ? selectionFromValueIds(product.options, variant.option_value_ids)
      : {};
  const image = resolveVariantDisplayImage(product, selection);
  return { ...product, image: image || product.image };
}
