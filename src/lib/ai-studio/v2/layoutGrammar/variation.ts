import type { LayoutGrammarId, ResolvedVariation, HeroGeometry, MediaCrop } from './types';
import { normalizeSeed, rngFromSeed, pick } from './seed';

type AxisPool = {
  heroGeometry: HeroGeometry[];
  mediaSide: Array<'left' | 'right'>;
  gridRatio: Array<ResolvedVariation['gridRatio']>;
  overlap: Array<ResolvedVariation['overlap']>;
  contentWidth: Array<ResolvedVariation['contentWidth']>;
  rhythm: Array<ResolvedVariation['rhythm']>;
  density: Array<ResolvedVariation['density']>;
  productEmphasis: Array<ResolvedVariation['productEmphasis']>;
  surfaceSequence: Array<ResolvedVariation['surfaceSequence']>;
  typeScale: Array<ResolvedVariation['typeScale']>;
  crop: MediaCrop[];
  nav: Array<ResolvedVariation['nav']>;
  mobileHero: Array<ResolvedVariation['mobileHero']>;
  grouping: Array<ResolvedVariation['grouping']>;
};

const POOLS: Record<LayoutGrammarId, AxisPool> = {
  editorial_asymmetric: {
    heroGeometry: ['offset_editorial_split', 'hanging_media', 'type_first_crop'],
    mediaSide: ['left', 'right'],
    gridRatio: ['5-7', '4-8', '7-5'],
    overlap: ['modest', 'pronounced'],
    contentWidth: ['narrow', 'standard'],
    rhythm: ['sparse', 'medium'],
    density: ['low', 'medium'],
    productEmphasis: ['single', 'mixed'],
    surfaceSequence: ['paper', 'alternating'],
    typeScale: ['quiet', 'standard'],
    crop: ['left', 'center', 'right'],
    nav: ['minimal', 'solid'],
    mobileHero: ['crop_first', 'stacked'],
    grouping: ['paired', 'canvas'],
  },
  cinematic_full_bleed: {
    heroGeometry: ['full_bleed_campaign', 'layered_scrim', 'cinematic_letterbox'],
    mediaSide: ['left', 'right'],
    gridRatio: ['8-4', '7-5'],
    overlap: ['modest', 'pronounced'],
    contentWidth: ['bleed', 'wide'],
    rhythm: ['sparse', 'medium'],
    density: ['low', 'medium'],
    productEmphasis: ['single', 'mixed'],
    surfaceSequence: ['ink_led', 'alternating'],
    typeScale: ['standard', 'loud'],
    crop: ['center', 'top', 'left'],
    nav: ['overlay', 'minimal'],
    mobileHero: ['overlay', 'stacked'],
    grouping: ['canvas', 'isolated'],
  },
  product_monument: {
    heroGeometry: ['product_artifact_stage', 'product_overlap_rail', 'quiet_luxury_minimal'],
    mediaSide: ['left', 'right'],
    gridRatio: ['8-4', '7-5', '6-6'],
    overlap: ['none', 'modest'],
    contentWidth: ['standard', 'wide'],
    rhythm: ['sparse', 'medium'],
    density: ['low'],
    productEmphasis: ['single'],
    surfaceSequence: ['paper', 'alternating'],
    typeScale: ['quiet', 'standard'],
    crop: ['center', 'top'],
    nav: ['minimal', 'solid'],
    mobileHero: ['stacked', 'crop_first'],
    grouping: ['isolated', 'paired'],
  },
  typographic_campaign: {
    heroGeometry: ['display_collision', 'type_led_corner_media', 'campaign_stack'],
    mediaSide: ['left', 'right'],
    gridRatio: ['7-5', '5-7', '6-6'],
    overlap: ['pronounced', 'modest'],
    contentWidth: ['wide', 'bleed'],
    rhythm: ['dense', 'medium'],
    density: ['medium', 'high'],
    productEmphasis: ['mixed', 'dense'],
    surfaceSequence: ['ink_led', 'alternating'],
    typeScale: ['loud'],
    crop: ['left', 'right', 'center'],
    nav: ['campaign', 'overlay'],
    mobileHero: ['type_first', 'stacked'],
    grouping: ['canvas', 'isolated'],
  },
  immersive_catalog: {
    heroGeometry: ['catalog_compact_intro', 'featured_breakout_hero'],
    mediaSide: ['left', 'right'],
    gridRatio: ['5-7', '6-6', '4-8'],
    overlap: ['none', 'modest'],
    contentWidth: ['wide', 'standard'],
    rhythm: ['dense', 'medium'],
    density: ['high', 'medium'],
    productEmphasis: ['dense', 'mixed'],
    surfaceSequence: ['paper', 'alternating'],
    typeScale: ['quiet', 'standard'],
    crop: ['center', 'top'],
    nav: ['solid', 'minimal'],
    mobileHero: ['stacked', 'crop_first'],
    grouping: ['paired', 'isolated'],
  },
  warm_storytelling: {
    heroGeometry: ['cluster_prologue', 'chapter_opener', 'offset_editorial_split'],
    mediaSide: ['left', 'right'],
    gridRatio: ['5-7', '7-5'],
    overlap: ['modest', 'pronounced'],
    contentWidth: ['narrow', 'standard'],
    rhythm: ['sparse', 'medium'],
    density: ['low', 'medium'],
    productEmphasis: ['mixed', 'single'],
    surfaceSequence: ['warm', 'paper'],
    typeScale: ['quiet', 'standard'],
    crop: ['left', 'center'],
    nav: ['minimal', 'solid'],
    mobileHero: ['crop_first', 'stacked'],
    grouping: ['canvas', 'paired'],
  },
};

export const SHOWCASE_SEEDS = ['seed-a', 'seed-b'] as const;

function at<T>(items: readonly T[], index: number): T {
  return items[((index % items.length) + items.length) % items.length];
}

function fromPool(grammarId: LayoutGrammarId, seed: string, index: number): ResolvedVariation {
  const pool = POOLS[grammarId];
  return {
    seed,
    seedHash: rngFromSeed(seed, `${grammarId}:hash`)() * 1e9 | 0,
    heroGeometry: at(pool.heroGeometry, index),
    mediaSide: at(pool.mediaSide, index),
    gridRatio: at(pool.gridRatio, index),
    overlap: at(pool.overlap, index),
    contentWidth: at(pool.contentWidth, index),
    rhythm: at(pool.rhythm, index),
    density: at(pool.density, index),
    productEmphasis: at(pool.productEmphasis, index),
    surfaceSequence: at(pool.surfaceSequence, index),
    typeScale: at(pool.typeScale, index),
    crop: at(pool.crop, index),
    nav: at(pool.nav, index),
    mobileHero: at(pool.mobileHero, index),
    grouping: at(pool.grouping, index),
  };
}

export function resolveVariation(grammarId: LayoutGrammarId, seed?: string | number): ResolvedVariation {
  const normalized = normalizeSeed(seed);
  const pool = POOLS[grammarId];
  if (normalized === 'seed-a') return fromPool(grammarId, normalized, 0);
  if (normalized === 'seed-b') return fromPool(grammarId, normalized, 1);
  const rng = rngFromSeed(normalized, grammarId);
  return {
    seed: normalized,
    seedHash: rngFromSeed(normalized, `${grammarId}:hash`)() * 1e9 | 0,
    heroGeometry: pick(rng, pool.heroGeometry),
    mediaSide: pick(rng, pool.mediaSide),
    gridRatio: pick(rng, pool.gridRatio),
    overlap: pick(rng, pool.overlap),
    contentWidth: pick(rng, pool.contentWidth),
    rhythm: pick(rng, pool.rhythm),
    density: pick(rng, pool.density),
    productEmphasis: pick(rng, pool.productEmphasis),
    surfaceSequence: pick(rng, pool.surfaceSequence),
    typeScale: pick(rng, pool.typeScale),
    crop: pick(rng, pool.crop),
    nav: pick(rng, pool.nav),
    mobileHero: pick(rng, pool.mobileHero),
    grouping: pick(rng, pool.grouping),
  };
}

/** True when at least one structural axis differs (not merely crop). */
export function variationIsStructurallyDifferent(a: ResolvedVariation, b: ResolvedVariation): boolean {
  return (
    a.heroGeometry !== b.heroGeometry ||
    a.mediaSide !== b.mediaSide ||
    a.gridRatio !== b.gridRatio ||
    a.grouping !== b.grouping ||
    a.overlap !== b.overlap ||
    a.contentWidth !== b.contentWidth ||
    a.productEmphasis !== b.productEmphasis
  );
}

export function grammarVariationPool(grammarId: LayoutGrammarId): AxisPool {
  return POOLS[grammarId];
}
