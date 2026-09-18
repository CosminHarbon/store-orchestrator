/**
 * Phase 5A — CreativeStrategy: page-architecture intent between brand direction and SiteTree.
 * Compact, enum-heavy, enforceable. No hero-less modes (Phase 5C).
 */
import type { Zod } from './zodType.ts';

export const PAGE_COMPOSITIONS = [
  'cinematic_scroll',
  'editorial_journey',
  'dense_campaign',
  'catalogue_first',
  'typography_led',
  'product_artifact',
  'modular_grid',
  'technical_story',
  'playful_blocks',
  'asymmetric_magazine',
] as const;

export const HERO_PHILOSOPHIES = [
  'atmosphere_first',
  'typography_first',
  'product_as_artifact',
  'split_editorial',
  'immediate_offer',
] as const;

export const COMMERCE_ENTRIES = ['immediate', 'early', 'mid', 'delayed'] as const;

export const COMMERCE_MODELS = [
  'flagship_then_rail',
  'dense_catalogue',
  'shoppable_editorial',
  'collection_first',
  'single_artifact',
  'spec_story',
] as const;

export const RHYTHMS = ['sparse_pause', 'even', 'rapid_contrast', 'long_short_long'] as const;

export const DENSITIES = ['low', 'medium', 'high'] as const;

export const ASYMMETRY_LEVELS = ['low', 'medium', 'high'] as const;

export const TYPOGRAPHY_ROLES = ['quiet', 'balanced', 'dominant_structural'] as const;

export const IMAGERY_ROLES = ['dominant', 'balanced', 'supporting'] as const;

export const NAVIGATION_BEHAVIORS = [
  'quiet_overlay',
  'solid_compact',
  'bold_campaign',
  'minimal_chrome',
] as const;

export const EXPERIMENTATION_LEVELS = ['low', 'medium', 'high'] as const;

export const SILHOUETTE_TOKENS = [
  'chrome',
  'full_bleed',
  'split',
  'statement',
  'product_artifact',
  'rail',
  'grid',
  'mosaic',
  'editorial_pause',
  'spotlight',
  'dense_grid',
  'trust',
  'newsletter',
  'announcement',
] as const;

export type PageComposition = (typeof PAGE_COMPOSITIONS)[number];
export type HeroPhilosophy = (typeof HERO_PHILOSOPHIES)[number];
export type CommerceEntry = (typeof COMMERCE_ENTRIES)[number];
export type CommerceModel = (typeof COMMERCE_MODELS)[number];
export type Rhythm = (typeof RHYTHMS)[number];
export type Density = (typeof DENSITIES)[number];
export type AsymmetryLevel = (typeof ASYMMETRY_LEVELS)[number];
export type TypographyRole = (typeof TYPOGRAPHY_ROLES)[number];
export type ImageryRole = (typeof IMAGERY_ROLES)[number];
export type NavigationBehavior = (typeof NAVIGATION_BEHAVIORS)[number];
export type ExperimentationLevel = (typeof EXPERIMENTATION_LEVELS)[number];

/**
 * Phase 5D.5 — final field contract (audited; see Phase 5D.1-5D.5 history).
 * Each field has exactly one PRIMARY role:
 *   RUNTIME_CONTROL   — density, asymmetry, rhythm, typographyRole, imageryRole,
 *                        navigationBehavior, commerceModel: deterministic code
 *                        consequence after generation (strategyDefaults.ts).
 *                        commerceModel is the narrow case: it only wins a
 *                        low-priority within-family layout tiebreaker; choosing
 *                        the commerce FAMILY (spotlight/grid/rail/collections)
 *                        remains architect-owned, not deterministic.
 *   ARCHITECT_SIGNAL  — heroPhilosophy, commerceEntry: guides the SiteTree
 *                        architect prompt (+ a soft commerceEntry warning); no
 *                        renderer consequence.
 *   PLANNING_SIGNAL   — pageComposition, experimentationLevel: upstream design
 *                        reasoning only, deliberately with no deterministic rule
 *                        (wiring either would risk a hidden-template mapping).
 *   FREEFORM_STEERING — distinctivenessBrief: natural-language architect
 *                        instruction, never string-matched into templates.
 * Invariants: explicit authored values always beat generation defaults; the
 * generation-time defaulting (strategyDefaults.ts) never runs outside initial
 * generation; planning/freeform fields must not silently become renderer
 * controls; the renderer and SiteOps never parse CreativeStrategy directly.
 */
export type CreativeStrategy = {
  pageComposition: PageComposition;
  heroPhilosophy: HeroPhilosophy;
  commerceEntry: CommerceEntry;
  commerceModel: CommerceModel;
  rhythm: Rhythm;
  density: Density;
  asymmetry: AsymmetryLevel;
  typographyRole: TypographyRole;
  imageryRole: ImageryRole;
  navigationBehavior: NavigationBehavior;
  experimentationLevel: ExperimentationLevel;
  /** Specific architectural anti-pattern to avoid — not vague "be distinctive" */
  distinctivenessBrief: string;
};

export type ArchitectureFingerprint = {
  pageComposition: PageComposition | 'unknown';
  heroFamily: 'full_bleed' | 'split' | 'product' | 'unknown';
  silhouetteSequence: string[];
  commerceEntryIndex: number;
  productPresentationSequence: string[];
  density: Density | 'unknown';
  asymmetry: AsymmetryLevel | 'unknown';
  typographyRole: TypographyRole | 'unknown';
  imageryRole: ImageryRole | 'unknown';
  navigationType: string;
  sectionCount: number;
  sectionSequence: string[];
  creativeMode?: string;
  heroPhilosophy?: HeroPhilosophy | 'unknown';
  commerceEntry?: CommerceEntry | 'unknown';
  rhythm?: Rhythm | 'unknown';
};

export const DISTINCTIVENESS_BRIEF_MAX = 280;

export function buildCreativeStrategySchema(z: Zod) {
  return z.object({
    pageComposition: z.enum(PAGE_COMPOSITIONS),
    heroPhilosophy: z.enum(HERO_PHILOSOPHIES),
    commerceEntry: z.enum(COMMERCE_ENTRIES),
    commerceModel: z.enum(COMMERCE_MODELS),
    rhythm: z.enum(RHYTHMS),
    density: z.enum(DENSITIES),
    asymmetry: z.enum(ASYMMETRY_LEVELS),
    typographyRole: z.enum(TYPOGRAPHY_ROLES),
    imageryRole: z.enum(IMAGERY_ROLES),
    navigationBehavior: z.enum(NAVIGATION_BEHAVIORS),
    experimentationLevel: z.enum(EXPERIMENTATION_LEVELS),
    distinctivenessBrief: z.string().min(24).max(DISTINCTIVENESS_BRIEF_MAX),
  });
}

/** artDirection.density's own enum (designSpecSchema.ts's designTokensSchema/artDirection
 *  density fields) — kept as a local literal union rather than importing zod, since this
 *  file only needs the three string values, not the schema. */
export type ComponentDensity = 'sparse' | 'balanced' | 'dense';

/**
 * Phase 5C.2 — creativeStrategy.density (macro: composition/page density) and
 * artDirection.density (micro: component-internal density, see designSpecSchema.ts) are
 * independently generated and deliberately allowed to diverge (e.g. low+balanced or
 * high+balanced are legitimate macro/micro contrast — a sparse-rhythm page can still want
 * a balanced-density product grid). The Phase 5A/5C.1 audits found exactly one
 * pathological case: the two OPPOSITE extremes (low+dense, high+sparse), where the page's
 * macro composition and a component's internal spacing actively contradict each other
 * with no design intent signal distinguishing that from two independent LLM guesses.
 * This reconciles ONLY those two cases, snapping artDirection.density to the tier that
 * agrees with creativeStrategy.density; every other pairing (including the other two
 * "medium" pairings and all "balanced" pairings) passes through unchanged. Pure — does
 * not mutate either input.
 */
export function reconcileArtDirectionDensity(
  compositionDensity: Density,
  componentDensity: ComponentDensity
): ComponentDensity {
  if (compositionDensity === 'low' && componentDensity === 'dense') return 'sparse';
  if (compositionDensity === 'high' && componentDensity === 'sparse') return 'dense';
  return componentDensity;
}

/** Align experimentationLevel with creativeMode when the model drifts. */
export function clampExperimentationToCreativeMode(
  mode: string | undefined,
  level: ExperimentationLevel
): ExperimentationLevel {
  const m = (mode || 'balanced').toLowerCase();
  if (m === 'faithful') {
    return level === 'high' ? 'medium' : level;
  }
  if (m === 'surprise') {
    return level === 'low' ? 'medium' : level;
  }
  return level;
}

type LooseSpec = {
  creativeMode?: string;
  artDirection?: {
    density?: string;
    archetype?: string;
  };
  productPresentation?: string;
  ux?: { discovery?: string; navStyle?: string };
  designIntent?: { coreConcept?: string; avoidPatterns?: string[] };
  pageIntent?: { mustAvoid?: string[] };
  creativeStrategy?: Partial<CreativeStrategy> | null;
};

/**
 * Conservative inference for V2 drafts that predate creativeStrategy.
 */
export function inferCreativeStrategy(spec: LooseSpec): CreativeStrategy {
  const mode = (spec.creativeMode || 'balanced').toLowerCase();
  const densityRaw = spec.artDirection?.density || 'balanced';
  const presentation = (spec.productPresentation || '').toLowerCase();
  const discovery = (spec.ux?.discovery || '').toLowerCase();
  const nav = (spec.ux?.navStyle || '').toLowerCase();
  const archetype = (spec.artDirection?.archetype || '').toLowerCase();

  let density: Density =
    densityRaw === 'sparse' || densityRaw === 'low'
      ? 'low'
      : densityRaw === 'dense' || densityRaw === 'high'
        ? 'high'
        : 'medium';

  let pageComposition: PageComposition = 'editorial_journey';
  let heroPhilosophy: HeroPhilosophy = 'atmosphere_first';
  let commerceEntry: CommerceEntry = 'mid';
  let commerceModel: CommerceModel = 'flagship_then_rail';
  let rhythm: Rhythm = density === 'low' ? 'sparse_pause' : density === 'high' ? 'rapid_contrast' : 'even';
  let asymmetry: AsymmetryLevel = 'medium';
  let typographyRole: TypographyRole = 'balanced';
  let imageryRole: ImageryRole = 'balanced';
  let navigationBehavior: NavigationBehavior = /transparent|immersive|overlay/i.test(nav)
    ? 'quiet_overlay'
    : /editorial/i.test(nav)
      ? 'minimal_chrome'
      : 'solid_compact';

  if (presentation === 'luxury' || /luxury|quiet|atelier|editorial/.test(archetype)) {
    pageComposition = 'editorial_journey';
    heroPhilosophy = 'atmosphere_first';
    commerceEntry = 'delayed';
    commerceModel = 'single_artifact';
    imageryRole = 'dominant';
    typographyRole = 'quiet';
    asymmetry = 'medium';
  } else if (presentation === 'street' || /street|urban|drop|campaign/.test(archetype)) {
    pageComposition = 'dense_campaign';
    heroPhilosophy = 'typography_first';
    commerceEntry = 'early';
    commerceModel = 'dense_catalogue';
    rhythm = 'rapid_contrast';
    density = 'high';
    asymmetry = 'high';
    typographyRole = 'dominant_structural';
    imageryRole = 'dominant';
    navigationBehavior = 'bold_campaign';
  } else if (presentation === 'tech' || /tech|audio|precision|spec/.test(archetype)) {
    pageComposition = 'technical_story';
    heroPhilosophy = 'product_as_artifact';
    commerceEntry = 'immediate';
    commerceModel = 'spec_story';
    rhythm = 'even';
    typographyRole = 'balanced';
    imageryRole = 'supporting';
    asymmetry = 'low';
  } else if (/catalogue|catalog|collection/.test(discovery)) {
    pageComposition = 'catalogue_first';
    heroPhilosophy = 'immediate_offer';
    commerceEntry = 'immediate';
    commerceModel = 'dense_catalogue';
  } else if (/mosaic|asymmetric|magazine/.test(archetype + discovery)) {
    pageComposition = 'asymmetric_magazine';
    heroPhilosophy = 'split_editorial';
    asymmetry = 'high';
  }

  const experimentationLevel: ExperimentationLevel = clampExperimentationToCreativeMode(
    mode,
    mode === 'surprise' ? 'high' : mode === 'faithful' ? 'low' : 'medium'
  );

  const avoid = [
    ...(spec.designIntent?.avoidPatterns || []),
    ...(spec.pageIntent?.mustAvoid || []),
  ]
    .slice(0, 2)
    .join('; ');

  const distinctivenessBrief =
    avoid.length >= 24
      ? avoid.slice(0, DISTINCTIVENESS_BRIEF_MAX)
      : `Avoid a generic ecommerce spine (hero → manifesto → product rail → story → footer). Prefer ${pageComposition.replace(/_/g, ' ')} with ${commerceEntry} commerce entry.`.slice(
          0,
          DISTINCTIVENESS_BRIEF_MAX
        );

  return {
    pageComposition,
    heroPhilosophy,
    commerceEntry,
    commerceModel,
    rhythm,
    density,
    asymmetry,
    typographyRole,
    imageryRole,
    navigationBehavior,
    experimentationLevel,
    distinctivenessBrief,
  };
}

export function ensureCreativeStrategy(spec: LooseSpec): CreativeStrategy {
  const inferred = inferCreativeStrategy(spec);
  const raw = spec.creativeStrategy;
  if (!raw || typeof raw !== 'object') return inferred;

  const merged: CreativeStrategy = {
    pageComposition: (PAGE_COMPOSITIONS as readonly string[]).includes(raw.pageComposition as string)
      ? (raw.pageComposition as PageComposition)
      : inferred.pageComposition,
    heroPhilosophy: (HERO_PHILOSOPHIES as readonly string[]).includes(raw.heroPhilosophy as string)
      ? (raw.heroPhilosophy as HeroPhilosophy)
      : inferred.heroPhilosophy,
    commerceEntry: (COMMERCE_ENTRIES as readonly string[]).includes(raw.commerceEntry as string)
      ? (raw.commerceEntry as CommerceEntry)
      : inferred.commerceEntry,
    commerceModel: (COMMERCE_MODELS as readonly string[]).includes(raw.commerceModel as string)
      ? (raw.commerceModel as CommerceModel)
      : inferred.commerceModel,
    rhythm: (RHYTHMS as readonly string[]).includes(raw.rhythm as string)
      ? (raw.rhythm as Rhythm)
      : inferred.rhythm,
    density: (DENSITIES as readonly string[]).includes(raw.density as string)
      ? (raw.density as Density)
      : inferred.density,
    asymmetry: (ASYMMETRY_LEVELS as readonly string[]).includes(raw.asymmetry as string)
      ? (raw.asymmetry as AsymmetryLevel)
      : inferred.asymmetry,
    typographyRole: (TYPOGRAPHY_ROLES as readonly string[]).includes(raw.typographyRole as string)
      ? (raw.typographyRole as TypographyRole)
      : inferred.typographyRole,
    imageryRole: (IMAGERY_ROLES as readonly string[]).includes(raw.imageryRole as string)
      ? (raw.imageryRole as ImageryRole)
      : inferred.imageryRole,
    navigationBehavior: (NAVIGATION_BEHAVIORS as readonly string[]).includes(
      raw.navigationBehavior as string
    )
      ? (raw.navigationBehavior as NavigationBehavior)
      : inferred.navigationBehavior,
    experimentationLevel: clampExperimentationToCreativeMode(
      spec.creativeMode,
      (EXPERIMENTATION_LEVELS as readonly string[]).includes(raw.experimentationLevel as string)
        ? (raw.experimentationLevel as ExperimentationLevel)
        : inferred.experimentationLevel
    ),
    distinctivenessBrief:
      typeof raw.distinctivenessBrief === 'string' && raw.distinctivenessBrief.trim().length >= 24
        ? raw.distinctivenessBrief.trim().slice(0, DISTINCTIVENESS_BRIEF_MAX)
        : inferred.distinctivenessBrief,
  };

  return merged;
}

const PRODUCT_TYPES = new Set([
  'productGrid',
  'productRail',
  'productSpotlight',
  'collections',
]);

type LooseNode = {
  type?: string;
  variant?: string;
  visible?: boolean;
};

export function silhouetteForNode(node: LooseNode): string {
  const type = node.type || 'unknown';
  const variant = (node.variant || '').toLowerCase();
  if (type === 'nav' || type === 'footer') return 'chrome';
  if (type === 'announcement') return 'announcement';
  if (type === 'hero') {
    if (variant.includes('luxury') || variant.includes('minimal')) return 'full_bleed';
    if (variant.includes('product')) return 'product_artifact';
    return 'split';
  }
  if (type === 'brandStatement') return 'statement';
  if (type === 'productSpotlight') return 'spotlight';
  if (type === 'productRail') return 'rail';
  if (type === 'productGrid') return 'grid';
  if (type === 'collections') return 'dense_grid';
  if (type === 'editorialMosaic') return 'mosaic';
  if (type === 'editorialSplit') return 'editorial_pause';
  if (type === 'testimonials' || type === 'reviews') return 'trust';
  if (type === 'newsletter') return 'newsletter';
  return type;
}

export function heroFamilyFromNodes(nodes: LooseNode[]): ArchitectureFingerprint['heroFamily'] {
  const hero = nodes.find((n) => n.visible !== false && n.type === 'hero');
  if (!hero) return 'unknown';
  const v = (hero.variant || '').toLowerCase();
  if (v.includes('luxury') || v.includes('minimal')) return 'full_bleed';
  if (v.includes('product')) return 'product';
  if (v.includes('editorial') || v.includes('split')) return 'split';
  return 'unknown';
}

/** Observation-only architecture fingerprint (Phase 5A — no hard reject). */
export function buildArchitectureFingerprint(opts: {
  designSpec?: LooseSpec | null;
  nodes: LooseNode[];
  silhouettePlan?: string[] | null;
}): ArchitectureFingerprint {
  const strategy = opts.designSpec ? ensureCreativeStrategy(opts.designSpec) : null;
  const visible = (opts.nodes || []).filter((n) => n.visible !== false);
  const sectionSequence = visible.map((n) => `${n.type}/${n.variant || 'default'}`);
  const silhouetteSequence =
    opts.silhouettePlan && opts.silhouettePlan.length
      ? opts.silhouettePlan.map(String)
      : visible.map(silhouetteForNode);

  const commerceEntryIndex = visible.findIndex((n) => PRODUCT_TYPES.has(n.type || ''));
  const productPresentationSequence = visible
    .filter((n) => PRODUCT_TYPES.has(n.type || ''))
    .map((n) => n.type || 'product');

  const nav = visible.find((n) => n.type === 'nav');

  return {
    pageComposition: strategy?.pageComposition || 'unknown',
    heroFamily: heroFamilyFromNodes(visible),
    silhouetteSequence,
    commerceEntryIndex,
    productPresentationSequence,
    density: strategy?.density || 'unknown',
    asymmetry: strategy?.asymmetry || 'unknown',
    typographyRole: strategy?.typographyRole || 'unknown',
    imageryRole: strategy?.imageryRole || 'unknown',
    navigationType: nav ? `${nav.type}/${nav.variant || 'default'}` : 'none',
    sectionCount: visible.length,
    sectionSequence,
    creativeMode: opts.designSpec?.creativeMode,
    heroPhilosophy: strategy?.heroPhilosophy || 'unknown',
    commerceEntry: strategy?.commerceEntry || 'unknown',
    rhythm: strategy?.rhythm || 'unknown',
  };
}

/** Soft band check — returns warning string or null (no repair). */
export function commerceEntryBandWarning(
  commerceEntry: CommerceEntry,
  commerceEntryIndex: number
): string | null {
  if (commerceEntryIndex < 0) return 'No product presentation node found for commerceEntry check';
  if (commerceEntry === 'immediate' && commerceEntryIndex > 3) {
    return `commerceEntry=immediate but first product node is at index ${commerceEntryIndex}`;
  }
  if (commerceEntry === 'early' && commerceEntryIndex > 4) {
    return `commerceEntry=early but first product node is at index ${commerceEntryIndex}`;
  }
  if (commerceEntry === 'mid' && (commerceEntryIndex < 2 || commerceEntryIndex > 6)) {
    return `commerceEntry=mid but first product node is at index ${commerceEntryIndex}`;
  }
  if (commerceEntry === 'delayed' && commerceEntryIndex < 4) {
    return `commerceEntry=delayed but first product node is at index ${commerceEntryIndex}`;
  }
  return null;
}

export function creativeStrategyPromptBlock(): string {
  return `creativeStrategy (REQUIRED — page architecture intent, decided BEFORE polishing colors/fonts):
{
  "pageComposition": "cinematic_scroll|editorial_journey|dense_campaign|catalogue_first|typography_led|product_artifact|modular_grid|technical_story|playful_blocks|asymmetric_magazine",
  "heroPhilosophy": "atmosphere_first|typography_first|product_as_artifact|split_editorial|immediate_offer",
  "commerceEntry": "immediate|early|mid|delayed",
  "commerceModel": "flagship_then_rail|dense_catalogue|shoppable_editorial|collection_first|single_artifact|spec_story",
  "rhythm": "sparse_pause|even|rapid_contrast|long_short_long",
  "density": "low|medium|high",
  "asymmetry": "low|medium|high",
  "typographyRole": "quiet|balanced|dominant_structural",
  "imageryRole": "dominant|balanced|supporting",
  "navigationBehavior": "quiet_overlay|solid_compact|bold_campaign|minimal_chrome",
  "experimentationLevel": "low|medium|high",
  "distinctivenessBrief": "Concrete architectural anti-pattern to avoid for THIS brand (min ~24 chars)"
}

creativeStrategy rules:
- Decide architecture intentionally: first-viewport dominance, commerce timing, rhythm, typography vs imagery weight, asymmetry, discovery model.
- density here is MACRO composition density — how compressed the page feels section to section (drives section spacing and layout choices like a denser product grid or reviews wall). It is independent of artDirection.density (component-internal spacing, e.g. card/grid/rail gaps) — the two may differ, but avoid setting them to opposite extremes (low here with artDirection.density=dense, or high here with artDirection.density=sparse) for the same brand.
- distinctivenessBrief must be SPECIFIC. Bad: "Make it distinctive." Good: "Avoid full-bleed hero → centered manifesto → product rail. Delay commerce; let material photography interrupt the narrative."
- Do NOT emit hero-less philosophies — a classic hero is still required by the SiteTree schema.
- creativeMode MUST steer experimentationLevel and willingness to pick uncommon pageComposition:
  - faithful → experimentationLevel low|medium; category-appropriate but still reject generic template thinking
  - balanced → experimentationLevel medium; allow meaningful rhythm/hero/commerce/asymmetry departures
  - surprise → experimentationLevel medium|high; prefer less-common pageComposition when brand-fit allows; typography may be dominant_structural; unusual pacing OK; ecommerce must stay usable
- Do NOT maximize novelty for its own sake. Optimize brandFit + designQuality + intentionalDistinctiveness.`;
}
