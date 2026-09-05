import type {
  AssetRole,
  ClassifiedAsset,
  Evidence,
  IntelligenceAssetInput,
  IntelligenceInput,
  NarrativePurpose,
} from './types';
import { roundConfidence } from './stable';

const ROLE_KEYWORDS: Array<{ role: AssetRole; words: string[]; weight: number }> = [
  { role: 'process', words: ['process', 'workshop', 'atelier', 'making', 'factory', 'craft', 'artisan', 'bench', 'loom'], weight: 0.85 },
  { role: 'material_detail', words: ['material', 'leather', 'grain', 'fabric', 'texture', 'wool', 'cotton', 'ceramic', 'metal', 'wood-grain'], weight: 0.8 },
  { role: 'product_detail', words: ['detail', 'macro', 'closeup', 'close-up', 'hardware', 'stitch', 'seam', 'button'], weight: 0.75 },
  { role: 'hero_lifestyle', words: ['campaign', 'editorial', 'billboard'], weight: 0.8 },
  { role: 'product_lifestyle', words: ['lifestyle', 'worn', 'street', 'outfit', 'look'], weight: 0.72 },
  { role: 'founder_or_team', words: ['founder', 'team', 'portrait', 'maker'], weight: 0.8 },
  { role: 'interior_or_environment', words: ['interior', 'room', 'environment', 'kitchen', 'studio-set'], weight: 0.7 },
  { role: 'collection', words: ['collection', 'group', 'grid', 'lineup'], weight: 0.65 },
  { role: 'brand_story', words: ['brand', 'story', 'origin-story'], weight: 0.6 },
  { role: 'texture_or_background', words: ['background', 'paper', 'backdrop', 'texture-bg'], weight: 0.55 },
  { role: 'product_packshot', words: ['packshot', 'pack-shot', 'cutout', 'white-bg', 'studio', 'product-shot'], weight: 0.8 },
  { role: 'hero_product', words: ['hero', 'flagship', 'monument'], weight: 0.7 },
];

const STORY_PLACEMENTS: NarrativePurpose[] = ['form_design', 'material', 'process_making', 'usage', 'lifestyle', 'brand_story'];

function aspect(width?: number, height?: number): number | null {
  if (!width || !height || height <= 0) return null;
  return Math.round((width / height) * 1000) / 1000;
}

function resolutionSuitability(width?: number, height?: number): ClassifiedAsset['resolutionSuitability'] {
  if (!width || !height) return 'unknown';
  const min = Math.min(width, height);
  const max = Math.max(width, height);
  if (max < 600 || min < 400) return 'thumb_only';
  if (max < 1200) return 'contained';
  return 'full_bleed';
}

function placementsFor(role: AssetRole, owned: boolean): { permitted: NarrativePurpose[]; prohibited: NarrativePurpose[] } {
  const commerce: NarrativePurpose[] = ['product_introduction', 'feature', 'product_discovery', 'collection', 'chrome', 'trust'];
  if (role === 'unknown') {
    return { permitted: [...commerce], prohibited: [...STORY_PLACEMENTS] };
  }
  if (role === 'process') {
    return {
      permitted: owned ? ['process_making', 'brand_story', 'feature'] : ['product_discovery'],
      prohibited: owned ? [] : [...STORY_PLACEMENTS],
    };
  }
  if (role === 'material_detail') {
    return {
      permitted: owned ? ['material', 'form_design', 'feature'] : ['product_discovery'],
      prohibited: owned ? ['process_making'] : [...STORY_PLACEMENTS],
    };
  }
  if (role === 'hero_lifestyle' || role === 'product_lifestyle') {
    return {
      permitted: owned ? ['lifestyle', 'usage', 'product_introduction', 'feature'] : ['collection', 'product_discovery'],
      prohibited: ['process_making', 'material'],
    };
  }
  if (role === 'product_packshot' || role === 'hero_product' || role === 'product_detail') {
    return {
      permitted: owned ? ['product_introduction', 'feature', 'form_design', 'product_discovery', 'comparison'] : ['product_discovery', 'collection'],
      prohibited: ['process_making', 'brand_story'],
    };
  }
  if (role === 'collection') {
    return { permitted: ['collection', 'product_discovery'], prohibited: ['process_making', 'material', 'usage'] };
  }
  if (role === 'brand_story' || role === 'founder_or_team') {
    return { permitted: ['brand_story', 'trust'], prohibited: ['form_design', 'material', 'process_making', 'usage'] };
  }
  if (role === 'interior_or_environment' || role === 'texture_or_background' || role === 'decorative') {
    return { permitted: ['chrome', 'lifestyle', 'brand_story'], prohibited: ['form_design', 'material', 'process_making', 'usage'] };
  }
  return { permitted: [...commerce], prohibited: [...STORY_PLACEMENTS] };
}

function matchKeywords(text: string, provider: Evidence['provider']): { role: AssetRole; evidence: Evidence[] } | null {
  for (const row of ROLE_KEYWORDS) {
    const hit = row.words.find((w) => text.includes(w));
    if (hit) {
      return {
        role: row.role,
        evidence: [{ provider, signal: `keyword:${hit}`, weight: row.weight }],
      };
    }
  }
  return null;
}

const FILENAME_ROLE_CEILING = 0.45;
const GALLERY_PACKSHOT_CEILING = 0.4;

/**
 * Conservative role inference. Unknown stays unknown when evidence is weak.
 * `vision_classifier` is a reserved provider and is never invoked here.
 * Filename-only role inference is capped; ownership is scored separately from role.
 */
export function classifyAsset(asset: IntelligenceAssetInput): ClassifiedAsset {
  const evidence: Evidence[] = [];
  let role: AssetRole = 'unknown';
  let roleConfidence = 0.12;
  let strongestProvider: Evidence['provider'] | null = null;

  if (asset.existingRole && (ASSET_ROLE_SET as Set<string>).has(asset.existingRole)) {
    role = asset.existingRole as AssetRole;
    roleConfidence = 0.82;
    strongestProvider = 'existing_asset_plan';
    evidence.push({ provider: 'existing_asset_plan', signal: `role:${asset.existingRole}`, weight: 0.82 });
  }

  const tagged = (asset.merchantTags || []).map((t) => t.toLowerCase());
  const tagHit = ROLE_KEYWORDS.find((row) => row.words.some((w) => tagged.includes(w) || tagged.includes(row.role)));
  if (tagHit) {
    role = tagHit.role;
    roleConfidence = Math.max(roleConfidence, 0.78);
    strongestProvider = 'merchant_tag';
    evidence.push({ provider: 'merchant_tag', signal: `tag:${tagHit.role}`, weight: 0.78 });
  }

  const filenameText = (asset.filename || '').toLowerCase();
  const altText = [asset.alt, asset.caption].filter(Boolean).join(' ').toLowerCase();
  const fileHit = matchKeywords(filenameText, 'filename');
  const altHit = matchKeywords(altText, 'structured_metadata');

  if (fileHit && role === 'unknown') {
    role = fileHit.role;
    roleConfidence = Math.min(fileHit.evidence[0].weight, FILENAME_ROLE_CEILING);
    strongestProvider = 'filename';
    evidence.push(...fileHit.evidence.map((e) => ({ ...e, weight: Math.min(e.weight, FILENAME_ROLE_CEILING) })));
  } else if (fileHit) {
    evidence.push(...fileHit.evidence.map((e) => ({ ...e, weight: Math.min(e.weight, FILENAME_ROLE_CEILING) })));
  }

  if (altHit && role === 'unknown') {
    role = altHit.role;
    roleConfidence = Math.min(altHit.evidence[0].weight, 0.55);
    strongestProvider = 'structured_metadata';
    evidence.push(...altHit.evidence);
  } else if (altHit) {
    evidence.push(...altHit.evidence);
  }

  if (asset.productId && (asset.galleryIndex ?? 0) === 0 && role === 'unknown') {
    role = 'product_packshot';
    roleConfidence = GALLERY_PACKSHOT_CEILING;
    strongestProvider = 'structured_metadata';
    evidence.push({ provider: 'structured_metadata', signal: 'primary_gallery_image', weight: GALLERY_PACKSHOT_CEILING });
  } else if (asset.productId && role === 'unknown') {
    evidence.push({ provider: 'structured_metadata', signal: `owned_by:${asset.productId}`, weight: 0.3 });
  }

  if (asset.source === 'hero' && role === 'unknown') {
    role = 'hero_product';
    roleConfidence = 0.4;
    strongestProvider = 'structured_metadata';
    evidence.push({ provider: 'structured_metadata', signal: 'source:hero', weight: 0.4 });
  }
  if (asset.source === 'collection') {
    evidence.push({ provider: 'structured_metadata', signal: 'source:collection', weight: 0.4 });
    if (role === 'unknown') {
      role = 'collection';
      roleConfidence = 0.5;
      strongestProvider = 'structured_metadata';
    }
  }

  if (strongestProvider === 'filename') {
    roleConfidence = Math.min(roleConfidence, FILENAME_ROLE_CEILING);
  }

  const ratio = aspect(asset.width, asset.height);
  const suitability = resolutionSuitability(asset.width, asset.height);
  if (asset.width && asset.height) {
    evidence.push({
      provider: 'dimensions',
      signal: `${asset.width}x${asset.height}:${suitability}`,
      weight: suitability === 'full_bleed' ? 0.35 : 0.2,
    });
  }

  if (roleConfidence < 0.35 && role !== 'product_packshot' && role !== 'collection' && role !== 'hero_product') {
    role = 'unknown';
    roleConfidence = Math.min(roleConfidence, 0.28);
  }

  const owned = Boolean(asset.productId);
  const ownershipConfidence = owned
    ? asset.source === 'product_gallery' || asset.galleryIndex != null
      ? 0.92
      : 0.8
    : asset.source === 'brand' || asset.source === 'story'
      ? 0.55
      : 0.15;

  const { permitted, prohibited } = placementsFor(role, owned);
  const placementSuitability: ClassifiedAsset['placementSuitability'] = {};
  for (const p of permitted) {
    const res =
      p === 'lifestyle' || p === 'usage' || p === 'product_introduction'
        ? suitability === 'full_bleed'
          ? 0.85
          : suitability === 'contained'
            ? 0.55
            : 0.2
        : 0.7;
    placementSuitability[p] = roundConfidence(res * roleConfidence);
  }
  for (const p of prohibited) placementSuitability[p] = 0;

  return {
    id: asset.id,
    url: asset.url,
    role,
    roleConfidence: roundConfidence(roleConfidence),
    ownershipConfidence: roundConfidence(ownershipConfidence),
    placementSuitability,
    productId: asset.productId ?? null,
    collectionId: asset.collectionId ?? null,
    source: asset.source,
    width: asset.width ?? null,
    height: asset.height ?? null,
    aspectRatio: ratio,
    resolutionSuitability: suitability,
    evidence,
    permittedPlacements: permitted,
    prohibitedPlacements: prohibited,
    reuseAllowed: role === 'texture_or_background' || role === 'decorative' || role === 'collection',
    containsReadableText: asset.containsReadableText ?? null,
    filename: asset.filename || null,
    alt: asset.alt || null,
  };
}

const ASSET_ROLE_SET = new Set([
  'hero_lifestyle',
  'hero_product',
  'product_packshot',
  'product_lifestyle',
  'product_detail',
  'material_detail',
  'process',
  'collection',
  'brand_story',
  'founder_or_team',
  'interior_or_environment',
  'texture_or_background',
  'decorative',
  'unknown',
]);

export function classifyAssets(input: IntelligenceInput): ClassifiedAsset[] {
  return input.assets.map(classifyAsset);
}

export function assetsOwnedBy(assets: ClassifiedAsset[], productId: string): ClassifiedAsset[] {
  return assets.filter((a) => a.productId === productId);
}

export function fullBleedEligible(asset: ClassifiedAsset): boolean {
  return asset.resolutionSuitability === 'full_bleed';
}
