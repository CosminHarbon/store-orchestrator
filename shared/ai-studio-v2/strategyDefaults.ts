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

/** Node types where "emphasis" and full-bleed imagery meaningfully register visually.
 *  Phase 4D adds `testimonials` (a real photo exists in the imageQuote layout — see
 *  assetResolver.ts's SINGLE_SLOTS, and its quote text is a genuine emphasis moment like
 *  brandStatement's) and `collections` (image-heavy by nature; fullBleed here means the
 *  whole tiles block spans edge-to-edge via the existing [data-bleed='1'] > .ai-v2-wrap
 *  rule, not a new CSS mechanism). */
const STATEMENT_TYPES = new Set(['hero', 'brandStatement', 'testimonials']);
const IMAGE_LED_TYPES = new Set(['hero', 'productSpotlight', 'editorialSplit', 'editorialMosaic', 'testimonials', 'collections']);
/** Chrome/utility nodes are deliberately excluded from rhythm/asymmetry pacing — a nav or
 *  footer swinging between "compact" and "dramatic" spacing per rhythm reads as a bug, not a
 *  design choice. */
const RHYTHM_EXCLUDED_TYPES = new Set(['nav', 'footer', 'announcement']);

/** Fixed 3-beat cycle with three DISTINCT tiers, so no two adjacent indices ever land on
 *  the same beat (dramatic->compact->cozy->dramatic->... always differs from its neighbor
 *  on both sides, including the wrap-around). Deliberately independent of the density
 *  baseline (unlike the other rhythms) - using `base` here as the repeated "long" tier
 *  is exactly what previously let two adjacent sections both resolve to 'dramatic' and
 *  stack their vertical padding into an oversized, unintentional-looking gap. */
const LONG_SHORT_LONG_CYCLE: ReadonlyArray<NonNullable<StrategyDesign['spacing']>> = [
  'dramatic',
  'compact',
  'cozy',
];

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
      return LONG_SHORT_LONG_CYCLE[index % 3];
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
  // Tracks the previous rhythm-eligible node's RESOLVED spacing (defaulted or explicit)
  // so two consecutive sections never both land on 'dramatic' - each section's own
  // top+bottom padding stacks with its neighbor's, so back-to-back 'dramatic' beats
  // silently produce the largest, most unintentional-looking whitespace gap on the page
  // (the "excessive whitespace" case from the Phase 2 visual audit). This only ever
  // softens a defaulted value, never an explicit architect choice.
  let previousSpacing: NonNullable<StrategyDesign['spacing']> | undefined;
  return nodes.map((node) => {
    const design = { ...(node.design || {}) };
    const isRhythmEligible = !RHYTHM_EXCLUDED_TYPES.has(node.type);
    const base = DENSITY_SPACING[strategy.density];

    if (design.spacing === undefined) {
      let next = isRhythmEligible ? rhythmSpacing(strategy.rhythm, rhythmIndex, base) : base;
      if (isRhythmEligible && next === 'dramatic' && previousSpacing === 'dramatic') {
        next = 'airy';
      }
      design.spacing = next;
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

    if (isRhythmEligible) {
      previousSpacing = design.spacing;
      rhythmIndex += 1;
    }
    return { ...node, design };
  });
}

/**
 * Phase 4A — content.layout defaults for supporting sections, sibling to
 * applyStrategyDefaults but for the STRUCTURAL (content.layout) axis instead of the
 * cosmetic (design) one. Deliberately reuses the same two creativeStrategy signals that
 * already govern editorialSplit's imagery weight (imageryRole, via IMAGE_LED_TYPES above)
 * and hero/brandStatement emphasis (typographyRole, via STATEMENT_TYPES) — no new signal,
 * no archetype-string matching, no productPresentation (that field is scoped to product
 * chrome only — see designSpecSchema.ts's productPresentation description).
 */
export type EditorialSplitLayout = 'classicSplit' | 'offsetNarrow' | 'overlayStatement';

/**
 * typographyRole is checked first because it is the stronger structural signal for this
 * section: 'dominant_structural' means the brand wants typography to carry weight, which
 * 'overlayStatement' expresses directly (oversized statement-scale heading overlapping the
 * image). Otherwise, imageryRole decides between an image-led asymmetric composition
 * ('offsetNarrow', for imageryRole:'dominant' brands that still want quiet/balanced type)
 * and the plain structured split ('classicSplit', the safe default for balanced/supporting
 * imagery). This never reads density/asymmetry/rhythm — those already reach editorialSplit
 * through applyStrategyDefaults' design knobs (spacing/alignment/measure/fullBleed) and
 * would be redundant here.
 */
export function editorialSplitLayoutDefault(
  strategy: Pick<StrategyInput, 'typographyRole' | 'imageryRole'>
): EditorialSplitLayout {
  if (strategy.typographyRole === 'dominant_structural') return 'overlayStatement';
  if (strategy.imageryRole === 'dominant') return 'offsetNarrow';
  return 'classicSplit';
}

export type ProductSpotlightLayout = 'feature' | 'imageDominant' | 'structuredFeature';

/**
 * Phase 4B — same two-signal precedence as editorialSplitLayoutDefault, and deliberately
 * so: typographyRole checked first because a brand that wants typography to carry
 * structural weight also wants its single flagship-product beat to read as copy-led and
 * assertive ('structuredFeature': copy leads in both ratio AND document order, image
 * becomes the secondary block) rather than a quiet image showcase. Otherwise, imageryRole
 * decides between an image-led asymmetric composition ('imageDominant', for imageryRole:
 * 'dominant' brands with quiet/balanced typography) and the plain feature split
 * ('feature', the safe default). Never reads productPresentation — see Phase 4A's
 * architectural finding (designSpecSchema.ts's productPresentation description): that
 * field is scoped to per-card chrome (ProductPresentation.tsx), a different, narrower
 * concern from this section's own composition geometry.
 */
export function productSpotlightLayoutDefault(
  strategy: Pick<StrategyInput, 'typographyRole' | 'imageryRole'>
): ProductSpotlightLayout {
  if (strategy.typographyRole === 'dominant_structural') return 'structuredFeature';
  if (strategy.imageryRole === 'dominant') return 'imageDominant';
  return 'feature';
}

export type BrandStatementLayout = 'centered' | 'splitStatement' | 'anchoredLarge';

/**
 * Phase 4B — brandStatement has no imagery of its own, so typographyRole alone is the
 * correct discriminator for its STRUCTURAL axis (asymmetry already reaches it through the
 * existing, unrelated data-align mechanism — see applyStrategyDefaults' asymmetryAlignment
 * above — and doesn't need a second, redundant layout-level knob): 'dominant_structural'
 * gets 'anchoredLarge' (breaks out of the content canvas — the same "let typography own
 * the composition" idea as editorialSplit's overlayStatement); 'quiet' gets
 * 'splitStatement' (a narrow statement + generous whitespace + an editorial secondary
 * line, i.e. restrained composition, not just a smaller font size); 'balanced' keeps
 * 'centered', the safe, already-controlled default.
 */
export function brandStatementLayoutDefault(
  strategy: Pick<StrategyInput, 'typographyRole'>
): BrandStatementLayout {
  if (strategy.typographyRole === 'dominant_structural') return 'anchoredLarge';
  if (strategy.typographyRole === 'quiet') return 'splitStatement';
  return 'centered';
}

export type NewsletterLayout = 'statement' | 'split' | 'campaign';

/**
 * Phase 4C — newsletter has no imagery slot at all (not in IMAGE_LED_TYPES, not in
 * assetResolver.ts's SINGLE_SLOTS), so imageryRole is deliberately never consulted here —
 * consuming it would mean fabricating an image relationship the section doesn't have.
 * typographyRole alone already discriminates all three fixtures this phase's QA relies on
 * (quiet/balanced/dominant_structural -> three different layouts), so density/asymmetry/
 * rhythm are left alone rather than stacking a second redundant axis onto a section this
 * narrow — same reasoning as brandStatementLayoutDefault above. 'dominant_structural' gets
 * 'campaign' (an assertive, bordered band — message and CTA sit close together, echoing
 * "denser relationship between message and input"); 'quiet' gets 'statement' (the
 * pre-existing centered, generous-whitespace shape — already the right fit, not a
 * regression to fix); 'balanced' gets 'split' (copy and form in distinct regions, a more
 * organized/structured read).
 */
export function newsletterLayoutDefault(
  strategy: Pick<StrategyInput, 'typographyRole'>
): NewsletterLayout {
  if (strategy.typographyRole === 'dominant_structural') return 'campaign';
  if (strategy.typographyRole === 'balanced') return 'split';
  return 'statement';
}

export type CollectionsLayout = 'editorial' | 'stacked';

/**
 * Phase 4D — collections was already adequate (editorial/stacked are genuinely different
 * DOM shapes; see the Phase 4 audit), so this only connects the CHOICE between them to an
 * existing signal rather than inventing a third shape. asymmetry is the cleanest fit:
 * 'stacked' IS an asymmetric device (alternating reversed rows via data-reverse), so a
 * high-asymmetry brand choosing it is a semantic match, not an arbitrary pairing.
 * imageryRole/density are deliberately NOT layout-choice signals here (one clean
 * discriminator, per the Phase 4D brief) — they instead drive internal presentation
 * (fullBleed via IMAGE_LED_TYPES above, and a density-scoped tile gap in v2.css) on
 * WHICHEVER layout gets chosen, so they apply uniformly instead of duplicating asymmetry's job.
 */
export function collectionsLayoutDefault(
  strategy: Pick<StrategyInput, 'asymmetry'>
): CollectionsLayout {
  return strategy.asymmetry === 'high' ? 'stacked' : 'editorial';
}

export type TestimonialsLayout = 'quote' | 'imageQuote';

/**
 * Phase 4D — imageryRole is the correct (and only) signal for this choice: imageQuote
 * needs a real photo to be worth choosing, and imageryRole is literally "how much should
 * imagery carry" for this brand. Before this phase, imageQuote was effectively opt-in
 * only (the architect had to author it explicitly) — assetResolver.ts's slotForNode()
 * only ever attempts to resolve a photo when content.layout is ALREADY 'imageQuote', so an
 * image-led brand that left this unset never got a photo, regardless of imageryRole.
 */
export function testimonialsLayoutDefault(
  strategy: Pick<StrategyInput, 'imageryRole'>
): TestimonialsLayout {
  return strategy.imageryRole === 'dominant' ? 'imageQuote' : 'quote';
}

export type ReviewsLayout = 'index' | 'grid';

/**
 * Phase 4D — density is the signal the renderer's OWN pre-existing comment already named
 * ("grid: dense card grid... reads better for a catalogue_first / dense_campaign page
 * composition" — see compositions.tsx ReviewsWall) but never actually wired to
 * creativeStrategy. typographyRole/rhythm are left alone: density alone already cleanly
 * separates "quiet editorial list" from "dense catalogue proof," and this is the same
 * signal that additionally drives the grid's own column count at render time (see
 * ReviewsWall's data-density + v2.css) — one signal, expressed consistently, not two
 * redundant axes.
 */
export function reviewsLayoutDefault(strategy: Pick<StrategyInput, 'density'>): ReviewsLayout {
  return strategy.density === 'high' ? 'grid' : 'index';
}

/** Node types with a registered content.layout default rule. Phase 4A/4B/4C/4D wire
 *  editorialSplit, productSpotlight, brandStatement, newsletter, collections,
 *  testimonials, and reviews — deliberately not a broad "every supporting section" pass
 *  in one shot (see Phase 4 audit); each was added only once its own audit pass justified it. */
const LAYOUT_DEFAULT_RESOLVERS: Record<string, (strategy: StrategyInput) => string> = {
  editorialSplit: editorialSplitLayoutDefault,
  productSpotlight: productSpotlightLayoutDefault,
  brandStatement: brandStatementLayoutDefault,
  newsletter: newsletterLayoutDefault,
  collections: collectionsLayoutDefault,
  testimonials: testimonialsLayoutDefault,
  reviews: reviewsLayoutDefault,
};

export type LayoutDefaultNode = { type: string; content?: Record<string, unknown> };

/**
 * Fills `content.layout` ONLY for nodes whose type has a registered resolver above AND
 * whose content.layout is still unset — an explicit architect-authored layout always wins,
 * exactly like applyStrategyDefaults never overwrites an explicit design field. Returns a
 * NEW array; does not mutate input nodes.
 *
 * Deliberately non-generic (plain LayoutDefaultNode[] in/out, mirroring
 * applyStrategyDefaults above) — callers on the Deno edge function and the client each have
 * their own structurally-similar-but-not-identical SiteNode type and cast at the call site,
 * same as applyStrategyDefaults. A generic here would fight TypeScript: returning a spread
 * of a generic type param as that same type param does not type-check, for no real benefit
 * since this function only ever reads/writes `content.layout`.
 */
export function applyLayoutDefaults(
  nodes: LayoutDefaultNode[],
  strategy: StrategyInput
): LayoutDefaultNode[] {
  return nodes.map((node) => {
    const resolver = LAYOUT_DEFAULT_RESOLVERS[node.type];
    if (!resolver) return node;
    const content = node.content ?? {};
    if (content.layout !== undefined) return node;
    return { ...node, content: { ...content, layout: resolver(strategy) } };
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
