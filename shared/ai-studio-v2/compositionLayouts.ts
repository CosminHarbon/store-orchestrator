/**
 * Phase: AI Studio V2 expressiveness foundation (pre-commit fix pass).
 *
 * `content.layout` is a free-form string on every SiteNode (siteNodeSchema.content is
 * `z.record(z.unknown())` - deliberately not a giant per-composition Zod union, since the
 * set of layout modes differs per (type, variant) and content is otherwise wide open for
 * architect-authored copy). That freedom meant a typo or hallucinated layout value
 * (`asymetricFeature`, a hero layout used on a productGrid, ...) never failed anything -
 * `layoutOf()` in compositions.tsx just falls through to its own default, silently.
 *
 * This module is the single source of truth for which `content.layout` strings are valid
 * for a given (type, variant) pair, extracted from what the renderer (compositions.tsx)
 * actually branches on. It has no zod dependency, so - like strategyDefaults.ts - it can
 * be imported unchanged from both the client (via the `@shared` alias) and the Deno edge
 * function (via a relative `.ts` import), with exactly one copy of the layout lists.
 *
 * Composition types/variants not listed here don't have a documented layout mode at all;
 * for those, only an absent/undefined `content.layout` is valid.
 */

export const COMPOSITION_LAYOUTS = {
  'hero/editorial_split': ['split', 'asymmetric'],
  'hero/luxury_minimal': ['quiet', 'cinematic'],
  'hero/product_focus': ['stage', 'stacked'],
  'productGrid/editorial': ['standardEditorial', 'featureFirst', 'asymmetricFeature', 'dense'],
  'productRail/horizontal': ['uniform', 'alternatingOversized'],
  'editorialMosaic/asymmetric': ['magazine', 'immersive'],
  'testimonials/editorial': ['quote', 'imageQuote'],
  'reviews/wall': ['index', 'grid'],
  'collections/tiles': ['editorial', 'stacked'],
  /** Phase 4A — 'classicSplit' is the pre-existing (and default/fallback) shape: a plain
   *  2-col media/copy grid. 'offsetNarrow' and 'overlayStatement' are new, structurally
   *  distinct compositions (see compositions.tsx EditorialSplitImageText) — not cosmetic
   *  variants of the same grid. */
  'editorialSplit/image_text': ['classicSplit', 'offsetNarrow', 'overlayStatement'],
  /** Phase 4B — 'feature' is the pre-existing (and default/fallback) shape. 'imageDominant'
   *  and 'structuredFeature' are structurally distinct (ratio, ordering, and placement all
   *  change — see compositions.tsx ProductSpotlightFeature), not cosmetic variants. */
  'productSpotlight/feature': ['feature', 'imageDominant', 'structuredFeature'],
  /** Phase 4B — 'centered' is the pre-existing (and default/fallback) shape: one centered
   *  paragraph. 'splitStatement' and 'anchoredLarge' are structurally distinct (grid
   *  placement / breaking out of the content canvas — see compositions.tsx
   *  BrandStatementLarge), not a font-size or color variant of the same block. */
  'brandStatement/large_type': ['centered', 'splitStatement', 'anchoredLarge'],
  /** Phase 4C — 'statement' is the pre-existing (and default/fallback) shape: a centered
   *  headline + form stack. It was already the `layoutOf()` fallback in compositions.tsx
   *  before this phase, but had no entry here — meaning any architect-authored
   *  content.layout on newsletter/quiet, including this exact default string, was
   *  REJECTED by isValidLayout (see aiStudioV2.ts's validateRegistry), not just inert.
   *  'split' and 'campaign' are new, structurally distinct compositions (see
   *  compositions.tsx NewsletterQuiet) — not cosmetic variants of the same stack. */
  'newsletter/quiet': ['statement', 'split', 'campaign'],
} as const;

export type CompositionLayoutKey = keyof typeof COMPOSITION_LAYOUTS;

function layoutKey(type: string, variant: string): string {
  return `${type}/${variant}`;
}

/** Allowed `content.layout` values for a (type, variant) pair, or undefined if that
 *  composition has no documented layout modes (any explicit value is then invalid). */
export function allowedLayouts(type: string, variant: string): readonly string[] | undefined {
  return COMPOSITION_LAYOUTS[layoutKey(type, variant) as CompositionLayoutKey];
}

/**
 * True when `layout` is a valid `content.layout` value for this (type, variant):
 *  - absent/undefined/null is always valid (layout is optional everywhere)
 *  - a non-string value is invalid
 *  - a string is valid only if it's in that composition's documented layout list
 *  - if the composition has no documented layout list at all, any string is invalid
 *    (there is nothing for it to mean)
 */
export function isValidLayout(type: string, variant: string, layout: unknown): boolean {
  if (layout === undefined || layout === null) return true;
  if (typeof layout !== 'string') return false;
  const allowed = allowedLayouts(type, variant);
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(layout);
}
