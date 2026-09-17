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
