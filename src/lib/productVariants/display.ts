export function formatLei(amount: number): string {
  return `${Number(amount || 0).toFixed(2)} lei`;
}

export function formatCatalogPrice(product: {
  price: number;
  has_variants?: boolean;
  min_variant_price?: number | null;
  max_variant_price?: number | null;
}): string {
  if (
    product.has_variants &&
    product.min_variant_price != null &&
    product.max_variant_price != null &&
    Number(product.min_variant_price) !== Number(product.max_variant_price)
  ) {
    return `${Number(product.min_variant_price).toFixed(2)} – ${Number(product.max_variant_price).toFixed(2)} lei`;
  }
  if (product.has_variants && product.min_variant_price != null) {
    return formatLei(Number(product.min_variant_price));
  }
  return formatLei(Number(product.price) || 0);
}
