import { z } from 'zod';
import { siteOpsSchema, type SiteOp, type SiteOps, applySiteOps } from './siteOps';
import { isValidComposition } from './compositionCatalog';
import type { SiteDocument } from './siteTree';
import type { CritiqueRecommendation } from './critiqueScoreCard';

export type SiteOpsValidationResult = {
  ops: SiteOps;
  rejected: Array<{ reason: string; recommendation?: CritiqueRecommendation; op?: unknown }>;
};

/** Validate SiteOps against schema, existing node ids, and composition registry. */
export function validateSiteOpsAgainstDocument(
  document: SiteDocument,
  ops: unknown,
  recommendations?: CritiqueRecommendation[]
): SiteOpsValidationResult {
  const rejected: SiteOpsValidationResult['rejected'] = [];
  const parsed = siteOpsSchema.safeParse(ops);
  if (!parsed.success) {
    return {
      ops: [],
      rejected: [{ reason: `Invalid SiteOps schema: ${parsed.error.issues[0]?.message}` }],
    };
  }

  const nodeIds = new Set(document.pages.home.nodes.map((n) => n.id));
  const valid: SiteOp[] = [];

  for (const op of parsed.data) {
    try {
      if (op.op === 'insert') {
        if (nodeIds.has(op.node.id)) throw new Error(`duplicate id ${op.node.id}`);
        if (!isValidComposition(op.node.type, op.node.variant)) {
          throw new Error(`invalid composition ${op.node.type}/${op.node.variant}`);
        }
        if (op.afterId && !nodeIds.has(op.afterId)) throw new Error(`afterId not found ${op.afterId}`);
        // merchant content protection on insert body
        nodeIds.add(op.node.id);
        valid.push(op);
        continue;
      }

      if (op.op === 'delete' || op.op === 'style' || op.op === 'update' || op.op === 'replace' || op.op === 'move') {
        if (!nodeIds.has(op.id)) throw new Error(`unknown node ${op.id}`);
      }

      if (op.op === 'style') {
        valid.push(op);
        continue;
      }

      if (op.op === 'move') {
        if (op.afterId && !nodeIds.has(op.afterId) && op.afterId !== null) {
          throw new Error(`afterId not found ${op.afterId}`);
        }
        valid.push(op);
        continue;
      }

      if (op.op === 'delete') {
        const node = document.pages.home.nodes.find((n) => n.id === op.id);
        if (node?.type === 'nav' || node?.type === 'footer' || node?.type === 'hero') {
          throw new Error(`refusing to delete required ${node.type}`);
        }
        valid.push(op);
        continue;
      }

      if (op.op === 'replace') {
        if (!isValidComposition(op.node.type, op.node.variant)) {
          throw new Error(`invalid composition ${op.node.type}/${op.node.variant}`);
        }
        if (op.node.id !== op.id) throw new Error('replace node.id must match id');
        valid.push(op);
        continue;
      }

      if (op.op === 'update') {
        const node = document.pages.home.nodes.find((n) => n.id === op.id);
        if (op.patch.variant && node && !isValidComposition(node.type, op.patch.variant)) {
          throw new Error(`invalid variant ${node.type}/${op.patch.variant}`);
        }
        if (op.patch.type && node && op.patch.variant && !isValidComposition(op.patch.type, op.patch.variant)) {
          throw new Error(`invalid composition ${op.patch.type}/${op.patch.variant}`);
        }
        // Protect merchant copy
        if (node?.content?.copyType === 'merchant' && op.patch.content) {
          const blocked = Object.keys(op.patch.content).some((k) =>
            ['title', 'subtitle', 'body', 'statement', 'text', 'blurb'].includes(k)
          );
          if (blocked) throw new Error('refusing to rewrite merchant copy');
        }
        valid.push(op);
        continue;
      }
    } catch (err) {
      rejected.push({
        reason: err instanceof Error ? err.message : String(err),
        op,
        recommendation: recommendations?.find((r) => r.targetNodeId === ('id' in op ? op.id : undefined)),
      });
    }
  }

  // Dry-run apply
  try {
    applySiteOps(document, valid);
  } catch (err) {
    return {
      ops: [],
      rejected: [
        ...rejected,
        { reason: `applySiteOps dry-run failed: ${err instanceof Error ? err.message : String(err)}` },
      ],
    };
  }

  return { ops: valid, rejected };
}

export function filterRecommendationsForSiteOps(
  recommendations: CritiqueRecommendation[]
): CritiqueRecommendation[] {
  return recommendations.filter((r) => r.category !== 'intentional');
}
