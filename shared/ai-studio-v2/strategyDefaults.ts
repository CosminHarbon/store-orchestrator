/**
 * Phase: AI Studio V2 expressiveness foundation.
 *
 * The architect LLM is told about `creativeStrategy` (density, asymmetry, rhythm,
 * typographyRole, imageryRole — see creativeStrategy.ts) and about the per-node design
 * knobs (spacing/alignment/emphasis/measure/fullBleed), but nothing previously connected
 * the two deterministically: a document could carry a rich creativeStrategy while every
 * node's `design` object stayed empty, and the renderer would fall back to identical
 * per-component defaults regardless of strategy. Two DesignSpecs with very different
 * creativeStrategy could then render as the same skeleton with different colors.
 *
 * `applyStrategyDefaults` closes that gap the same way V1's `withLayout` closes the
 * layout-chrome gap: it fills in *only the design fields the architect left unset*,
 * from a deterministic mapping of creativeStrategy -> design knobs. Any value the
 * architect explicitly chose always survives untouched. This is intentionally NOT a new
 * parallel abstraction — it only ever writes into the existing `nodeDesignSchema` shape
 * that the renderer (and SiteOps, and the critique loop) already reads.
 */

// Mirrors nodeDesignSchema's enums exactly (siteTree.ts / aiStudioV2.ts) so a resolved
// StrategyDesign can be assigned straight back into a SiteNode['design'] without a cast.
export type StrategyDesign = {
  spacing?: 'compact' | 'cozy' | 'airy' | 'dramatic';
  alignment?: 'start' | 'center' | 'end' | 'stretch';
  emphasis?: 'primary' | 'secondary' | 'quiet';
  measure?: 'narrow' | 'standard' | 'wide' | 'bleed';
  fullBleed?: boolean;
  minHeight?: 'auto' | '60vh' | '80vh' | '100vh';
};

export type StrategyNode = {
  id: string;
  type: string;
  visible?: boolean;
  design?: StrategyDesign;
};

/** Minimal shape of CreativeStrategy this module actually consumes (avoids importing the
 *  zod-schema half of creativeStrategy.ts, which differs between the Deno and npm zod runtimes). */
export type StrategyInput = {
  density: 'low' | 'medium' | 'high';
  asymmetry: 'low' | 'medium' | 'high';
  rhythm: 'sparse_pause' | 'even' | 'rapid_contrast' | 'long_short_long';
  typographyRole: 'quiet' | 'balanced' | 'dominant_structural';
  imageryRole: 'dominant' | 'balanced' | 'supporting';
};

const DENSITY_SPACING: Record<StrategyInput['density'], NonNullable<StrategyDesign['spacing']>> = {
  low: 'dramatic',
  medium: 'airy',
  high: 'compact',
};

/** Node types where "emphasis" and full-bleed imagery meaningfully register visually. */
const STATEMENT_TYPES = new Set(['hero', 'brandStatement']);
const IMAGE_LED_TYPES = new Set(['hero', 'productSpotlight', 'editorialSplit', 'editorialMosaic']);
/** Chrome/utility nodes are deliberately excluded from rhythm/asymmetry pacing — a nav or
 *  footer swinging between "compact" and "dramatic" spacing per rhythm reads as a bug, not a
 *  design choice. */
const RHYTHM_EXCLUDED_TYPES = new Set(['nav', 'footer', 'announcement']);

function rhythmSpacing(
  rhythm: StrategyInput['rhythm'],
  index: number,
  base: NonNullable<StrategyDesign['spacing']>
): NonNullable<StrategyDesign['spacing']> {
  switch (rhythm) {
    case 'even':
      return base;
    case 'rapid_contrast':
      return index % 2 === 0 ? 'compact' : 'dramatic';
    case 'long_short_long':
      return index % 3 === 1 ? 'compact' : 'dramatic';
    case 'sparse_pause':
      // Mostly the base rhythm, with a deliberate "pause" (dramatic whitespace) every third beat.
      return index % 3 === 2 ? 'dramatic' : base;
    default:
      return base;
  }
}

function asymmetryAlignment(
  asymmetry: StrategyInput['asymmetry'],
  index: number
): StrategyDesign['alignment'] {
  if (asymmetry === 'low') return 'center';
  if (asymmetry === 'high') return index % 2 === 0 ? 'start' : 'end';
  // medium: alternate center/start rather than committing fully either direction
  return index % 2 === 0 ? 'center' : 'start';
}

/**
 * Returns a NEW array (does not mutate input nodes). Only fills design fields that are
 * `undefined` on the incoming node — any explicit architect choice always wins.
 * Deliberately non-generic (plain StrategyNode[] in/out): callers pass their own richer
 * node type structurally and cast the result back — a generic here fights TypeScript's
 * inference across the two very different SiteNode shapes (Deno server vs. client) for
 * no real benefit, since this function only ever reads/writes the `design` field.
 */
export function applyStrategyDefaults(nodes: StrategyNode[], strategy: StrategyInput): StrategyNode[] {
  let rhythmIndex = 0;
  return nodes.map((node) => {
    const design = { ...(node.design || {}) };
    const isRhythmEligible = !RHYTHM_EXCLUDED_TYPES.has(node.type);
    const base = DENSITY_SPACING[strategy.density];

    if (design.spacing === undefined) {
      design.spacing = isRhythmEligible ? rhythmSpacing(strategy.rhythm, rhythmIndex, base) : base;
    }
    if (design.alignment === undefined) {
      const align = asymmetryAlignment(strategy.asymmetry, rhythmIndex);
      if (align) design.alignment = align;
    }
    if (design.emphasis === undefined && STATEMENT_TYPES.has(node.type)) {
      if (strategy.typographyRole === 'dominant_structural') design.emphasis = 'primary';
      else if (strategy.typographyRole === 'quiet') design.emphasis = 'quiet';
    }
    if (design.measure === undefined && IMAGE_LED_TYPES.has(node.type)) {
      if (strategy.imageryRole === 'dominant') design.measure = 'bleed';
      else if (strategy.imageryRole === 'supporting') design.measure = 'standard';
    }
    if (design.fullBleed === undefined && IMAGE_LED_TYPES.has(node.type) && strategy.imageryRole === 'dominant') {
      design.fullBleed = true;
    }

    if (isRhythmEligible) rhythmIndex += 1;
    return { ...node, design };
  });
}

export type ConstraintNode = StrategyNode & { content?: Record<string, unknown> };

/**
 * Unusual design combinations are allowed. This function must never become a
 * deterministic art director.
 *
 * Resolves ONLY combinations that are structurally self-contradictory at the CSS layer -
 * i.e. cases where the renderer cannot honor both values as written, so leaving them
 * as-is would silently produce a *third*, undeclared visual result instead of either
 * value the caller chose. This is not a design-quality checker (that's the critique
 * loop's job): a dense productGrid with dramatic spacing, or a quiet-emphasis fullBleed
 * hero, are unusual but perfectly renderable combinations and must pass through
 * untouched - only removing them from here previously was itself the bug.
 *
 * Currently the one remaining case: `fullBleed: true` + `measure: 'narrow'`. In v2.css,
 * `.ai-v2-wrap` width is driven by two same-specificity attribute-selector rules -
 * `[data-measure='narrow']` and `[data-bleed='1']` (see sectionDesignProps) - and because
 * the bleed rule is declared after the narrow rule, it always wins the cascade
 * regardless of source data. So a node with both set does NOT render "narrow" (or even
 * a blend); it silently renders full-bleed while `design.measure` still reads 'narrow'
 * everywhere else (critique loop, fingerprints, SiteOps). Setting `measure: 'bleed'`
 * here makes the stored design object match what actually renders - it is a rendering-
 * accuracy fix, not a creative override.
 *
 * Takes/returns just the fields it needs (not a whole node object) so callers on both
 * the Deno edge function and the client - which each declare their own structurally-
 * similar-but-not-identical SiteNode type - can call it with a plain `{...node, design:
 * normalizeDesignSemantics(...)}` spread, no cross-runtime generic or cast required.
 */
export function normalizeDesignSemantics(
  type: string,
  layout: string | undefined,
  design: StrategyDesign
): StrategyDesign {
  const next = { ...design };

  // fullBleed and a narrow content measure are a direct CSS-cascade contradiction (see
  // above) - fullBleed always wins the render regardless, so record that here too.
  if (next.fullBleed === true && next.measure === 'narrow') {
    next.measure = 'bleed';
  }

  return next;
}

/** Array convenience wrapper over normalizeDesignSemantics, for callers whose node shape
 *  structurally matches ConstraintNode closely enough to use directly (e.g. the Deno
 *  edge function). Client callers with a stricter local SiteNode type should map with
 *  normalizeDesignSemantics directly instead - see siteOps.ts. */
export function normalizeDesignSemanticsForNodes(nodes: ConstraintNode[]): ConstraintNode[] {
  return nodes.map((node) => {
    if (!node.design) return node;
    const layout = typeof node.content?.layout === 'string' ? node.content.layout : undefined;
    return { ...node, design: normalizeDesignSemantics(node.type, layout, node.design) };
  });
}
