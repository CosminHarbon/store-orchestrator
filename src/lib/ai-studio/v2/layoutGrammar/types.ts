/**
 * Phase 5B.1 — page-level LayoutGrammar.
 *
 * SiteDocument stays semantic. A grammar + deterministic seed produce a LayoutPlan
 * the renderer consumes. Live V2 generation is not wired to this module.
 */

import type { CreativeStrategy } from '@shared/ai-studio-v2/creativeStrategy';

export const LAYOUT_GRAMMAR_IDS = [
  'editorial_asymmetric',
  'cinematic_full_bleed',
  'product_monument',
  'typographic_campaign',
  'immersive_catalog',
  'warm_storytelling',
] as const;

export type LayoutGrammarId = (typeof LAYOUT_GRAMMAR_IDS)[number];

export const GRAMMAR_VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const;
export type GrammarViewport = (typeof GRAMMAR_VIEWPORTS)[number];

export const TYPOGRAPHY_ROLE_IDS = [
  'display',
  'editorialHeading',
  'sectionHeading',
  'body',
  'supporting',
  'kicker',
  'navigation',
  'price',
  'action',
] as const;
export type TypographyRoleId = (typeof TYPOGRAPHY_ROLE_IDS)[number];

export const HERO_GEOMETRIES = [
  'offset_editorial_split',
  'hanging_media',
  'type_first_crop',
  'full_bleed_campaign',
  'layered_scrim',
  'cinematic_letterbox',
  'product_artifact_stage',
  'product_overlap_rail',
  'quiet_luxury_minimal',
  'display_collision',
  'type_led_corner_media',
  'campaign_stack',
  'catalog_compact_intro',
  'featured_breakout_hero',
  'cluster_prologue',
  'chapter_opener',
] as const;
export type HeroGeometry = (typeof HERO_GEOMETRIES)[number];

export const PRODUCT_TREATMENTS = [
  'editorial_borderless',
  'featured_oversized',
  'mixed_mosaic',
  'horizontal_story',
  'artifact_stage',
  'dense_catalog',
  'campaign_poster',
  'category_interrupt',
  'warm_inset',
  'film_still',
] as const;
export type ProductTreatment = (typeof PRODUCT_TREATMENTS)[number];

export const CHAPTER_KINDS = [
  'chrome',
  'hero',
  'statement',
  'story',
  'monument',
  'merch',
  'trust',
  'collections',
  'cta',
  'footer',
] as const;
export type ChapterKind = (typeof CHAPTER_KINDS)[number];

export type SurfaceTone = 'paper' | 'brand' | 'ink' | 'accent' | 'image';

export type MediaCrop = 'center' | 'left' | 'right' | 'top' | 'bottom';

export type TypographyRoleStyle = {
  family: 'display' | 'heading' | 'body';
  minPx: number;
  maxPx: number;
  vw: number;
  lineHeight: number;
  letterSpacing: string;
  weight: number;
  transform: 'none' | 'uppercase' | 'lowercase';
  maxCh: number;
  align: 'start' | 'center' | 'end';
  wrapping: 'balance' | 'pretty' | 'normal';
};

export type TypographySystem = {
  grammarId: LayoutGrammarId;
  displayFont: string;
  headingFont: string;
  bodyFont: string;
  scaleRatio: number;
  measureCh: number;
  roles: Record<TypographyRoleId, TypographyRoleStyle>;
  mobileScale: number;
};

export type ResolvedVariation = {
  seed: string;
  seedHash: number;
  heroGeometry: HeroGeometry;
  mediaSide: 'left' | 'right';
  gridRatio: '4-8' | '5-7' | '7-5' | '8-4' | '6-6';
  overlap: 'none' | 'modest' | 'pronounced';
  contentWidth: 'narrow' | 'standard' | 'wide' | 'bleed';
  rhythm: 'sparse' | 'medium' | 'dense';
  density: 'low' | 'medium' | 'high';
  productEmphasis: 'single' | 'mixed' | 'dense';
  surfaceSequence: 'paper' | 'ink_led' | 'alternating' | 'warm';
  typeScale: 'quiet' | 'standard' | 'loud';
  crop: MediaCrop;
  nav: 'overlay' | 'solid' | 'minimal' | 'campaign';
  mobileHero: 'stacked' | 'overlay' | 'crop_first' | 'type_first';
  grouping: 'isolated' | 'paired' | 'canvas';
};

export type MobileRecomposition = {
  readingOrder: string;
  overlaps: string;
  typeScale: string;
  rails: string;
  productEmphasis: string;
  imageCrops: string;
  sticky: string;
  navigation: string;
  whitespace: string;
  grouping: string;
  cta: string;
  density: string;
};

export type MotionHint = {
  entrance: 'none' | 'fade' | 'rise';
  revealOrder: number;
  parallax: boolean;
  sticky: boolean;
  reducedMotionSafe: true;
};

export type ChapterPlan = {
  id: string;
  kind: ChapterKind;
  nodeIds: string[];
  surface: SurfaceTone;
  fullBleed: boolean;
  overlapNext: boolean;
  pad: 'pause' | 'tight' | 'standard' | 'flush';
  align: 'start' | 'center' | 'end' | 'edge';
  geometry: string;
  motion: MotionHint;
};

export type GrammarResolution = {
  grammarId: LayoutGrammarId;
  reason: string;
  influencingFields: string[];
  fallback: 'none' | 'inferred_strategy' | 'default_editorial';
  unsupportedFields: string[];
  scores: Record<LayoutGrammarId, number>;
};

export type LayoutPlan = {
  grammarId: LayoutGrammarId;
  resolution: GrammarResolution;
  variation: ResolvedVariation;
  typography: TypographySystem;
  chapters: ChapterPlan[];
  heroGeometry: HeroGeometry;
  productPresentation: ProductTreatment[];
  mobile: MobileRecomposition;
  viewport: GrammarViewport;
  overflowStrategy: 'clip_root';
  compositionIds: string[];
  metadata: {
    strategy: CreativeStrategy | null;
    contentWidth: ResolvedVariation['contentWidth'];
    gridRatio: ResolvedVariation['gridRatio'];
    overlap: ResolvedVariation['overlap'];
    surfaceSequence: ResolvedVariation['surfaceSequence'];
  };
};

export type ResolveLayoutInput = {
  strategy?: CreativeStrategy | null;
  /** Incomplete / legacy DesignSpec-like object */
  spec?: unknown;
  seed?: string | number;
  grammarOverride?: LayoutGrammarId;
  viewport?: GrammarViewport;
  nodeTypes?: string[];
};
