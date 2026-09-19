/**
 * Phase 6A — responsive contract foundation.
 *
 * `responsive.mobile.contentOrder` and `responsive.mobile.columns` are generic fields on
 * every SiteNode's `responsive.mobile` object (same shape everywhere, per Phase 6A.0's
 * applicability-model decision: keep the schema generic, validate applicability explicitly
 * — no per-composition Zod schemas). Without an explicit applicability check, either field
 * would appear to "work" on every node while only visibly affecting a handful of composition
 * families — the exact silent-capability problem `ux.mobileStrategy` and the pre-Phase-6.1
 * `responsive.mobile` fields already demonstrated (see Phase 6.1 audit).
 *
 * This module is the single source of truth for which (type, variant) pairs may legally
 * carry each new field. Like `compositionLayouts.ts`, it has no zod dependency, so it is
 * importable unchanged from both the client (`@shared` alias) and the Deno edge function
 * (relative `.ts` import).
 *
 * Safe default for BOTH tables: NOT APPLICABLE unless explicitly listed. A composition added
 * later without an explicit entry here is rejected, not silently accepted — see the
 * applicability-table-drift test in the Phase 6A selftest, which fails if any registered
 * (type, variant) pair is missing from both tables.
 */

export const CONTENT_ORDER_VALUES = ['preserve', 'media_first', 'text_first'] as const;
export type ContentOrder = (typeof CONTENT_ORDER_VALUES)[number];

export const MOBILE_COLUMNS_VALUES = [1, 2] as const;
export type MobileColumns = (typeof MOBILE_COLUMNS_VALUES)[number];

/**
 * `contentOrder` is only meaningful on compositions with two authored, ordered regions
 * (a media block and a copy block) whose relative order the mobile/compact viewport can
 * flip. Verified against each composition's actual JSX structure (compositions.tsx):
 *  - hero/editorial_split: copy-then-media in the DOM; compact CSS today hardcodes
 *    image-first via `order:-1` — contentOrder makes that authorable instead of fixed.
 *  - hero/product_focus: figure-then-copy in the DOM already.
 *  - editorialSplit/image_text: media/copy split, with its own *desktop* `content.reverse`
 *    boolean already — contentOrder is an independent, compact-viewport-only control.
 *    EXCEPT its `overlayStatement` content.layout: that sub-layout renders no media/copy
 *    grid at all (a full-bleed image with a copy panel overlapping it via negative margin,
 *    not two ordered flex/grid siblings) — see the LAYOUT-AWARE EXCEPTIONS note below.
 *  - productSpotlight/feature: media/copy split (feature/imageDominant/structuredFeature) —
 *    all three content.layout values keep the same `.ai-v2-spotlight-grid` two-region
 *    structure (only ratio/DOM-order differ), so no layout-aware exception is needed here.
 *
 * Explicitly NOT applicable:
 *  - hero/luxury_minimal: full-bleed background image + overlay copy — no separate media
 *    block to reorder relative to text.
 *  - collections/tiles (stacked sub-layout has its own PER-ROW `data-reverse` alternation,
 *    not a per-node order) and editorialMosaic/asymmetric (multi-image, not a binary
 *    media/text pair) — both are real gaps, deferred to a later, composition-specific
 *    primitive (Phase 6.1 §R Option D), not solved by this generic field.
 *  - every productGrid/productRail/brandStatement/newsletter/testimonials/reviews/nav/
 *    footer/announcement composition — none are a two-region media/text pair.
 *
 * LAYOUT-AWARE EXCEPTIONS (Phase 6A.1): applicability at the (type, variant) level is not
 * always sufficient. The ONE such exception, in the whole CONTENT_ORDER_APPLICABLE set, is
 * `editorialSplit/image_text`: it is a two-region composition for `classicSplit`/
 * `offsetNarrow` content.layout (or unset, which defaults to classicSplit), but NOT for
 * `overlayStatement` (see the editorialSplit/image_text bullet above for why). Rather than
 * accept the field there and silently do nothing (the exact "capability that appears
 * supported but isn't" failure this module exists to prevent), `isContentOrderApplicable`
 * takes the node's resolved `content.layout` as a third, optional argument and rejects that
 * one incompatible combination explicitly.
 *
 * `productSpotlight/feature` has NO such exception — all three of its content.layout values
 * (`feature`/`imageDominant`/`structuredFeature`) keep the same two-region
 * `.ai-v2-spotlight-grid` structure (see its bullet above), so `layout` never changes its
 * result. Every other approved (type, variant) pair is likewise exception-free, verified
 * against each one's actual JSX in compositions.tsx (see per-entry notes above) — so
 * `layout` is a genuine narrowing input for exactly one pair, not a general-purpose
 * workaround, and every caller (validateSiteTree.ts, siteOps.ts, the edge validateRegistry,
 * and the critique SiteOps guard) passes the same resolved value through this one function
 * rather than re-deriving the exception locally.
 */
const CONTENT_ORDER_APPLICABLE: ReadonlySet<string> = new Set([
  'hero/editorial_split',
  'hero/product_focus',
  'editorialSplit/image_text',
  'productSpotlight/feature',
]);

/** The one (type, variant, content.layout) combination that is a member of
 *  CONTENT_ORDER_APPLICABLE at the (type, variant) level but must still be rejected — see
 *  the LAYOUT-AWARE EXCEPTIONS note above. */
function isLayoutExcludedFromContentOrder(type: string, variant: string, layout: unknown): boolean {
  return type === 'editorialSplit' && variant === 'image_text' && layout === 'overlayStatement';
}

/**
 * `columns` is only meaningful on compositions that render a repeating item grid whose
 * column count can plausibly be 1 or 2 at a compact viewport:
 *  - productGrid/editorial: all four `content.layout` values render a real repeating grid
 *    region with a CSS consumer (v2.css, all inside the compact-viewport media query):
 *    `standardEditorial`/`dense` -> `.ai-v2-merch-grid`; `featureFirst` -> `.ai-v2-merch-side`
 *    (the SECONDARY region only — the featured/anchor item in `.ai-v2-merch-feature`'s first
 *    column is untouched); `asymmetricFeature` -> `.ai-v2-merch-asymmetric-fill` (the
 *    repeating fill region only — `.ai-v2-merch-asymmetric-anchor` is untouched). Verified
 *    by the Phase 6A.1 selftest, not just asserted here — see the "truthful applicability"
 *    tests in scripts/ai-studio-v2-phase6a-responsive-selftest.ts.
 *  - reviews/wall: the `grid` sub-layout is a dense card grid; `index` is a vertical list,
 *    but the field is still legal at the node-type level (same conditional-meaningfulness
 *    precedent as `design.minHeight` on a hidden node) — Phase 6B decides whether to author
 *    it per sub-layout.
 *  - collections/tiles: the `editorial` sub-layout is a tile grid; `stacked` is full-width
 *    alternating rows (not column-based) — same conditional-meaningfulness note as reviews.
 *
 * Explicitly NOT applicable:
 *  - productGrid/luxury_image_first: deliberately a single oversized column at every
 *    breakpoint — accepting `columns` here would contradict the variant's entire identity.
 *  - productRail/horizontal: a flex row with horizontal scroll, not a column grid.
 *  - every hero/productSpotlight/editorialSplit/editorialMosaic/brandStatement/newsletter/
 *    testimonials/nav/footer/announcement composition — none are repeating item grids.
 */
const COLUMNS_APPLICABLE: ReadonlySet<string> = new Set([
  'productGrid/editorial',
  'reviews/wall',
  'collections/tiles',
]);

function key(type: string, variant: string): string {
  return `${type}/${variant}`;
}

/** `layout` is the node's resolved `content.layout` (undefined for compositions/values
 *  with no layout-aware exception — see the LAYOUT-AWARE EXCEPTIONS note above). Omitting
 *  it checks (type, variant) membership only, which is correct for every approved pair
 *  except editorialSplit/image_text — callers that can cheaply pass the real value should
 *  always do so. */
export function isContentOrderApplicable(type: string, variant: string, layout?: unknown): boolean {
  if (!CONTENT_ORDER_APPLICABLE.has(key(type, variant))) return false;
  if (isLayoutExcludedFromContentOrder(type, variant, layout)) return false;
  return true;
}

export function isColumnsApplicable(type: string, variant: string): boolean {
  return COLUMNS_APPLICABLE.has(key(type, variant));
}

export function isValidContentOrder(value: unknown): value is ContentOrder {
  return typeof value === 'string' && (CONTENT_ORDER_VALUES as readonly string[]).includes(value);
}

export function isValidMobileColumns(value: unknown): value is MobileColumns {
  return typeof value === 'number' && (MOBILE_COLUMNS_VALUES as readonly number[]).includes(value);
}

/**
 * Validates a node's `responsive.mobile.contentOrder`/`responsive.mobile.columns` against
 * applicability, returning a list of human-readable error messages (empty if valid). Both
 * fields are optional — absence is always valid regardless of applicability. Callers decide
 * whether to throw, collect as validation issues, or reject a SiteOps patch.
 *
 * `layout` is the node's resolved `content.layout` — required to correctly reject
 * contentOrder on editorialSplit/image_text's `overlayStatement` sub-layout (see
 * isContentOrderApplicable). Every caller must pass the REAL resolved layout, including
 * when validating a SiteOps patch that only touches `responsive` and not `content`: use the
 * existing node's current content.layout in that case, not `undefined`, or this exception
 * silently stops applying to patches that don't repeat the layout value.
 */
export function validateResponsiveApplicability(
  type: string,
  variant: string,
  mobile: { contentOrder?: unknown; columns?: unknown } | undefined,
  layout?: unknown
): string[] {
  if (!mobile) return [];
  const errors: string[] = [];
  if (mobile.contentOrder !== undefined && !isContentOrderApplicable(type, variant, layout)) {
    const reason = isLayoutExcludedFromContentOrder(type, variant, layout)
      ? `content.layout ${JSON.stringify(layout)} has no two-region media/text grid to reorder`
      : 'no two-region media/text layout';
    errors.push(`responsive.mobile.contentOrder is not applicable to ${type}/${variant} (${reason})`);
  }
  if (mobile.columns !== undefined && !isColumnsApplicable(type, variant)) {
    errors.push(`responsive.mobile.columns is not applicable to ${type}/${variant} (not a grid composition)`);
  }
  return errors;
}
