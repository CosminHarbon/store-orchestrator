import { isValidComposition } from './compositionCatalog';
import { siteDocumentSchema, type SiteDocument, type SiteNode } from './siteTree';
import { validateResponsiveApplicability } from '@shared/ai-studio-v2/responsiveApplicability';

export type SiteTreeValidationIssue = {
  path: string;
  message: string;
  severity: 'error' | 'warning';
};

export function validateCompositionRegistry(nodes: SiteNode[]): SiteTreeValidationIssue[] {
  const issues: SiteTreeValidationIssue[] = [];
  for (const node of nodes) {
    if (!isValidComposition(node.type, node.variant)) {
      issues.push({
        path: `nodes.${node.id}`,
        message: `Invalid composition ${node.type}/${node.variant} — not in registry`,
        severity: 'error',
      });
    }
  }
  return issues;
}

/** Phase 6A — reject responsive.mobile.contentOrder/columns authored on a node type/variant
 *  that can't visibly express them (see shared/ai-studio-v2/responsiveApplicability.ts). */
export function validateResponsivePrimitives(nodes: SiteNode[]): SiteTreeValidationIssue[] {
  const issues: SiteTreeValidationIssue[] = [];
  for (const node of nodes) {
    const errors = validateResponsiveApplicability(node.type, node.variant, node.responsive?.mobile, node.content?.layout);
    for (const message of errors) {
      issues.push({ path: `nodes.${node.id}.responsive.mobile`, message, severity: 'error' });
    }
  }
  return issues;
}

export function validateSiteTree(raw: unknown): {
  ok: boolean;
  document: SiteDocument | null;
  issues: SiteTreeValidationIssue[];
} {
  // Phase 6C — placement graph validity (self reference, target existence, nav/footer
  // chrome restriction, cycle-freedom) is already enforced inside siteDocumentSchema's own
  // superRefine (siteTree.ts, via the shared validatePlacementGraph), the same way the
  // pre-existing nav/hero/product/footer presence checks are. A document that fails any of
  // those checks never reaches `parsed.success`, so re-running validatePlacementGraph here
  // on `parsed.data` would be dead code — deliberately not duplicated (see
  // shared/ai-studio-v2/responsiveApplicability.ts's own doc comment on why there is exactly
  // one implementation of this graph algorithm, reused by the schema, applySiteOps, and the
  // edge-mirrored schema — never a second copy).
  const parsed = siteDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      document: null,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.') || 'root',
        message: i.message,
        severity: 'error' as const,
      })),
    };
  }
  const registryIssues = [
    ...validateCompositionRegistry(parsed.data.pages.home.nodes),
    ...validateResponsivePrimitives(parsed.data.pages.home.nodes),
  ];
  const errors = registryIssues.filter((i) => i.severity === 'error');
  return {
    ok: errors.length === 0,
    document: parsed.data,
    issues: registryIssues,
  };
}

export function inferPresentationFromArchetype(archetype: string): 'luxury' | 'street' | 'tech' | 'editorial' {
  const a = archetype.toLowerCase();
  if (/street|urban|bold|youth/.test(a)) return 'street';
  if (/tech|audio|electronic|precision|product/.test(a)) return 'tech';
  if (/luxury|quiet|atelier|handbag|leather/.test(a)) return 'luxury';
  return 'editorial';
}

/** Apply presentation mode to product nodes missing explicit presentation. */
export function enrichProductPresentation(nodes: SiteNode[], presentation: string): SiteNode[] {
  const productTypes = new Set(['productGrid', 'productRail', 'productSpotlight', 'hero']);
  return nodes.map((node) => {
    if (!productTypes.has(node.type)) return node;
    const content = { ...node.content };
    if (!content.presentation && node.variant === 'product_focus') {
      content.presentation = presentation;
    }
    if (!content.presentation && ['productGrid', 'productRail', 'productSpotlight'].includes(node.type)) {
      content.presentation = presentation;
    }
    return { ...node, content };
  });
}
