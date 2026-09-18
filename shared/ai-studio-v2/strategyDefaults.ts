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

// Phase 5B — the same authoritative (type, variant) -> allowed-layout-values catalog
// validateRegistry uses downstream, reused here as a defensive guard so applyLayoutDefaults
// can never write a content.layout value that is invalid for a node's exact variant (see
// applyLayoutDefaults' own comment below).
import { isValidLayout } from './compositionLayouts.ts';

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

export type HeroEditorialSplitLayout = 'split' | 'asymmetric';

/**
 * Phase 5B — hero/editorial_split's two layouts (see compositions.tsx HeroEditorialSplit)
 * differ in exactly one structural way: an even 50/50 copy/media split vs. media offset
 * off-center. That IS asymmetry's own definition, so it is the only signal consulted here
 * — not heroPhilosophy (which already fully spends its signal on CHOOSING editorial_split
 * as the hero variant in the first place, via the site-architect prompt's heroPhilosophy →
 * hero-variant rule; it has no further value left to discriminate a layout choice inside
 * the variant it already picked) and not typographyRole/imageryRole (neither has any
 * bearing on a copy/media ratio split). 'split' is the pre-existing renderer fallback
 * (compositions.tsx: `layoutOf(node, 'split')`), so low/medium asymmetry — the "nothing
 * unusual to express" case — resolves identically to pre-Phase-5B behavior.
 */
export function heroEditorialSplitLayoutDefault(
  strategy: Pick<StrategyInput, 'asymmetry'>
): HeroEditorialSplitLayout {
  return strategy.asymmetry === 'high' ? 'asymmetric' : 'split';
}

export type HeroLuxuryMinimalLayout = 'quiet' | 'cinematic';

/**
 * Phase 5B — 'cinematic' (deeper veil, eyebrow kicker, bottom-anchored copy — see
 * compositions.tsx HeroLuxuryMinimal) is a more immersive, image-carries-the-moment
 * treatment than the default centered-quiet open. That is exactly what imageryRole:
 * 'dominant' already means elsewhere in this file (fullBleed/measure=bleed for
 * IMAGE_LED_TYPES) — reusing it here is the same signal doing the same conceptual job
 * (how much should imagery carry), not a new coupling. heroPhilosophy is deliberately not
 * consulted: every heroPhilosophy value that prefers luxury_minimal (atmosphere_first,
 * sometimes typography_first) has already spent its signal selecting the VARIANT; none of
 * them further distinguishes a quiet vs. cinematic mood within it. 'quiet' is the
 * pre-existing renderer fallback, so balanced/supporting imagery resolves unchanged.
 */
export function heroLuxuryMinimalLayoutDefault(
  strategy: Pick<StrategyInput, 'imageryRole'>
): HeroLuxuryMinimalLayout {
  return strategy.imageryRole === 'dominant' ? 'cinematic' : 'quiet';
}

export type HeroProductFocusLayout = 'stage' | 'stacked';

/**
 * Phase 5B — 'stacked' (image above copy, centered, taller/narrower — see compositions.tsx
 * HeroProductFocus) is the image-leads treatment; 'stage' (the default, side-by-side) gives
 * copy and product equal weight. Same imageryRole semantics as
 * heroLuxuryMinimalLayoutDefault above, applied to a different hero variant — imagery
 * carrying more of the composition vs. sharing it evenly. heroPhilosophy is again
 * deliberately not consulted: product_as_artifact/immediate_offer already chose
 * product_focus as the variant; neither value describes a stage/stacked geometry
 * preference. 'stage' is the pre-existing renderer fallback, so balanced/supporting
 * imagery resolves unchanged.
 */
export function heroProductFocusLayoutDefault(
  strategy: Pick<StrategyInput, 'imageryRole'>
): HeroProductFocusLayout {
  return strategy.imageryRole === 'dominant' ? 'stacked' : 'stage';
}

export type ProductGridEditorialLayout =
  | 'featureFirst'
  | 'asymmetricFeature'
  | 'dense';

/**
 * Phase 5B — productGrid/editorial registers FOUR content.layout values
 * (compositionLayouts.ts), but only two have a clean, single-signal semantic match:
 * 'dense' IS density's own definition (renderer comment: "more columns, tighter gap — a
 * real structural density difference"), and 'asymmetricFeature' IS asymmetry's own
 * definition (one oversized anchor tile + an irregular fill grid, vs. an even grid).
 * imageryRole is deliberately NOT consulted: the genuinely correct imagery-dominant
 * response already exists one level up, as the separate productGrid/luxury_image_first
 * REGISTRY VARIANT (full-bleed single-column imagery — see its own doc comment in
 * compositions.tsx) — that is variant selection, owned by the site-architect prompt, not
 * a content.layout default this function is chartered to duplicate or shadow.
 * 'standardEditorial' is deliberately never resolved here either: it is the plain grid
 * with no anchor tile and no dense-CSS override, structurally identical to what "unset"
 * already rendered as before compositionLayouts.ts existed to name it — Hearth & Grove's
 * fixture already authors it explicitly for exactly that reason (see fixtures.ts). Picking
 * it here would not be an "easy to explain" mapping — no strategy signal means "the plain
 * grid," it is only ever a deliberate architect choice.
 * PRECEDENCE: asymmetry is checked first when both creativeStrategy.density='high' and
 * asymmetry='high' are true. asymmetricFeature is the more structurally decisive
 * composition (a different DOM shape, not just tighter columns) — the same "check the
 * stronger structural signal first" precedent already set by
 * editorialSplitLayoutDefault/productSpotlightLayoutDefault above (typographyRole before
 * imageryRole there). Losing the LAYOUT-CHOICE precedence does not mean density stops
 * mattering to this section's rendered output: `.ai-v2-merch-asymmetric` also carries
 * `data-density={brand.tokens.density}` (compositions.tsx) for its internal anchor+fill
 * gap sizing — but per the Phase 5A audit, brand.tokens.density comes from
 * artDirection.density ('sparse'|'balanced'|'dense'), a SEPARATE, independently-generated
 * signal from this function's own `creativeStrategy.density` ('low'|'medium'|'high')
 * parameter, not the same one "still reaching" the grid under another name. The two can
 * disagree (e.g. creativeStrategy.density='high' picking a layout, while
 * artDirection.density='sparse' sizes that layout's internal gaps loosely) — reconciling
 * the two density concepts is out of scope here and deferred to Phase 5C.
 * 'featureFirst' is the pre-existing renderer fallback (compositions.tsx:
 * `layoutOf(node, 'featureFirst')`), so low/medium creativeStrategy.density+asymmetry
 * resolves unchanged.
 */
export function productGridEditorialLayoutDefault(
  strategy: Pick<StrategyInput, 'density' | 'asymmetry'>
): ProductGridEditorialLayout {
  if (strategy.asymmetry === 'high') return 'asymmetricFeature';
  if (strategy.density === 'high') return 'dense';
  return 'featureFirst';
}

export type ProductRailHorizontalLayout = 'uniform' | 'alternatingOversized';

/**
 * Phase 5B — the renderer's OWN pre-existing comment already names the signal:
 * "alternatingOversized: every third item breaks scale, giving the rail a syncopated
 * RHYTHM instead of a uniform filmstrip" (compositions.tsx ProductRailHorizontal). rhythm
 * is therefore the one clean discriminator, not asymmetry or density — a rail's
 * scale-breaking cadence is a pacing property, the same thing rhythm already governs via
 * rhythmSpacing() above, just expressed on a single section instead of across the page.
 * The two "irregular/contrast" rhythm values (rapid_contrast, long_short_long) resolve to
 * alternatingOversized; the two "regular/calm" values (sparse_pause, even) resolve to
 * 'uniform', the pre-existing renderer fallback (`layoutOf(node, 'uniform')`) — so a
 * sparse_pause or even brand's rail renders unchanged.
 */
export function productRailHorizontalLayoutDefault(
  strategy: Pick<StrategyInput, 'rhythm'>
): ProductRailHorizontalLayout {
  return strategy.rhythm === 'rapid_contrast' || strategy.rhythm === 'long_short_long'
    ? 'alternatingOversized'
    : 'uniform';
}

/** Composition (type/variant) keys with a registered content.layout default rule.
 *  Phase 4A/4B/4C/4D wired editorialSplit/image_text, productSpotlight/feature,
 *  brandStatement/large_type, newsletter/quiet, collections/tiles, testimonials/editorial,
 *  and reviews/wall. Phase 5B adds the three highest-frequency compositions: all three hero
 *  variants and productGrid/editorial and productRail/horizontal. Keyed by `${type}/${variant}`
 *  (matching compositionLayouts.ts's own key convention) rather than by type alone —
 *  hero and productGrid each register MULTIPLE variants with different (sometimes entirely
 *  absent, e.g. productGrid/luxury_image_first) layout vocabularies, so a type-only key
 *  could resolve a default that is invalid for the node's actual variant. Every one of the
 *  seven Phase-4 types still has exactly one registered variant today, so converting their
 *  keys to `${type}/${variant}` form is lossless — same coverage, just precise addressing.
 *  Deliberately not a broad "every registered composition" pass — each entry here was added
 *  only once its own audit/semantic-match pass justified it (see Phase 5A/5B audits);
 *  productGrid/luxury_image_first, footer/*, nav/*, announcement/slim intentionally have no
 *  entry, either because they have no documented content.layout vocabulary at all
 *  (compositionLayouts.ts) or because no Phase 5A/5B signal cleanly justified one yet. */
const LAYOUT_DEFAULT_RESOLVERS: Record<string, (strategy: StrategyInput) => string> = {
  'hero/editorial_split': heroEditorialSplitLayoutDefault,
  'hero/luxury_minimal': heroLuxuryMinimalLayoutDefault,
  'hero/product_focus': heroProductFocusLayoutDefault,
  'productGrid/editorial': productGridEditorialLayoutDefault,
  'productRail/horizontal': productRailHorizontalLayoutDefault,
  'editorialSplit/image_text': editorialSplitLayoutDefault,
  'productSpotlight/feature': productSpotlightLayoutDefault,
  'brandStatement/large_type': brandStatementLayoutDefault,
  'newsletter/quiet': newsletterLayoutDefault,
  'collections/tiles': collectionsLayoutDefault,
  'testimonials/editorial': testimonialsLayoutDefault,
  'reviews/wall': reviewsLayoutDefault,
};

export type LayoutDefaultNode = { type: string; variant?: string; content?: Record<string, unknown> };

/**
 * Fills `content.layout` ONLY for nodes whose `${type}/${variant}` has a registered
 * resolver above AND whose content.layout is still unset — an explicit architect-authored
 * layout always wins, exactly like applyStrategyDefaults never overwrites an explicit
 * design field. Returns a NEW array; does not mutate input nodes.
 *
 * Keyed by `${type}/${variant}`, not `type` alone (Phase 5B) — see LAYOUT_DEFAULT_RESOLVERS'
 * own comment for why type-only keying is unsafe once a type has multiple variants with
 * different layout vocabularies.
 *
 * Variant-safety guard: the resolved value is only written if `isValidLayout` (the same
 * authoritative check `validateRegistry` uses downstream) confirms it as valid for this
 * EXACT (type, variant) — e.g. a resolver bug or a future variant with no documented
 * layout vocabulary (like productGrid/luxury_image_first) can never leak an invalid
 * content.layout onto a node; it just leaves content.layout unset instead, same as if no
 * resolver were registered at all.
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
    const resolver = LAYOUT_DEFAULT_RESOLVERS[`${node.type}/${node.variant || ''}`];
    if (!resolver) return node;
    const content = node.content ?? {};
    if (content.layout !== undefined) return node;
    const resolved = resolver(strategy);
    if (!isValidLayout(node.type, node.variant || '', resolved)) return node;
    return { ...node, content: { ...content, layout: resolved } };
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

/** Mirrors NavigationBehavior's own union (creativeStrategy.ts) as a plain literal type rather
 *  than importing it — same reason StrategyInput above hand-mirrors its fields: this module
 *  stays import-free of the zod-schema half of creativeStrategy.ts, which differs between the
 *  Deno and npm zod runtimes. */
export type NavigationBehaviorInput = 'quiet_overlay' | 'solid_compact' | 'bold_campaign' | 'minimal_chrome';

export type ChromeVariants = {
  navVariant: 'transparent' | 'minimal';
  footerVariant: 'editorial_luxury' | 'minimal_commerce';
};

/**
 * Phase 5C.3 — deterministic nav/footer variant pair for a given navigationBehavior.
 *
 * GENERATION-TIME ONLY. Call this exactly once, inside the initial architect-generation
 * pipeline (aiStudioV2.ts's buildDocument), before a SiteDocument is first persisted — see
 * the Phase 5C.3A audit. Do NOT call this from SiteTree load/parse, SiteOps apply, critique
 * application, or the renderer: once a SiteDocument exists, node.variant is ordinary editable
 * document state, and there is no field-level provenance to distinguish an LLM-authored
 * variant from a later user edit (e.g. a future "make the navigation solid" conversational
 * edit via SiteOps). Repairing on every load/edit would silently revert that kind of edit.
 */
export function resolveChromeVariants(navigationBehavior: NavigationBehaviorInput): ChromeVariants {
  switch (navigationBehavior) {
    case 'quiet_overlay':
    case 'minimal_chrome':
      return { navVariant: 'transparent', footerVariant: 'editorial_luxury' };
    case 'solid_compact':
    case 'bold_campaign':
      return { navVariant: 'minimal', footerVariant: 'minimal_commerce' };
  }
}

/** Minimal shape applyChromeVariants needs — mirrors LayoutDefaultNode's own convention
 *  (plain, non-generic in/out; see applyLayoutDefaults' comment for why a generic here
 *  would fight TypeScript for no real benefit). */
export type ChromeVariantNode = { type: string; variant?: string };

/**
 * Repairs `variant` on nav/footer nodes to match navigationBehavior deterministically.
 * GENERATION-TIME ONLY — see resolveChromeVariants' doc comment above; this function has
 * the exact same call-site restriction. Only nav/footer nodes are ever touched, and only
 * when their variant differs from the resolved value — an already-coherent node (or any
 * other node type) is returned by reference, unchanged. All other fields (id, content,
 * design, responsive, dataBindings, meta) are preserved exactly. Returns a NEW array;
 * does not mutate input nodes.
 */
export function applyChromeVariants(
  nodes: ChromeVariantNode[],
  navigationBehavior: NavigationBehaviorInput
): ChromeVariantNode[] {
  const { navVariant, footerVariant } = resolveChromeVariants(navigationBehavior);
  return nodes.map((node) => {
    if (node.type === 'nav' && node.variant !== navVariant) {
      return { ...node, variant: navVariant };
    }
    if (node.type === 'footer' && node.variant !== footerVariant) {
      return { ...node, variant: footerVariant };
    }
    return node;
  });
}
