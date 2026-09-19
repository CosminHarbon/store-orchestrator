import { z } from 'zod';
import { siteNodeSchema, nodeResponsiveSchema, COMPOSITION_VARIANTS, type SiteDocument, type SiteNode } from './siteTree';
import { normalizeDesignSemantics } from '@shared/ai-studio-v2/strategyDefaults';
import { isValidLayout } from '@shared/ai-studio-v2/compositionLayouts';
import { validateResponsiveApplicability, validatePlacementGraph } from '@shared/ai-studio-v2/responsiveApplicability';

/**
 * PATCH-ONLY nullable-clear schema for `update.patch.responsive` — distinct from the
 * persisted `nodeResponsiveSchema` (siteTree.ts), which stays strictly non-nullable (Phase
 * 6C.0C audit: a stray `null` under the persisted schema fails `siteDocumentSchema.safeParse`,
 * which both `AiStorefrontTemplate.tsx` load paths and `ai-studio-publish` depend on to gate
 * whether a document can load/publish at all — that gate must never be weakened just to
 * encode an edit command). Field types (enums/unions/string bounds) are derived directly from
 * `nodeResponsiveSchema`'s own field schemas directly (each `.nullable()`'d individually
 * below), so this schema can never drift out of sync with what a valid persisted value looks
 * like — it only adds "or null" (= clear) on top of each field's real type. Deliberately NOT
 * a generic shape-mapping helper: an earlier version used one (`nullableFields<Shape extends
 * z.ZodRawShape>`), which triggered a TypeScript type-checker degradation under this file's
 * already-heavy zod generics (`z.discriminatedUnion`) — a whole-project `tsc` run produced
 * spurious "property optional" errors for unrelated `SiteNode[]` values elsewhere in the
 * project, none of which reproduced in isolation. Referencing each field explicitly avoids
 * that class of instantiation-depth issue entirely, at the cost of listing each field name
 * once (their TYPES still come from `nodeResponsiveSchema`, never retyped). See
 * `mergeMobileOrTablet`/`mergeResponsive` below for how a `null` here is resolved into
 * "delete this key" before the result is ever treated as a persisted node — no `null` ever
 * survives into a document `applySiteOps` returns.
 */
const mobileFieldSchemas = nodeResponsiveSchema.shape.mobile.unwrap().shape;
const tabletFieldSchemas = nodeResponsiveSchema.shape.tablet.unwrap().shape;

export const responsivePatchSchema = z.object({
  mobile: z
    .object({
      variant: mobileFieldSchemas.variant.nullable(),
      hide: mobileFieldSchemas.hide.nullable(),
      spacing: mobileFieldSchemas.spacing.nullable(),
      minHeight: mobileFieldSchemas.minHeight.nullable(),
      contentOrder: mobileFieldSchemas.contentOrder.nullable(),
      columns: mobileFieldSchemas.columns.nullable(),
      placement: mobileFieldSchemas.placement.nullable(),
    })
    .nullable()
    .optional(),
  tablet: z
    .object({
      variant: tabletFieldSchemas.variant.nullable(),
      hide: tabletFieldSchemas.hide.nullable(),
      spacing: tabletFieldSchemas.spacing.nullable(),
    })
    .nullable()
    .optional(),
});
export type ResponsivePatch = z.infer<typeof responsivePatchSchema>;

/**
 * Targeted mutations against SiteTree — never full-site regeneration.
 */
export const siteOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('insert'),
    afterId: z.string().max(64).optional(),
    node: siteNodeSchema,
  }),
  z.object({
    op: z.literal('update'),
    id: z.string().min(1).max(64),
    // `responsive` is overridden with the patch-only nullable-clear schema above — every
    // other field keeps siteNodeSchema.partial()'s ordinary (non-nullable) partial semantics.
    patch: siteNodeSchema.partial().omit({ id: true, responsive: true }).extend({
      responsive: responsivePatchSchema.nullable().optional(),
    }),
  }),
  z.object({
    op: z.literal('move'),
    id: z.string().min(1).max(64),
    afterId: z.string().max(64).nullable().optional(),
  }),
  z.object({
    op: z.literal('delete'),
    id: z.string().min(1).max(64),
  }),
  z.object({
    op: z.literal('replace'),
    id: z.string().min(1).max(64),
    node: siteNodeSchema,
  }),
  z.object({
    op: z.literal('style'),
    id: z.string().min(1).max(64),
    design: siteNodeSchema.shape.design,
  }),
]);
export type SiteOp = z.infer<typeof siteOpSchema>;

export const siteOpsSchema = z.array(siteOpSchema).max(40);
export type SiteOps = z.infer<typeof siteOpsSchema>;

function indexOfNode(nodes: SiteNode[], id: string) {
  return nodes.findIndex((n) => n.id === id);
}

/**
 * Merges a patch into `mobile`/`tablet` at the FIELD level — the fix for the shallow-merge
 * bug that used to replace the whole `mobile`/`tablet` object on any patch (see Phase 6C.0B
 * audit): a patch touching only `placement` no longer silently drops `hide`/`contentOrder`/
 * `columns`/etc. Scoped narrowly to this one nested shape (not a generic recursive deep-merge
 * utility) — `content`/`design`/`dataBindings` already merge correctly at their own
 * granularity today; `mobile`/`tablet` are the only fields with a further nested object.
 *
 * Contract: patch field ABSENT -> preserve current value; patch field = concrete value ->
 * overwrite only that field; patch field = null -> remove only that field; empty result ->
 * return undefined (never persist `{}`) so callers can omit the key entirely.
 */
function mergeMobileOrTablet(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (patch === undefined) return current;
  if (patch === null) return undefined;
  const merged: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else if (value !== undefined) merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Merges a patch into a node's whole `responsive` field, one level up from
 * `mergeMobileOrTablet`. `responsive` itself has `.default({})` on the persisted schema
 * (siteNodeSchema), so a parsed SiteNode always has a `responsive` object present — this
 * always returns a plain object (never `undefined`), matching that contract. `responsive:
 * null` in the patch (Phase 6C.0C's "reset all responsive customization") resolves to `{}`,
 * which is observably identical to a node that never had a responsive override, both before
 * and after any later `siteDocumentSchema.parse` round-trip (the schema's own `.default({})`
 * already normalizes an absent key to `{}`).
 */
function mergeResponsive(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (patch === undefined) return current ?? {};
  if (patch === null) return {};
  const mobile = mergeMobileOrTablet(current?.mobile as Record<string, unknown> | undefined, patch.mobile as Record<string, unknown> | null | undefined);
  const tablet = mergeMobileOrTablet(current?.tablet as Record<string, unknown> | undefined, patch.tablet as Record<string, unknown> | null | undefined);
  const result: Record<string, unknown> = {};
  if (mobile !== undefined) result.mobile = mobile;
  if (tablet !== undefined) result.tablet = tablet;
  return result;
}

/** Apply SiteOps to home page nodes. Throws on invalid references. */
export function applySiteOps(document: SiteDocument, ops: SiteOps): SiteDocument {
  let nodes = [...document.pages.home.nodes];

  for (const op of ops) {
    if (op.op === 'insert') {
      if (nodes.some((n) => n.id === op.node.id)) {
        throw new Error(`insert: duplicate node id ${op.node.id}`);
      }
      if (op.afterId) {
        const i = indexOfNode(nodes, op.afterId);
        if (i < 0) throw new Error(`insert: afterId not found ${op.afterId}`);
        nodes = [...nodes.slice(0, i + 1), op.node, ...nodes.slice(i + 1)];
      } else {
        nodes = [op.node, ...nodes];
      }
      continue;
    }

    if (op.op === 'delete') {
      const i = indexOfNode(nodes, op.id);
      if (i < 0) throw new Error(`delete: id not found ${op.id}`);
      nodes = [...nodes.slice(0, i), ...nodes.slice(i + 1)];
      // Phase 6C — auto-clear any placement referencing the just-deleted node, inline at
      // the point this delete executes (matching applySiteOps's existing sequential-script
      // model — see Phase 6C.0C §G/§H). Keeps persistence clean: the final document never
      // contains a placement pointing at a node that no longer exists. Do NOT reject the
      // delete merely because another node referenced it — see §G for why that's worse UX.
      nodes = nodes.map((n) => {
        const placement = n.responsive?.mobile?.placement as { beforeId?: string; afterId?: string } | undefined;
        if (!placement) return n;
        const targetId = 'beforeId' in placement ? placement.beforeId : placement.afterId;
        if (targetId !== op.id) return n;
        const clearedMobile = mergeMobileOrTablet(n.responsive?.mobile as Record<string, unknown> | undefined, { placement: null });
        const responsive: Record<string, unknown> = { ...n.responsive };
        if (clearedMobile === undefined) delete responsive.mobile;
        else responsive.mobile = clearedMobile;
        return { ...n, responsive: responsive as SiteNode['responsive'] };
      });
      continue;
    }

    if (op.op === 'replace') {
      const i = indexOfNode(nodes, op.id);
      if (i < 0) throw new Error(`replace: id not found ${op.id}`);
      if (op.node.id !== op.id && nodes.some((n) => n.id === op.node.id)) {
        throw new Error(`replace: duplicate node id ${op.node.id}`);
      }
      nodes = [...nodes.slice(0, i), op.node, ...nodes.slice(i + 1)];
      continue;
    }

    if (op.op === 'update' || op.op === 'style') {
      const i = indexOfNode(nodes, op.id);
      if (i < 0) throw new Error(`${op.op}: id not found ${op.id}`);
      const current = nodes[i];
      const next: SiteNode =
        op.op === 'style'
          ? { ...current, design: { ...current.design, ...op.design } }
          : {
              ...current,
              ...op.patch,
              id: current.id,
              design: op.patch.design ? { ...current.design, ...op.patch.design } : current.design,
              content: op.patch.content ? { ...current.content, ...op.patch.content } : current.content,
              responsive:
                op.patch.responsive !== undefined
                  ? (mergeResponsive(
                      current.responsive as Record<string, unknown> | undefined,
                      op.patch.responsive as Record<string, unknown> | null | undefined
                    ) as SiteNode['responsive'])
                  : current.responsive,
              dataBindings: op.patch.dataBindings
                ? { ...current.dataBindings, ...op.patch.dataBindings }
                : current.dataBindings,
            };
      nodes = [...nodes.slice(0, i), next, ...nodes.slice(i + 1)];
      continue;
    }

    if (op.op === 'move') {
      const i = indexOfNode(nodes, op.id);
      if (i < 0) throw new Error(`move: id not found ${op.id}`);
      const [item] = nodes.splice(i, 1);
      if (op.afterId) {
        const j = indexOfNode(nodes, op.afterId);
        if (j < 0) throw new Error(`move: afterId not found ${op.afterId}`);
        nodes.splice(j + 1, 0, item);
      } else {
        nodes.unshift(item);
      }
    }
  }

  // Guard against contradictory knob combinations a 'style'/'update' op could introduce
  // (e.g. fullBleed + a narrow measure) — see strategyDefaults.ts.
  const resolvedNodes: SiteNode[] = (nodes as SiteNode[]).map(
    (n: SiteNode): SiteNode =>
      n.design
        ? {
            ...n,
            design: normalizeDesignSemantics(n.type, typeof n.content?.layout === 'string' ? n.content.layout : undefined, n.design),
          }
        : n
  );

  // Reject ops that would leave the document with a structurally invalid content.layout
  // or an incompatible responsive.mobile.variant — both used to fail silently (a typo'd
  // or hallucinated value just fell through to the renderer's own default). Checking the
  // whole node array (not just touched nodes) is deliberate and still cheap: any node
  // that was already valid stays valid and costs nothing here, so this only ever catches
  // states this batch of ops actually introduced.
  for (const n of resolvedNodes) {
    const layout = (n.content as Record<string, unknown> | undefined)?.layout;
    if (!isValidLayout(n.type, n.variant, layout)) {
      throw new Error(`invalid content.layout ${JSON.stringify(layout)} for node ${n.id} (${n.type}/${n.variant})`);
    }
    const mobileVariant = n.responsive?.mobile?.variant;
    if (mobileVariant !== undefined) {
      const allowed = COMPOSITION_VARIANTS[n.type as keyof typeof COMPOSITION_VARIANTS] as readonly string[] | undefined;
      if (!allowed || !allowed.includes(mobileVariant)) {
        throw new Error(`invalid responsive.mobile.variant ${JSON.stringify(mobileVariant)} for node ${n.id} (type ${n.type})`);
      }
    }
    // Phase 6A — contentOrder/columns are generic fields but only meaningful on a subset
    // of composition types (see responsiveApplicability.ts); reject silently-ignored usage
    // the same way an incompatible mobile.variant is already rejected above. `layout` (the
    // resolved node's content.layout, already computed above) is threaded through so the
    // one layout-aware exception — editorialSplit/image_text's overlayStatement — is caught
    // here too, not just at generation time.
    for (const message of validateResponsiveApplicability(n.type, n.variant, n.responsive?.mobile, layout)) {
      throw new Error(`${message} (node ${n.id})`);
    }
  }

  // Phase 6C — whole-graph placement validation, run once over the FINAL resolved node set
  // (not per-op) — see Phase 6C.0C §H: op-level side effects (the delete auto-clear above)
  // happen inline as ops execute; graph validity (self-reference, target existence, nav/
  // footer chrome restriction, cycle-freedom) is only meaningful once the whole batch has
  // been applied, so it's checked once at the end here, same posture as the per-node checks
  // immediately above. Reuses the exact same validator the persisted schema's own
  // superRefine uses (siteTree.ts) — one implementation, not two.
  const placementIssues = validatePlacementGraph(resolvedNodes);
  if (placementIssues.length) {
    throw new Error(placementIssues.join('; '));
  }

  return {
    ...document,
    pages: { ...document.pages, home: { ...document.pages.home, nodes: resolvedNodes } },
    meta: { ...document.meta, updatedAt: new Date().toISOString() },
  };
}
