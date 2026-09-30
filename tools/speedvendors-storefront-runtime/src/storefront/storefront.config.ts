/**
 * Compatibility re-exports for older storefront imports.
 * Prefer themeRegistry + themes/novatee/* for new code.
 */
import type { ContentSlots } from './contentSlots';
import { novateeContentDefaults, novateeThemeOptions } from './themes/novatee/defaults';

export type { ContentSlots, HeroMediaMode, MediaSlot, WhyCardSlot } from './contentSlots';
export {
  isSafeMediaUrl,
  sanitizeMediaSlot,
  mergeContentSlots,
  resolveContentSlots,
  previewQueryHintsAllowed,
} from './contentSlots';
export { novateeContentDefaults } from './themes/novatee/defaults';
export { novateeManifest } from './themes/novatee/manifest';
export {
  resolveTheme,
  listThemeManifests,
  readConfiguredThemeId,
  DEFAULT_THEME_ID,
} from './themeRegistry';
export type { ThemeId, ThemeManifest, StorefrontTheme } from './themeRegistry';

/** @deprecated Prefer content slots on the active theme. */
export interface StorefrontThemeConfig {
  heroCtaLabel?: string;
  showCategoryFilters?: boolean;
  featuredProductIds?: string[];
  marqueeItems?: string[];
  whyCards?: ContentSlots['whyCards'];
  content?: ContentSlots;
}

export const storefrontConfig: StorefrontThemeConfig = {
  heroCtaLabel: novateeContentDefaults.hero.primaryCtaLabel || 'Shop the collection',
  showCategoryFilters: novateeThemeOptions.showCategoryFilters,
  featuredProductIds: novateeThemeOptions.featuredProductIds,
  marqueeItems: novateeContentDefaults.marqueeItems || [],
  whyCards: novateeContentDefaults.whyCards || [],
  content: novateeContentDefaults,
};
