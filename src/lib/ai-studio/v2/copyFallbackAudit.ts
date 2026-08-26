/**
 * DEV diagnostic: which visible copy fields did the generator leave empty?
 *
 * The renderer used to paper over missing copy with brand-flavoured defaults
 * ("Quiet luxury", "Our story", "Made with restraint."), which made unrelated
 * generations read alike even when the model wrote none of it. Those stylistic
 * defaults are gone; this audit makes the remaining gaps visible instead.
 *
 * `omitted`   — nothing renders for that field.
 * `functional` — the renderer supplies neutral UI text (a CTA label, a store name,
 *                a section label) or derives the value from real product data.
 */
import type { SiteDocument, SiteNode } from '@/lib/ai-studio/v2/siteTree';

export type CopyFallbackKind = 'omitted' | 'functional';

export type CopyFallbackFinding = {
  nodeId: string;
  type: string;
  variant: string;
  field: string;
  kind: CopyFallbackKind;
};

export type CopyFallbackAudit = {
  /** Total expected copy fields the generator did not supply. */
  count: number;
  omittedCount: number;
  functionalCount: number;
  findings: CopyFallbackFinding[];
};

type Expectation = { field: string; kind: CopyFallbackKind };

const EXPECTED: Record<string, Expectation[]> = {
  'nav:minimal': [{ field: 'storeName', kind: 'functional' }],
  'nav:transparent': [{ field: 'storeName', kind: 'functional' }],
  'announcement:slim': [{ field: 'text', kind: 'omitted' }],
  'hero:editorial_split': [
    { field: 'title', kind: 'omitted' },
    { field: 'kicker', kind: 'omitted' },
    { field: 'cta', kind: 'functional' },
  ],
  'hero:luxury_minimal': [
    { field: 'title', kind: 'omitted' },
    { field: 'cta', kind: 'functional' },
  ],
  'hero:product_focus': [
    { field: 'title', kind: 'functional' },
    { field: 'kicker', kind: 'omitted' },
    { field: 'cta', kind: 'functional' },
  ],
  'productGrid:editorial': [{ field: 'title', kind: 'omitted' }],
  'productRail:horizontal': [{ field: 'title', kind: 'omitted' }],
  'productSpotlight:feature': [
    { field: 'title', kind: 'functional' },
    { field: 'kicker', kind: 'omitted' },
    { field: 'body', kind: 'omitted' },
  ],
  'editorialSplit:image_text': [
    { field: 'title', kind: 'omitted' },
    { field: 'body', kind: 'omitted' },
  ],
  'brandStatement:large_type': [{ field: 'statement', kind: 'omitted' }],
  'editorialMosaic:asymmetric': [{ field: 'title', kind: 'omitted' }],
  'testimonials:editorial': [{ field: 'items', kind: 'omitted' }],
  'reviews:wall': [{ field: 'title', kind: 'functional' }],
  'newsletter:quiet': [
    { field: 'title', kind: 'functional' },
    { field: 'text', kind: 'omitted' },
  ],
  'collections:tiles': [{ field: 'title', kind: 'functional' }],
  'footer:minimal_commerce': [
    { field: 'storeName', kind: 'functional' },
    { field: 'text', kind: 'omitted' },
  ],
  'footer:editorial_luxury': [
    { field: 'storeName', kind: 'functional' },
    { field: 'blurb', kind: 'omitted' },
  ],
};

function isPresent(node: SiteNode, field: string): boolean {
  const value = (node.content as Record<string, unknown> | undefined)?.[field];
  if (Array.isArray(value)) return value.length > 0;
  if (field === 'statement') {
    const title = (node.content as Record<string, unknown> | undefined)?.title;
    if (typeof title === 'string' && title.trim()) return true;
  }
  return typeof value === 'string' && value.trim().length > 0;
}

export function auditCopyFallbacks(document: SiteDocument): CopyFallbackAudit {
  const findings: CopyFallbackFinding[] = [];

  for (const node of document.pages.home.nodes) {
    if (node.visible === false) continue;
    const expectations = EXPECTED[`${node.type}:${node.variant}`];
    if (!expectations) continue;
    for (const expectation of expectations) {
      if (isPresent(node, expectation.field)) continue;
      findings.push({
        nodeId: node.id,
        type: node.type,
        variant: node.variant,
        field: expectation.field,
        kind: expectation.kind,
      });
    }
  }

  return {
    count: findings.length,
    omittedCount: findings.filter((f) => f.kind === 'omitted').length,
    functionalCount: findings.filter((f) => f.kind === 'functional').length,
    findings,
  };
}
