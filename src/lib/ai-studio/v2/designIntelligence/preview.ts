import type { StorefrontCollection, StorefrontProduct, StorefrontReview } from '@/lib/storefront/types';
import { siteDocumentSchema, type SiteDocument, type SiteNode } from '@/lib/ai-studio/v2/siteTree';
import type { DesignIntelligencePlan, IntelligenceInput } from './types';
import { productById } from './apply';

export type IntelligencePreviewCatalog = {
  id: string;
  label: string;
  storeName: string;
  tagline: string;
  currency: 'EUR';
  locale: string;
  products: StorefrontProduct[];
  collections: StorefrontCollection[];
  reviews: StorefrontReview[];
  heroImage: string;
  storyImage: string;
};

function node(id: string, type: SiteNode['type'], variant: string, content: Record<string, unknown>): SiteNode {
  return { id, type, variant, visible: true, content, design: {}, responsive: {} };
}

export function productsFromIntelligenceInput(input: IntelligenceInput): StorefrontProduct[] {
  return input.products.map((p) => {
    const images = input.assets
      .filter((a) => a.productId === p.id)
      .map((a, i) => ({ id: a.id, image_url: a.url, is_primary: i === 0 }));
    const image = p.imageUrl || images[0]?.image_url || '';
    const original = p.originalPrice ?? p.price;
    const hasDiscount = original > p.price;
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      price: p.price,
      original_price: original,
      has_discount: hasDiscount,
      discount_percentage: hasDiscount ? Math.round(((original - p.price) / original) * 100) : 0,
      image,
      images: images.length ? images : image ? [{ image_url: image, is_primary: true }] : [],
      stock: p.stock,
      sku: p.sku || p.id,
      category: p.category,
      collection_ids: p.collectionIds,
      variant_count: p.variantCount || 0,
    };
  });
}

export function catalogFromIntelligenceInput(input: IntelligenceInput): IntelligencePreviewCatalog {
  const products = productsFromIntelligenceInput(input);
  const hero =
    input.assets.find((a) => a.source === 'hero')?.url ||
    input.assets.find((a) => a.productId === input.merchant.featuredProductId)?.url ||
    products[0]?.image ||
    '';
  const story =
    input.assets.find((a) => a.source === 'story' || a.source === 'brand')?.url ||
    hero;
  return {
    id: input.id,
    label: input.id,
    storeName: input.merchant.storeName,
    tagline: input.merchant.tagline || input.merchant.description || input.merchant.storeName,
    currency: 'EUR',
    locale: 'en-EU',
    products,
    collections: input.collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || null,
      image_url: c.imageUrl || null,
    })),
    reviews: (input.reviews || []).map((r) => ({
      id: r.id,
      customer_name: 'Customer',
      rating: r.rating,
      comment: r.comment,
      product_id: r.productId || null,
      created_at: '2026-09-01',
    })),
    heroImage: hero,
    storyImage: story,
  };
}

/**
 * SiteDocument copy is sourced from merchant/product fields only.
 * Does not inject artisan, origin, or discount claims that are not on the input.
 */
export function documentFromIntelligence(
  input: IntelligenceInput,
  plan?: DesignIntelligencePlan
): SiteDocument {
  const products = productsFromIntelligenceInput(input);
  const primary = productById(products, plan?.catalog.primaryProductId) || products[0] || null;
  const catalog = catalogFromIntelligenceInput(input);
  const description = (input.merchant.description || input.merchant.tagline || primary?.description || '').trim();
  const title = primary?.title || input.merchant.storeName;

  return siteDocumentSchema.parse({
    version: 2,
    siteId: `intel_${input.id}`.slice(0, 64),
    designSystemId: 'linea_neutral',
    pages: {
      home: {
        id: 'home',
        type: 'home',
        nodes: [
          node('nav_01', 'nav', 'minimal', { storeName: input.merchant.storeName }),
          node('hero_01', 'hero', 'editorial_split', {
            kicker: input.merchant.tagline || primary?.category || 'Catalog',
            title,
            subtitle: description,
            cta: 'View products',
            imageUrl: catalog.heroImage,
          }),
          ...(description
            ? [
                node('statement_01', 'brandStatement', 'large_type', {
                  statement: description,
                }),
              ]
            : []),
          node('spotlight_01', 'productSpotlight', 'feature', {
            title: primary?.title || input.merchant.storeName,
            body: primary?.description || description,
            cta: 'View the piece',
            kicker: primary?.category || 'Featured',
          }),
          node('grid_01', 'productGrid', 'editorial', { title: 'The collection' }),
          node('rail_01', 'productRail', 'horizontal', { title: 'Also in the catalog' }),
          node('footer_01', 'footer', 'minimal_commerce', {
            storeName: input.merchant.storeName,
            blurb: input.merchant.tagline || '',
            text: '',
          }),
        ],
      },
    },
    meta: { language: 'en', niche: plan?.archetype.archetype || 'unknown', updatedAt: '2026-09-05T00:00:00.000Z' },
  });
}
