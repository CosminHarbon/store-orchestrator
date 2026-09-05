import type { CatalogProfile, CatalogShape, ClassifiedAsset, Evidence, IntelligenceInput } from './types';
import { roundConfidence } from './stable';

function shape(count: number, categories: number): CatalogShape {
  if (count <= 1) return 'single_product';
  if (count <= 8 && categories <= 3) return 'focused_collection';
  return 'broad_catalog';
}

export function profileCatalog(input: IntelligenceInput, assets: ClassifiedAsset[]): CatalogProfile {
  const products = input.products;
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  const collections = input.collections.map((c) => c.name);
  const distMap = new Map<string, number>();
  for (const p of products) {
    const key = p.category || 'Uncategorized';
    distMap.set(key, (distMap.get(key) || 0) + 1);
  }
  const categoryDistribution = [...distMap.entries()]
    .map(([category, count]) => ({ category, count, share: roundConfidence(count / Math.max(1, products.length)) }))
    .sort((a, b) => b.count - a.count);
  const dominantCategory = categoryDistribution[0]?.category || null;
  const prices = products.map((p) => p.price).filter((n) => n > 0);
  const described = products.filter((p) => (p.description || '').trim().length >= 20).length;
  const withImage = products.filter((p) => {
    if (p.imageUrl) return true;
    return assets.some((a) => a.productId === p.id);
  }).length;
  const variantDensity = products.reduce((sum, p) => sum + (p.variantCount || 0), 0) / Math.max(1, products.length);

  const productsLackingImagery = products
    .filter((p) => !p.imageUrl && !assets.some((a) => a.productId === p.id))
    .map((p) => p.id);

  const visuallyInconsistentProductIds: string[] = [];

  const scored = products.map((p, index) => {
    const owned = assets.filter((a) => a.productId === p.id);
    const evidence: Evidence[] = [];
    let score = 0;
    if (input.merchant.featuredProductId === p.id || p.featured) {
      score += 8;
      evidence.push({ provider: 'structured_metadata', signal: 'explicitly_featured', weight: 0.9 });
    }
    if (index === 0 || p.position === 0) {
      score += 3;
      evidence.push({ provider: 'structured_metadata', signal: 'collection_position', weight: 0.45 });
    }
    if ((p.description || '').trim().length >= 24) {
      score += 2;
      evidence.push({ provider: 'structured_metadata', signal: 'complete_description', weight: 0.4 });
    }
    if (p.title && !/^item\s*\d+/i.test(p.title) && p.title.length > 2) {
      score += 1;
      evidence.push({ provider: 'structured_metadata', signal: 'titled', weight: 0.25 });
    }
    if ((p.stock || 0) > 0 && p.active !== false) {
      score += 1;
      evidence.push({ provider: 'structured_metadata', signal: 'in_stock', weight: 0.25 });
    }
    const bleed = owned.filter((a) => a.resolutionSuitability === 'full_bleed').length;
    const variety = owned.length;
    score += Math.min(4, variety);
    score += Math.min(3, bleed);
    if (variety) evidence.push({ provider: 'structured_metadata', signal: `owned_assets:${variety}`, weight: 0.4 });
    if (bleed) evidence.push({ provider: 'dimensions', signal: `full_bleed_assets:${bleed}`, weight: 0.45 });
    if (dominantCategory && p.category === dominantCategory) score += 1;
    if (owned.some((a) => a.resolutionSuitability === 'thumb_only') && owned.length === 1) {
      visuallyInconsistentProductIds.push(p.id);
    }
    return { p, score, evidence, owned };
  });

  scored.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
  const primary = scored[0] || null;
  const second = scored[1] || null;

  const onlyCandidate = products.length === 1 || scored.filter((s) => s.owned.length > 0 || s.p.imageUrl).length === 1;
  const featured = Boolean(primary && (input.merchant.featuredProductId === primary.p.id || primary.p.featured));
  const gap = primary && second ? primary.score / Math.max(1, second.score) : featured ? 2 : 1;
  const othersWithImagery = scored.filter(
    (s) => s.p.id !== primary?.p.id && (s.owned.length > 0 || Boolean(s.p.imageUrl))
  ).length;
  const peerCollection = products.length >= 3 && !featured && othersWithImagery >= 2;
  const primaryDescribed = Boolean(primary && (primary.p.description || '').trim().length >= 24);
  const isDominantProduct =
    Boolean(primary) && (featured || (products.length > 1 && gap >= 1.45 && !peerCollection && primaryDescribed));

  let selectionConfidence = 0;
  if (!primary) selectionConfidence = 0;
  else if (onlyCandidate) selectionConfidence = 0.95;
  else if (featured) selectionConfidence = roundConfidence(Math.min(0.93, 0.7 + gap * 0.1));
  else if (gap >= 1.45) selectionConfidence = roundConfidence(Math.min(0.86, 0.55 + (gap - 1) * 0.2));
  else selectionConfidence = roundConfidence(Math.min(0.62, 0.4 + (gap - 1) * 0.15));

  const owned = primary?.owned || [];
  const strongImage = owned.some((a) => a.resolutionSuitability === 'full_bleed' || a.resolutionSuitability === 'contained');
  const realTitle = Boolean(primary && primary.p.title && !/^item\s*\d+/i.test(primary.p.title));
  const descLen = (primary?.p.description || '').trim().length;
  const lifestyleOrDetail = owned.some((a) =>
    ['hero_lifestyle', 'product_lifestyle', 'product_detail', 'material_detail', 'process'].includes(a.role)
  );

  const heroSuitability = !primary
    ? 0
    : roundConfidence(
        (strongImage ? 0.4 : 0) +
          (owned.some((a) => a.resolutionSuitability === 'full_bleed') ? 0.2 : 0) +
          (realTitle ? 0.15 : 0) +
          (descLen >= 24 ? 0.15 : 0) +
          (owned.filter((a) => a.resolutionSuitability === 'thumb_only').length === owned.length && owned.length ? -0.35 : 0) +
          0.1
      );

  const narrativeSuitability = !primary
    ? 0
    : roundConfidence(
        (descLen >= 48 ? 0.35 : descLen >= 24 ? 0.18 : 0) +
          (lifestyleOrDetail ? 0.35 : 0) +
          ((primary.p.tags || []).length >= 2 ? 0.15 : 0) +
          (featured ? 0.1 : 0)
      );

  const completenessParts = primary
    ? [
        Boolean(primary.p.title && !/^item\s*\d+/i.test(primary.p.title)),
        descLen >= 24,
        Boolean(primary.p.category),
        owned.length > 0 || Boolean(primary.p.imageUrl),
        primary.p.price > 0,
        (primary.p.tags || []).length > 0,
      ]
    : [];
  const evidenceCompleteness = completenessParts.length
    ? roundConfidence(completenessParts.filter(Boolean).length / completenessParts.length)
    : 0;

  const supportingProductIds = scored
    .slice(1)
    .filter((s) => s.p.id !== primary?.p.id)
    .slice(0, 5)
    .map((s) => s.p.id);

  const heroCandidateIds = scored.filter((s) => s.score >= (primary?.score || 0) * 0.7).map((s) => s.p.id);

  const editorialStorySupport =
    described / Math.max(1, products.length) >= 0.6 &&
    assets.some((a) => a.role === 'hero_lifestyle' || a.role === 'product_lifestyle' || a.role === 'brand_story') &&
    products.length <= 10 &&
    shape(products.length, categories.length) !== 'broad_catalog';

  let productDepth: CatalogProfile['productDepth'] = 'adequate';
  if (described / Math.max(1, products.length) < 0.35 || products.length <= 1) productDepth = 'sparse';
  if (described === products.length && assets.filter((a) => a.productId).length >= products.length * 1.5) {
    productDepth = 'rich';
  }

  return {
    totalProducts: products.length,
    categories,
    collections,
    dominantCategory,
    categoryDistribution,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    productDepth,
    variantDensity: roundConfidence(variantDensity),
    imageCoverage: roundConfidence(withImage / Math.max(1, products.length)),
    catalogShape: shape(products.length, categories.length),
    editorialStorySupport,
    primaryProductId: primary?.p.id || null,
    primaryConfidence: selectionConfidence,
    selectionConfidence,
    heroSuitability: Math.max(0, Math.min(1, heroSuitability)),
    narrativeSuitability: Math.max(0, Math.min(1, narrativeSuitability)),
    evidenceCompleteness,
    isDominantProduct,
    primaryEvidence: primary?.evidence || [],
    supportingProductIds,
    heroCandidateIds,
    productsLackingImagery,
    visuallyInconsistentProductIds,
  };
}
