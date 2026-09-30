/**
 * Foundation catalogue metadata (safe fields only: no secrets, no commerce).
 */
export const foundationManifest = {
  id: 'foundation' as const,
  name: 'Foundation',
  shortDescription:
    'Light, editorial storefront with deep-plum accents — a calm, premium home for any product range.',
  categoryTags: ['universal', 'light', 'editorial', 'minimal', 'premium'],
  previewImage: '/themes/foundation/preview.svg',
  availableContentSlots: [
    // Brand
    'logo',
    'announcement',
    // Hero
    'hero.mediaMode',
    'hero.image',
    'hero.featuredProductId',
    'hero.backgroundImage',
    'hero.eyebrow',
    'hero.headline',
    'hero.headlineAccent',
    'hero.supportingCopy',
    'hero.primaryCtaLabel',
    'hero.secondaryCtaLabel',
    'heroStats',
    'merchantTaglineFallback',
    // Sections
    'sections',
    'marqueeItems',
    // Collections (PROPOSED extension)
    'collectionsEyebrow',
    'collectionsTitle',
    // Featured
    'featuredEyebrow',
    'featuredFallbackTitle',
    'featuredFallbackBody',
    // Shop
    'shopEyebrow',
    'shopTitle',
    // Editorial (PROPOSED extension)
    'editorialEyebrow',
    'editorialTitle',
    'editorialBody',
    'editorialCtaLabel',
    'editorialMedia',
    'editorialMediaMode',
    // Why
    'whyEyebrow',
    'whyTitle',
    'whyCards',
    // CTA band (PROPOSED extension)
    'ctaEyebrow',
    'ctaTitle',
    'ctaBody',
    'ctaLabel',
    'ctaBackgroundImage',
    // Product page (PROPOSED extension)
    'relatedTitle',
    // Navigation / footer / social
    'navLabels',
    'footerTagline',
    'footerExploreTitle',
    'footerPaymentsTitle',
    'footerPaymentsCopy',
    'socialLinks',
  ],
  supportedHeroMediaModes: ['template-art', 'image', 'featured-product'] as const,
};

/** Theme options — developer/runtime config, NOT merchant slots (mirrors novateeThemeOptions). */
export const foundationThemeOptions = {
  showCategoryFilters: true,
  /** Durable live product ids; empty → first products with images (max 3). */
  featuredProductIds: [] as string[],
  /** Max featured cards rendered in the Featured section. */
  maxFeatured: 3,
  /** Max collection tiles on the home page. */
  maxCollections: 8,
  /** How product imagery sits in cards: contain on a tinted plinth (default) or full-bleed cover. */
  productImageFit: 'contain' as 'contain' | 'cover',
};
