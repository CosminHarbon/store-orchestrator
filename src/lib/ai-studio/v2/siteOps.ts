import { z } from 'zod';
import { siteNodeSchema, type SiteDocument, type SiteNode } from './siteTree';

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
    patch: siteNodeSchema.partial().omit({ id: true }),
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
              responsive: op.patch.responsive
                ? { ...current.responsive, ...op.patch.responsive }
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

  return {
    ...document,
    pages: { ...document.pages, home: { ...document.pages.home, nodes } },
    meta: { ...document.meta, updatedAt: new Date().toISOString() },
  };
}
