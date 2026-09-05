import type {
  ArchetypeResult,
  CatalogProfile,
  ChapterEligibility,
  ClaimRecord,
  ClassifiedAsset,
  IntelligenceInput,
  NarrativePurpose,
} from './types';
import { assetsOwnedBy } from './assets';
import { roundConfidence } from './stable';

function eligible(
  purpose: NarrativePurpose,
  ok: boolean,
  confidence: number,
  required: string[],
  available: string[],
  productIds: string[],
  assetIds: string[],
  fallback: NarrativePurpose | null,
  reason: string,
  copyFingerprint: string | null = null
): ChapterEligibility {
  return {
    purpose,
    eligible: ok,
    confidence: roundConfidence(confidence),
    requiredEvidence: required,
    availableEvidence: available,
    missingEvidence: required.filter((r) => !available.includes(r)),
    assignedProductIds: productIds,
    assignedAssetIds: assetIds,
    fallback,
    reason,
    copyFingerprint,
  };
}

function fingerprint(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
}

export function evaluateNarrative(opts: {
  input: IntelligenceInput;
  catalog: CatalogProfile;
  assets: ClassifiedAsset[];
  claims: ClaimRecord[];
  archetype: ArchetypeResult;
}): ChapterEligibility[] {
  const { input, catalog, assets, claims, archetype } = opts;
  const primaryId = catalog.primaryProductId;
  const primary = input.products.find((p) => p.id === primaryId) || null;
  const owned = primaryId ? assetsOwnedBy(assets, primaryId) : [];
  const packshots = owned.filter((a) => a.role === 'product_packshot' || a.role === 'hero_product' || a.role === 'product_detail');
  const lifestyle = owned.filter((a) => a.role === 'hero_lifestyle' || a.role === 'product_lifestyle');
  const material = owned.filter((a) => a.role === 'material_detail' && a.roleConfidence >= 0.55);
  const process = owned.filter((a) => a.role === 'process' && a.roleConfidence >= 0.55);
  const usage = owned.filter((a) => a.role === 'product_lifestyle' || (a.role === 'hero_lifestyle' && a.roleConfidence >= 0.55));
  const brand = assets.filter((a) => (a.role === 'brand_story' || a.role === 'founder_or_team') && !a.productId);
  const artisan = claims.some((c) => c.kind === 'handmade_artisan' && c.allowed);

  const out: ChapterEligibility[] = [];

  out.push(
    eligible(
      'chrome',
      true,
      0.99,
      ['store_name'],
      input.merchant.storeName ? ['store_name'] : [],
      [],
      [],
      null,
      'Navigation and footer are always eligible.'
    )
  );

  if (primary) {
    const introAssets = packshots.slice(0, 1).map((a) => a.id);
    out.push(
      eligible(
        'product_introduction',
        introAssets.length > 0 || Boolean(primary.imageUrl),
        catalog.primaryConfidence,
        ['primary_product', 'owned_image'],
        [primaryId ? 'primary_product' : '', introAssets.length || primary.imageUrl ? 'owned_image' : ''].filter(Boolean),
        [primary.id],
        introAssets,
        'product_discovery',
        introAssets.length || primary.imageUrl
          ? `Introduce ${primary.title} with owned imagery.`
          : 'Primary product lacks an owned image.',
        fingerprint(primary.description || primary.title)
      )
    );
    const sentences = (primary.description || '')
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20);
    const introFp = fingerprint(primary.description || '');
    const tagFacts = (primary.tags || []).map((t) => t.toLowerCase()).filter((t) => t && !introFp.includes(t));
    const distinctFeatureCopy = sentences.length >= 2 ? fingerprint(sentences[1]) : tagFacts.length >= 2 ? fingerprint(tagFacts.join(' ')) : '';
    const featureOk = Boolean(distinctFeatureCopy) && distinctFeatureCopy !== introFp;
    out.push(
      eligible(
        'feature',
        featureOk,
        featureOk ? 0.7 : 0.18,
        ['distinct_feature_copy'],
        featureOk ? ['distinct_feature_copy'] : [],
        [primary.id],
        packshots.slice(0, 1).map((a) => a.id),
        'product_discovery',
        featureOk
          ? 'Feature chapter uses distinct facts, not a repeated product description.'
          : 'Feature omitted: it would only repeat the product introduction copy.',
        featureOk ? distinctFeatureCopy : introFp
      )
    );
  } else {
    out.push(eligible('product_introduction', false, 0, ['primary_product'], [], [], [], 'product_discovery', 'No primary product.'));
    out.push(eligible('feature', false, 0, ['product_description'], [], [], [], 'product_discovery', 'No primary product.'));
  }

  const formAssets = owned.filter((a) => a.permittedPlacements.includes('form_design') && a.productId === primaryId);
  out.push(
    eligible(
      'form_design',
      Boolean(primary) && formAssets.some((a) => a.role === 'product_detail' || a.role === 'material_detail') && formAssets.every((a) => a.productId === primaryId),
      formAssets.some((a) => a.role === 'product_detail') ? 0.7 : 0.15,
      ['owned_detail_or_material'],
      formAssets.some((a) => a.role === 'product_detail' || a.role === 'material_detail') ? ['owned_detail_or_material'] : [],
      primaryId ? [primaryId] : [],
      formAssets.filter((a) => a.role === 'product_detail' || a.role === 'material_detail').map((a) => a.id),
      'feature',
      formAssets.some((a) => a.role === 'product_detail' || a.role === 'material_detail')
        ? 'Owned detail/material assets can support Form.'
        : 'Form omitted: no owned detail or material evidence for the primary product.'
    )
  );

  out.push(
    eligible(
      'material',
      material.length > 0 && Boolean(primary),
      material[0] ? material[0].roleConfidence : 0.1,
      ['owned_material_asset'],
      material.length ? ['owned_material_asset'] : [],
      primaryId ? [primaryId] : [],
      material.map((a) => a.id),
      'feature',
      material.length ? 'Material chapter uses owned material assets only.' : 'Material omitted: no matching material asset on the primary product.'
    )
  );

  out.push(
    eligible(
      'process_making',
      process.length > 0 && artisan,
      process.length && artisan ? 0.75 : 0.08,
      ['owned_process_asset', 'artisan_or_process_claim'],
      [process.length ? 'owned_process_asset' : '', artisan ? 'artisan_or_process_claim' : ''].filter(Boolean),
      primaryId ? [primaryId] : [],
      process.map((a) => a.id),
      'feature',
      process.length && artisan
        ? 'Process chapter supported by owned process assets and merchant/product claims.'
        : 'Process omitted: missing owned process imagery and/or artisan claim.'
    )
  );

  out.push(
    eligible(
      'usage',
      usage.length > 0 && Boolean(primary),
      usage[0] ? usage[0].roleConfidence : 0.1,
      ['owned_usage_or_lifestyle_asset'],
      usage.length ? ['owned_usage_or_lifestyle_asset'] : [],
      primaryId ? [primaryId] : [],
      usage.map((a) => a.id),
      'product_discovery',
      usage.length
        ? 'Usage uses lifestyle assets owned by the primary product.'
        : 'Usage omitted: no owned lifestyle/usage asset. Other products cannot stand in.',
      usage.length ? usage.map((a) => a.id).sort().join(',') : null
    )
  );

  const lifestyleOk = lifestyle.length > 0;
  out.push(
    eligible(
      'lifestyle',
      lifestyleOk,
      lifestyleOk ? 0.68 : 0.12,
      ['owned_lifestyle_asset'],
      lifestyleOk ? ['owned_lifestyle_asset'] : [],
      primaryId ? [primaryId] : [],
      lifestyle.map((a) => a.id),
      'product_discovery',
      lifestyleOk ? 'Lifestyle chapter uses owned campaign/lifestyle frames.' : 'Lifestyle omitted: packshots cannot pretend to be lifestyle.',
      lifestyle.map((a) => a.id).sort().join(',') || null
    )
  );

  const collectionOk = input.collections.length > 0 && input.products.length >= 3;
  out.push(
    eligible(
      'collection',
      collectionOk,
      collectionOk ? 0.8 : 0.25,
      ['collections', 'multiple_products'],
      [input.collections.length ? 'collections' : '', input.products.length >= 3 ? 'multiple_products' : ''].filter(Boolean),
      catalog.supportingProductIds,
      assets.filter((a) => a.role === 'collection' || a.source === 'collection').map((a) => a.id),
      'product_discovery',
      collectionOk ? 'Collection navigation is supported.' : 'Not enough catalog structure for a collection chapter.'
    )
  );

  const compareOk =
    Boolean(primary) &&
    catalog.supportingProductIds.some((id) => {
      const p = input.products.find((x) => x.id === id);
      return p && p.category === primary?.category && id !== primary.id;
    });
  out.push(
    eligible(
      'comparison',
      compareOk && archetype.archetype === 'technology_product',
      compareOk ? 0.6 : 0.1,
      ['same_category_supporting_product'],
      compareOk ? ['same_category_supporting_product'] : [],
      compareOk ? [primaryId!, catalog.supportingProductIds.find((id) => input.products.find((p) => p.id === id)?.category === primary?.category)!] : [],
      [],
      'product_discovery',
      compareOk && archetype.archetype === 'technology_product'
        ? 'Same-category supporting product can compare without mixing unrelated goods.'
        : 'Comparison skipped (needs same-category products and a technical catalog).'
    )
  );

  const reviews = input.reviews || [];
  out.push(
    eligible(
      'trust',
      reviews.length > 0,
      reviews.length ? 0.7 : 0.15,
      ['reviews'],
      reviews.length ? ['reviews'] : [],
      reviews.map((r) => r.productId).filter(Boolean) as string[],
      [],
      null,
      reviews.length ? 'Reviews can support a trust chapter.' : 'No reviews for a trust chapter.'
    )
  );

  const brandCopy = Boolean(input.merchant.description && input.merchant.description.length > 40);
  out.push(
    eligible(
      'brand_story',
      brandCopy && (brand.length > 0 || artisan),
      brandCopy && brand.length ? 0.65 : 0.2,
      ['merchant_description', 'brand_level_or_artisan_asset'],
      [brandCopy ? 'merchant_description' : '', brand.length || artisan ? 'brand_level_or_artisan_asset' : ''].filter(Boolean),
      [],
      brand.map((a) => a.id),
      'product_discovery',
      brandCopy && (brand.length || artisan)
        ? 'Brand story has merchant copy plus brand-level or artisan evidence.'
        : 'Brand story omitted: no brand-level assets and no artisan evidence.'
    )
  );

  out.push(
    eligible(
      'product_discovery',
      input.products.length >= 2,
      input.products.length >= 2 ? 0.9 : 0.4,
      ['multiple_products'],
      input.products.length >= 2 ? ['multiple_products'] : [],
      catalog.supportingProductIds,
      [],
      null,
      input.products.length >= 2 ? 'Discovery rail/grid is a safe commerce chapter.' : 'Single-product store: discovery is optional.'
    )
  );

  const usageRow = out.find((r) => r.purpose === 'usage');
  const lifeRow = out.find((r) => r.purpose === 'lifestyle');
  if (
    usageRow &&
    lifeRow &&
    usageRow.eligible &&
    lifeRow.eligible &&
    usageRow.copyFingerprint &&
    usageRow.copyFingerprint === lifeRow.copyFingerprint
  ) {
    usageRow.eligible = false;
    usageRow.reason = 'Usage omitted: it would repeat the lifestyle chapter’s assets and purpose.';
    usageRow.fallback = 'lifestyle';
  }

  return out;
}
