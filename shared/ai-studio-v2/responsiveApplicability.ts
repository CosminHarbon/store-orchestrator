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

/**
 * Phase 6C — page-level mobile-only ordering (responsive.mobile.placement).
 *
 * Kept deliberately SEPARATE from the (type, variant) applicability tables above:
 * contentOrder/columns are meaningful on a NARROW subset of variants (a genuine
 * per-composition nuance), but placement's one restriction — nav/footer chrome — is a flat,
 * variant-independent, TYPE-level exclusion covering exactly 2 of the ~14 composition types.
 * Folding it into CONTENT_ORDER_APPLICABLE/COLUMNS_APPLICABLE's per-(type,variant) Set
 * pattern would mean enumerating every nav/footer variant as excluded entries for no benefit
 * — a giant special-case table where a one-line categorical rule already exists.
 *
 * `nav` has `position: sticky; top: 0` (v2.css) — a genuine structural dependency on being
 * at/near the top of the document flow; moving it mid-page via a placement override would
 * make it "stick" partway down the page once scrolled there. `footer` has no equivalent CSS
 * dependency, but is the site's closing/legal/commerce-wrap-up chrome — appearing mid-page
 * is an obvious semantic break regardless. Both are excluded in BOTH roles: neither may carry
 * a placement itself (mover), and no other node's placement may anchor to either of them.
 * `announcement`/`hero` are deliberately NOT restricted — no structural or schema dependency
 * on their position was found (see Phase 6C audit), and restricting them would cost real
 * future conversational-editing flexibility for no demonstrated benefit.
 */
const PLACEMENT_RESTRICTED_TYPES: ReadonlySet<string> = new Set(['nav', 'footer']);

export function isPlacementAllowed(type: string): boolean {
  return !PLACEMENT_RESTRICTED_TYPES.has(type);
}

/** `id`/`type` are typed optional and `responsive` is `unknown` (same defensive-typing idiom
 *  as `validateResponsiveApplicability`'s own `mobile` param above), even though every real
 *  SiteNode always has both: TypeScript's whole-program inference for the actual SiteNode
 *  type (as it flows through this codebase's larger zod-schema graph) sometimes reports it as
 *  effectively deep-partial at call sites requiring a required field — a PRE-EXISTING
 *  characteristic visible even on the current baseline (see critiqueClient.ts's own
 *  SiteDocument-vs-Json assignability error), not something this module's types introduce.
 *  Typing both as optional here, with the explicit runtime guards below, sidesteps that
 *  whole-program inference artifact without weakening real behavior: a node genuinely
 *  missing an id/type is simply skipped, exactly like any other malformed/legacy input this
 *  module already tolerates. */
export type PlacementSourceNode = {
  id?: string;
  type?: string;
  responsive?: unknown;
};

export type PlacementDropReason =
  | 'self_reference'
  | 'missing_target'
  | 'restricted_mover'
  | 'restricted_anchor'
  | 'cycle';

/** "from" must render before "to". */
export type PlacementEdge = { from: string; to: string };

export type PlacementEdgeResult = {
  edges: PlacementEdge[];
  dropped: Array<{ nodeId: string; reason: PlacementDropReason }>;
};

/**
 * Single source of truth for turning per-node `placement` values into an acyclic "must
 * render before" edge set — reused, unchanged, by BOTH write-time validation
 * (validatePlacementGraph below, and siteOps.ts's end-of-batch check) and the render-time
 * resolver (responsiveOverride.ts's resolveMobileOrder), so cycle-breaking and every
 * rejection reason are defined in exactly one place, not two independently-maintained copies.
 *
 * Processes nodes in the given (desktop) array order, so which edge gets dropped when a
 * cycle would otherwise form is deterministic (the edge attempted by the later-desktop-index
 * mover loses) — see the Phase 6C resolver audit's Case F.
 *
 * `nodes` should be the FULL node set for write-time validation (a placement referencing a
 * currently-hidden-but-persisted node is structurally valid — hidden is a render-time state,
 * not a document-validity concern) and the CURRENTLY-VISIBLE node set for the render-time
 * resolver (so a hidden anchor naturally reports as 'missing_target' and its placement is
 * ignored for that render, exactly the hidden-anchor-fallback contract — see
 * responsiveOverride.ts). This function itself does not distinguish "hidden" from "deleted";
 * callers express that distinction purely through what they include in `nodes`.
 */
export function buildPlacementEdges(nodes: PlacementSourceNode[]): PlacementEdgeResult {
  const byId = new Map<string, PlacementSourceNode>();
  for (const n of nodes) {
    if (typeof n.id === 'string') byId.set(n.id, n);
  }
  const dropped: PlacementEdgeResult['dropped'] = [];
  const edges: PlacementEdge[] = [];
  const successors = new Map<string, string[]>();

  function wouldCreateCycle(from: string, to: string): boolean {
    // Adding from->to would close a cycle iff `to` can already (transitively) reach `from`
    // through already-accepted edges.
    const stack = [to];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop() as string;
      if (cur === from) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of successors.get(cur) || []) stack.push(next);
    }
    return false;
  }

  for (const node of nodes) {
    if (typeof node.id !== 'string') continue; // defensive only — a real SiteNode always has an id
    const nodeId: string = node.id;
    const responsive = node.responsive as { mobile?: { placement?: { beforeId?: string; afterId?: string } | null } } | undefined;
    const placement = responsive?.mobile?.placement;
    if (!placement) continue;
    const targetId = 'beforeId' in placement ? placement.beforeId : placement.afterId;
    if (!targetId) continue; // malformed past zod — defensive only, never valid input here

    if (targetId === nodeId) {
      dropped.push({ nodeId, reason: 'self_reference' });
      continue;
    }
    const targetNode = byId.get(targetId);
    if (!targetNode) {
      dropped.push({ nodeId, reason: 'missing_target' });
      continue;
    }
    if (!isPlacementAllowed(node.type ?? '')) {
      dropped.push({ nodeId, reason: 'restricted_mover' });
      continue;
    }
    if (!isPlacementAllowed(targetNode.type ?? '')) {
      dropped.push({ nodeId, reason: 'restricted_anchor' });
      continue;
    }
    const from = 'beforeId' in placement ? nodeId : targetId;
    const to = 'beforeId' in placement ? targetId : nodeId;
    if (wouldCreateCycle(from, to)) {
      dropped.push({ nodeId, reason: 'cycle' });
      continue;
    }
    edges.push({ from, to });
    successors.set(from, [...(successors.get(from) || []), to]);
  }

  return { edges, dropped };
}

/**
 * Stable topological sort: returns `nodeIds` reordered to satisfy every edge in `edges`
 * ("from" before "to"), preferring — among nodes with no remaining unsatisfied predecessor —
 * whichever has the LOWEST original desktop index. This is what makes the result "as close
 * to canonical desktop order as possible" rather than an arbitrary valid ordering: a node
 * with no constraints, or whose constraints are already satisfied, never moves further than
 * necessary. `edges` must already be acyclic (buildPlacementEdges guarantees this) — this
 * function does not itself re-check for cycles.
 */
export function stableTopologicalSort(nodeIdsInDesktopOrder: string[], edges: PlacementEdge[]): string[] {
  const indexOf = new Map(nodeIdsInDesktopOrder.map((id, i) => [id, i]));
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIdsInDesktopOrder) inDegree.set(id, 0);
  for (const { from, to } of edges) {
    successors.set(from, [...(successors.get(from) || []), to]);
    inDegree.set(to, (inDegree.get(to) || 0) + 1);
  }

  const remaining = new Set(nodeIdsInDesktopOrder);
  const output: string[] = [];
  while (remaining.size > 0) {
    let best: string | null = null;
    for (const id of remaining) {
      if ((inDegree.get(id) || 0) === 0) {
        if (best === null || (indexOf.get(id) as number) < (indexOf.get(best) as number)) best = id;
      }
    }
    // Defensive only: buildPlacementEdges guarantees an acyclic edge set, so every remaining
    // node reaches in-degree 0 eventually. If this ever fires anyway (e.g. a caller passes a
    // hand-built cyclic edge list directly, bypassing buildPlacementEdges), break the
    // deadlock deterministically rather than looping forever — never crash, never drop a node.
    if (best === null) {
      best = [...remaining].sort((a, b) => (indexOf.get(a) as number) - (indexOf.get(b) as number))[0];
    }
    output.push(best);
    remaining.delete(best);
    for (const next of successors.get(best) || []) {
      inDegree.set(next, (inDegree.get(next) || 0) - 1);
    }
  }
  return output;
}

function describePlacementDrop(nodeId: string, reason: PlacementDropReason): string {
  switch (reason) {
    case 'self_reference':
      return `responsive.mobile.placement on node ${nodeId} references itself`;
    case 'missing_target':
      return `responsive.mobile.placement on node ${nodeId} references a node id that does not exist`;
    case 'restricted_mover':
      return `responsive.mobile.placement is not allowed on node ${nodeId} (nav/footer cannot be repositioned)`;
    case 'restricted_anchor':
      return `responsive.mobile.placement on node ${nodeId} references a nav/footer node, which cannot be used as an anchor`;
    case 'cycle':
      return `responsive.mobile.placement on node ${nodeId} would create a placement cycle`;
  }
}

/**
 * WRITE-TIME / full-document validation: every drop reported by buildPlacementEdges is a
 * hard error here (unlike the render-time resolver, which silently ignores drops as
 * defense-in-depth for legacy/corrupt documents). Returns human-readable messages, empty if
 * valid. Pass the FULL node set — see buildPlacementEdges' own doc comment for why hidden
 * nodes must still be considered "existing" at this layer.
 *
 * Used both by siteDocumentSchema's own superRefine (siteTree.ts) — so a document loaded
 * directly from persistence is validated independently of whether it ever passed through
 * SiteOps — and by siteOps.ts's end-of-batch check after applying a batch of ops.
 */
export function validatePlacementGraph(nodes: PlacementSourceNode[]): string[] {
  const { dropped } = buildPlacementEdges(nodes);
  return dropped.map(({ nodeId, reason }) => describePlacementDrop(nodeId, reason));
}
