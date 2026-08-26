/**
 * Compact expected-render manifest derived from SiteTree.
 * Used by the visual critic for expected-vs-observed verification.
 * Production-safe: no DEV fault metadata.
 */

export type ExpectedRenderNode = {
  nodeId: string;
  type: string;
  variant: string;
  role?: string;
  expectedVisibleText: string[];
  expectedCta?: string;
  expectedImagery: boolean;
  expectedPresentation?: string;
  spacingIntent?: string;
};

export type ExpectedRenderManifest = {
  nodes: ExpectedRenderNode[];
  sectionOrder: string[];
};

type LooseNode = {
  id: string;
  type: string;
  variant?: string;
  visible?: boolean;
  content?: Record<string, unknown>;
  design?: { spacing?: string };
  meta?: { role?: string };
};

type LooseDocument = {
  pages?: { home?: { nodes?: LooseNode[] } };
};

const TEXT_KEYS = [
  'title',
  'subtitle',
  'heading',
  'eyebrow',
  'body',
  'statement',
  'lead',
  'description',
  'label',
] as const;

const CTA_KEYS = ['cta', 'ctaLabel', 'buttonLabel', 'primaryCta'] as const;

const IMAGE_TYPES = new Set([
  'hero',
  'productGrid',
  'productRail',
  'productSpotlight',
  'editorialSplit',
  'editorialMosaic',
  'collections',
  'testimonials',
]);

const IMPORTANT_TYPES = new Set([
  'nav',
  'hero',
  'brandStatement',
  'editorialSplit',
  'productSpotlight',
  'productRail',
  'productGrid',
  'newsletter',
  'footer',
  'collections',
  'announcement',
]);

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length ? t.slice(0, 160) : undefined;
}

function collectVisibleText(content: Record<string, unknown> | undefined): string[] {
  if (!content) return [];
  const out: string[] = [];
  for (const key of TEXT_KEYS) {
    const v = asString(content[key]);
    if (v) out.push(v);
  }
  return out.slice(0, 4);
}

function collectCta(content: Record<string, unknown> | undefined): string | undefined {
  if (!content) return undefined;
  for (const key of CTA_KEYS) {
    const v = asString(content[key]);
    if (v) return v;
  }
  return undefined;
}

function defaultRole(type: string): string | undefined {
  switch (type) {
    case 'nav':
      return 'primary_navigation';
    case 'hero':
      return 'primary_hero';
    case 'brandStatement':
      return 'brand_statement';
    case 'editorialSplit':
      return 'editorial_split';
    case 'productSpotlight':
      return 'product_spotlight';
    case 'productRail':
      return 'product_rail';
    case 'productGrid':
      return 'product_grid';
    case 'newsletter':
      return 'newsletter';
    case 'footer':
      return 'footer';
    default:
      return undefined;
  }
}

/**
 * Build a compact expected-render manifest from a SiteDocument-like tree.
 */
export function buildExpectedRenderManifest(document: LooseDocument): ExpectedRenderManifest {
  const nodes = (document.pages?.home?.nodes || []).filter((n) => n.visible !== false);
  const sectionOrder = nodes.map((n) => n.id);

  const important = nodes.filter((n) => IMPORTANT_TYPES.has(n.type));

  const manifestNodes: ExpectedRenderNode[] = important.map((n) => {
    const content = n.content || {};
    const expectedVisibleText = collectVisibleText(content);
    const expectedCta = collectCta(content);
    const presentation =
      asString(content.presentation) ||
      asString(content.productPresentation) ||
      undefined;

    return {
      nodeId: n.id,
      type: n.type,
      variant: n.variant || 'default',
      role: n.meta?.role || defaultRole(n.type),
      expectedVisibleText,
      ...(expectedCta ? { expectedCta } : {}),
      expectedImagery: IMAGE_TYPES.has(n.type),
      ...(presentation ? { expectedPresentation: presentation } : {}),
      ...(n.design?.spacing ? { spacingIntent: n.design.spacing } : {}),
    };
  });

  return { nodes: manifestNodes, sectionOrder };
}

/**
 * Deterministic hash of render-relevant SiteTree state.
 * Used to detect no-op refinement cycles.
 */
export function hashRenderRelevantSiteTree(document: LooseDocument): string {
  const nodes = (document.pages?.home?.nodes || []).map((n) => ({
    id: n.id,
    type: n.type,
    variant: n.variant,
    visible: n.visible !== false,
    content: n.content || {},
    design: n.design || {},
  }));
  const payload = JSON.stringify(nodes);
  // FNV-1a 32-bit — deterministic, no crypto dependency (works in Deno + browser)
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `st_${(h >>> 0).toString(16).padStart(8, '0')}_${nodes.length}`;
}
