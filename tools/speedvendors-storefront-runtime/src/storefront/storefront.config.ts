/**
 * EDITABLE optional theme / section config.
 * Bind merchandising to real product IDs from commerce — never invent catalog IDs.
 */
export interface StorefrontThemeConfig {
  heroCtaLabel?: string;
  showCategoryFilters?: boolean;
  /** Durable product IDs for the featured strip (from commerce). Empty = hide. */
  featuredProductIds?: string[];
}

export const storefrontConfig: StorefrontThemeConfig = {
  heroCtaLabel: 'Shop',
  showCategoryFilters: true,
  featuredProductIds: [],
};
