import type { ClassifiedAsset, IntelligenceWarning, IntelligenceWarningCode, OwnershipViolation } from './types';

export function validateOwnership(
  assets: ClassifiedAsset[],
  primaryProductId: string | null,
  naive?: { formAssetProductId: string | null; makeAssetProductId: string | null; useAssetProductId: string | null }
): { violations: OwnershipViolation[]; warnings: IntelligenceWarning[] } {
  const violations: OwnershipViolation[] = [];
  const warnings: IntelligenceWarning[] = [];

  if (naive && primaryProductId) {
    const check = (slot: string, otherId: string | null, code: IntelligenceWarningCode) => {
      if (otherId && otherId !== primaryProductId) {
        violations.push({
          code,
          assetId: slot,
          productId: otherId,
          expectedProductId: primaryProductId,
          message: `Naive ${slot} assigns product ${otherId} to primary ${primaryProductId}.`,
        });
        warnings.push({
          code,
          message: `Cross-product story asset in ${slot}: ${otherId} ≠ ${primaryProductId}`,
          productIds: [primaryProductId, otherId],
        });
      }
    };
    check('form', naive.formAssetProductId, 'cross_product_story_asset');
    check('make', naive.makeAssetProductId, 'cross_product_story_asset');
    check('use', naive.useAssetProductId, 'cross_product_story_asset');
  }

  for (const a of assets) {
    if (a.role === 'process' && a.productId && primaryProductId && a.productId !== primaryProductId) {
      warnings.push({
        code: 'unsupported_process_story',
        message: `Process asset ${a.id} belongs to ${a.productId}, not primary ${primaryProductId}.`,
        assetIds: [a.id],
        productIds: [a.productId],
      });
    }
    if (a.resolutionSuitability === 'thumb_only' || a.resolutionSuitability === 'contained') {
      if (a.resolutionSuitability === 'thumb_only') {
        warnings.push({
          code: 'low_resolution_for_full_bleed',
          message: `Asset ${a.id} is too small for full-bleed (${a.width}x${a.height}).`,
          assetIds: [a.id],
        });
      }
    }
  }

  const urlCounts = new Map<string, string[]>();
  for (const a of assets) {
    const list = urlCounts.get(a.url) || [];
    list.push(a.id);
    urlCounts.set(a.url, list);
  }
  for (const [, ids] of urlCounts) {
    if (ids.length > 2) {
      warnings.push({
        code: 'duplicate_asset_overuse',
        message: `Image reused ${ids.length} times.`,
        assetIds: ids,
      });
    }
  }

  return { violations, warnings };
}

export function assetBelongsToProduct(asset: ClassifiedAsset, productId: string): boolean {
  return asset.productId === productId;
}
