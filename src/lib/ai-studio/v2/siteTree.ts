import { z } from 'zod';
import { designTokensSchema } from './designSpec';

/**
 * Premium composition types for Phase 2 registry.
 * Extensible — AI picks type + variant; renderer owns markup.
 */
export const COMPOSITION_TYPES = [
  'nav',
  'hero',
  'productGrid',
  'productRail',
  'productSpotlight',
  'editorialSplit',
  'brandStatement',
  'editorialMosaic',
  'testimonials',
  'reviews',
  'footer',
  'newsletter',
  'announcement',
  'collections',
] as const;
export type CompositionType = (typeof COMPOSITION_TYPES)[number];

export const COMPOSITION_VARIANTS = {
  nav: ['minimal', 'transparent'],
  hero: ['editorial_split', 'luxury_minimal', 'product_focus'],
  productGrid: ['editorial', 'luxury_image_first'],
  productRail: ['horizontal'],
  productSpotlight: ['feature'],
  editorialSplit: ['image_text'],
  brandStatement: ['large_type'],
  editorialMosaic: ['asymmetric'],
  testimonials: ['editorial'],
  reviews: ['wall'],
  footer: ['minimal_commerce', 'editorial_luxury'],
  newsletter: ['quiet'],
  announcement: ['slim'],
  collections: ['tiles'],
} as const;

export const PRODUCT_BINDINGS = ['featured', 'newest', 'bestsellers', 'collection'] as const;

export const nodeDesignSchema = z.object({
  tokensOverride: designTokensSchema.partial().optional(),
  spacing: z.enum(['compact', 'cozy', 'airy', 'dramatic']).optional(),
  alignment: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  emphasis: z.enum(['primary', 'secondary', 'quiet']).optional(),
  fullBleed: z.boolean().optional(),
  minHeight: z.enum(['auto', '60vh', '80vh', '100vh']).optional(),
  /** Tokenized content measure — express creativeStrategy without arbitrary CSS */
  measure: z.enum(['narrow', 'standard', 'wide', 'bleed']).optional(),
});

export const nodeResponsiveSchema = z.object({
  mobile: z
    .object({
      variant: z.string().max(64).optional(),
      hide: z.boolean().optional(),
      spacing: nodeDesignSchema.shape.spacing,
      minHeight: nodeDesignSchema.shape.minHeight,
    })
    .optional(),
  tablet: z
    .object({
      variant: z.string().max(64).optional(),
      hide: z.boolean().optional(),
      spacing: nodeDesignSchema.shape.spacing,
    })
    .optional(),
});

export const dataBindingsSchema = z.object({
  products: z.enum(PRODUCT_BINDINGS).optional(),
  collectionId: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(24).optional(),
  showQuickAdd: z.boolean().optional(),
});

export const siteNodeSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/i, 'Stable node id like hero_01'),
  type: z.enum(COMPOSITION_TYPES),
  variant: z.string().min(1).max(64),
  visible: z.boolean().default(true),
  content: z.record(z.unknown()).default({}),
  design: nodeDesignSchema.default({}),
  responsive: nodeResponsiveSchema.default({}),
  animation: z
    .object({
      entrance: z.enum(['none', 'fade', 'rise', 'soft']).default('fade'),
      intensity: z.enum(['none', 'subtle', 'medium']).default('subtle'),
    })
    .optional(),
  dataBindings: dataBindingsSchema.optional(),
  meta: z
    .object({
      role: z.string().max(80).optional(),
      notes: z.string().max(240).optional(),
    })
    .optional(),
});
export type SiteNode = z.infer<typeof siteNodeSchema>;

export const sitePageSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['home', 'catalog', 'product']),
  nodes: z.array(siteNodeSchema).min(1).max(24),
});
export type SitePage = z.infer<typeof sitePageSchema>;

export const SITE_DOCUMENT_VERSION = 2 as const;

export const siteDocumentSchema = z
  .object({
    version: z.literal(SITE_DOCUMENT_VERSION),
    siteId: z.string().min(1).max(64),
    designSystemId: z.string().min(1).max(64),
    pages: z.object({
      home: sitePageSchema,
    }),
    meta: z.object({
      language: z.enum(['ro', 'en']),
      niche: z.string().max(80).optional(),
      updatedAt: z.string().min(1),
      /** Legacy layout id if migrated from V1 — never drives V2 creativity. */
      legacyLayoutId: z.string().max(40).optional(),
    }),
  })
  .superRefine((doc, ctx) => {
    const ids = doc.pages.home.nodes.map((n) => n.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Node ids must be unique', path: ['pages', 'home', 'nodes'] });
    }
    const types = doc.pages.home.nodes.filter((n) => n.visible !== false).map((n) => n.type);
    if (!types.includes('nav')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Home must include a nav node', path: ['pages', 'home', 'nodes'] });
    }
    if (!types.includes('hero')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Home must include a hero node', path: ['pages', 'home', 'nodes'] });
    }
    if (!types.some((t) => t === 'productGrid' || t === 'productRail' || t === 'productSpotlight')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Home must include at least one product presentation node',
        path: ['pages', 'home', 'nodes'],
      });
    }
    if (!types.includes('footer')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Home must include a footer node', path: ['pages', 'home', 'nodes'] });
    }
  });
export type SiteDocument = z.infer<typeof siteDocumentSchema>;

/**
 * A `responsive.mobile.variant` swap only makes sense within the same composition type -
 * validate against the registered variant list instead of trusting the stored value, so a
 * malformed/legacy document (or a cross-type value, e.g. a hero variant on a productGrid)
 * can't silently "succeed" by resolving through the registry's own type-only fallback
 * (see registry.ts resolveComposition). Invalid or unset -> keep the desktop variant; it's
 * the only variant already known to be valid for this node's type.
 *
 * Pure/CSS-free on purpose (no React import) so it's usable from both the renderer and
 * plain unit tests.
 */
export function resolveResponsiveVariant(
  type: string,
  desktopVariant: string,
  requested: string | undefined
): string {
  if (!requested) return desktopVariant;
  const allowed = COMPOSITION_VARIANTS[type as keyof typeof COMPOSITION_VARIANTS] as
    | readonly string[]
    | undefined;
  return allowed && allowed.includes(requested) ? requested : desktopVariant;
}

export function parseSiteDocument(raw: unknown): { document: SiteDocument; warnings: string[] } {
  const parsed = siteDocumentSchema.safeParse(raw);
  if (parsed.success) return { document: parsed.data, warnings: [] };
  return {
    document: siteDocumentSchema.parse({
      version: 2,
      siteId: 'fallback',
      designSystemId: 'fallback',
      pages: {
        home: {
          id: 'home',
          type: 'home',
          nodes: [
            { id: 'nav_01', type: 'nav', variant: 'minimal', content: {}, design: {}, responsive: {} },
            {
              id: 'hero_01',
              type: 'hero',
              variant: 'luxury_minimal',
              content: { title: 'Store', subtitle: '', cta: 'Shop' },
              design: { minHeight: '80vh' },
              responsive: {},
            },
            {
              id: 'products_01',
              type: 'productGrid',
              variant: 'editorial',
              content: { title: 'Featured' },
              design: {},
              responsive: {},
              dataBindings: { products: 'featured', limit: 8 },
            },
            { id: 'footer_01', type: 'footer', variant: 'minimal_commerce', content: {}, design: {}, responsive: {} },
          ],
        },
      },
      meta: { language: 'en', updatedAt: new Date().toISOString() },
    }),
    warnings: parsed.error.issues.map((i) => i.message),
  };
}
