import type { ShowcaseCatalog } from '@/lib/ai-studio/v2/showcaseData';
import type { IntelligenceAssetInput, IntelligenceInput } from './types';

function filenameOf(url: string): string {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean).pop() || 'image.jpg';
    return path.includes('.') ? path : `${path}.jpg`;
  } catch {
    return 'image.jpg';
  }
}

/** Map a DEV showcase catalog into intelligence input (no network). */
export function intelligenceInputFromShowcase(catalog: ShowcaseCatalog, extras?: Partial<IntelligenceInput>): IntelligenceInput {
  const assets: IntelligenceAssetInput[] = [];
  for (const p of catalog.products) {
    const images = p.images?.length ? p.images : p.image ? [{ image_url: p.image, is_primary: true }] : [];
    images.forEach((img, i) => {
      assets.push({
        id: `${p.id}-img-${i}`,
        url: img.image_url,
        productId: p.id,
        source: 'product_gallery',
        galleryIndex: i,
        filename: filenameOf(img.image_url),
        alt: p.title,
        width: i === 0 ? 1400 : 1200,
        height: i === 0 ? 1750 : 1200,
      });
    });
  }
  for (const c of catalog.collections) {
    if (!c.image_url) continue;
    assets.push({
      id: `${c.id}-cover`,
      url: c.image_url,
      collectionId: c.id,
      source: 'collection',
      filename: filenameOf(c.image_url),
      width: 800,
      height: 1000,
    });
  }
  if (catalog.heroImage) {
    assets.push({
      id: `${catalog.id}-hero`,
      url: catalog.heroImage,
      source: 'hero',
      filename: filenameOf(catalog.heroImage),
      width: 1600,
      height: 900,
    });
  }
  if (catalog.storyImage) {
    assets.push({
      id: `${catalog.id}-story`,
      url: catalog.storyImage,
      source: 'story',
      filename: filenameOf(catalog.storyImage),
      width: 1400,
      height: 900,
    });
  }

  return {
    id: catalog.id,
    merchant: {
      storeName: catalog.storeName,
      tagline: catalog.tagline,
      description: catalog.tagline,
    },
    products: catalog.products.map((p, i) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      price: p.price,
      originalPrice: p.original_price,
      category: p.category,
      collectionIds: p.collection_ids || [],
      sku: p.sku,
      stock: p.stock,
      position: i,
      imageUrl: p.image,
    })),
    collections: catalog.collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || undefined,
      imageUrl: c.image_url || undefined,
    })),
    assets,
    reviews: (catalog.reviews || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment || '',
      productId: r.product_id || undefined,
    })),
    ...extras,
  };
}
