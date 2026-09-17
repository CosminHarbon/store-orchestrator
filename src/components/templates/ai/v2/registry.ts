import type { ComponentType } from 'react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import type { SiteNode } from '@/lib/ai-studio/v2/siteTree';
import {
  productsForBinding,
  type AssetCatalog,
  type ResolvedAsset,
} from '@/lib/ai-studio/v2/assetResolver';
import {
  AnnouncementSlim,
  BrandStatementLarge,
  CollectionsTiles,
  EditorialMosaicAsymmetric,
  EditorialSplitImageText,
  FooterEditorialLuxury,
  FooterMinimalCommerce,
  HeroEditorialSplit,
  HeroLuxuryMinimal,
  HeroProductFocus,
  NavMinimal,
  NavTransparent,
  NewsletterQuiet,
  ProductGridEditorial,
  ProductGridLuxuryImageFirst,
  ProductRailHorizontal,
  ProductSpotlightFeature,
  ReviewsWall,
  TestimonialsEditorial,
} from './compositions';

export type CompositionRenderProps = {
  node: SiteNode;
  brand: BrandDesignSystem;
  commerce: StorefrontCommerce;
  language: 'ro' | 'en';
  /** Pre-resolved media for this node — see assetResolver. Never pick images ad hoc. */
  asset: ResolvedAsset;
};

type Entry = {
  type: string;
  variant: string;
  label: string;
  Component: ComponentType<CompositionRenderProps>;
};

const entries: Entry[] = [
  { type: 'nav', variant: 'minimal', label: 'Minimal navigation', Component: NavMinimal },
  { type: 'nav', variant: 'transparent', label: 'Transparent / immersive navigation', Component: NavTransparent },
  { type: 'hero', variant: 'editorial_split', label: 'Editorial split hero', Component: HeroEditorialSplit },
  { type: 'hero', variant: 'luxury_minimal', label: 'Luxury / minimal hero', Component: HeroLuxuryMinimal },
  { type: 'hero', variant: 'product_focus', label: 'Product-focused hero', Component: HeroProductFocus },
  { type: 'productGrid', variant: 'editorial', label: 'Editorial product grid', Component: ProductGridEditorial },
  { type: 'productGrid', variant: 'luxury_image_first', label: 'Luxury image-first grid', Component: ProductGridLuxuryImageFirst },
  { type: 'productRail', variant: 'horizontal', label: 'Horizontal product rail', Component: ProductRailHorizontal },
  { type: 'productSpotlight', variant: 'feature', label: 'Product spotlight', Component: ProductSpotlightFeature },
  { type: 'editorialSplit', variant: 'image_text', label: 'Editorial image/text', Component: EditorialSplitImageText },
  { type: 'brandStatement', variant: 'large_type', label: 'Large brand statement', Component: BrandStatementLarge },
  { type: 'editorialMosaic', variant: 'asymmetric', label: 'Editorial mosaic', Component: EditorialMosaicAsymmetric },
  { type: 'testimonials', variant: 'editorial', label: 'Editorial testimonials', Component: TestimonialsEditorial },
  { type: 'reviews', variant: 'wall', label: 'Review presentation', Component: ReviewsWall },
  { type: 'footer', variant: 'minimal_commerce', label: 'Minimal commerce footer', Component: FooterMinimalCommerce },
  { type: 'footer', variant: 'editorial_luxury', label: 'Editorial / luxury footer', Component: FooterEditorialLuxury },
  { type: 'newsletter', variant: 'quiet', label: 'Quiet newsletter', Component: NewsletterQuiet },
  { type: 'announcement', variant: 'slim', label: 'Slim announcement', Component: AnnouncementSlim },
  { type: 'collections', variant: 'tiles', label: 'Collection tiles', Component: CollectionsTiles },
];

const map = new Map(entries.map((e) => [`${e.type}:${e.variant}`, e]));

export function listCompositions() {
  return entries.map(({ type, variant, label }) => ({ type, variant, label }));
}

export function resolveComposition(type: string, variant: string): Entry | null {
  return map.get(`${type}:${variant}`) || entries.find((e) => e.type === type) || null;
}

/**
 * List resolution for multi-product compositions. Every binding now has explicit
 * semantics in `productsForBinding` — notably `featured`, which used to have no branch
 * at all and silently fell through to `bestSellers`.
 */
export function resolveProducts(commerce: StorefrontCommerce, node: SiteNode) {
  const limit = node.dataBindings?.limit || 8;
  const list = productsForBinding(
    node.dataBindings?.products,
    commerce as unknown as AssetCatalog,
    node.dataBindings?.collectionId
  );
  return (list.length ? list : commerce.products).slice(0, limit);
}
