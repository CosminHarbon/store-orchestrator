import { z } from 'zod';

export const STOREFRONT_SPEC_VERSION = 1 as const;
export const AI_TEMPLATE_ID = 'ai' as const;
export const MAX_HOME_SECTIONS = 16;

export const LAYOUT_IDS = ['atelier', 'editorial', 'luxeDark', 'minimal', 'warmMarket'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const ALLOWED_FONTS = [
  'Inter',
  'DM Sans',
  'Manrope',
  'Outfit',
  'Nunito Sans',
  'Space Grotesk',
  'Playfair Display',
  'Cormorant Garamond',
  'Libre Baskerville',
  'Lora',
  'Fraunces',
  'Source Serif 4',
] as const;

export const SYSTEM_SECTION_TYPES = [
  'header',
  'hero',
  'collections',
  'products',
  'reviews',
  'footer',
] as const;

export const BLOCK_SECTION_TYPES = [
  'announcement',
  'split-hero',
  'featured-collection',
  'faq',
  'about',
  'features',
  'lookbook',
  'marquee',
  'contact',
  'newsletter',
  'banner',
  'testimonial',
  'text',
  'image',
  'text-image',
  'carousel',
  'video',
  'custom-html',
] as const;

export const ALL_SECTION_TYPES = [...SYSTEM_SECTION_TYPES, ...BLOCK_SECTION_TYPES] as const;

export const HERO_LAYOUTS = ['center', 'left', 'right', 'split', 'fullBleed'] as const;
export const BUTTON_STYLES = ['solid', 'outline', 'pill'] as const;
export const CARD_STYLES = ['minimal', 'bordered', 'shadow', 'overlay'] as const;
export const NAVBAR_STYLES = ['glass', 'solid', 'transparent'] as const;
export const NAV_LAYOUTS = ['logoCenter', 'logoLeft', 'split'] as const;
export const IMAGE_RATIOS = ['4/5', '1/1', '16/10'] as const;
export const HERO_OVERLAYS = ['none', 'soft', 'strong'] as const;
export const DENSITY_OPTIONS = ['cozy', 'airy', 'compact'] as const;
export const CATALOG_LAYOUTS = ['grid', 'list'] as const;
export const GALLERY_LAYOUTS = ['stack', 'carousel'] as const;

export type AllowedFont = (typeof ALLOWED_FONTS)[number];
export type SystemSectionType = (typeof SYSTEM_SECTION_TYPES)[number];
export type BlockSectionType = (typeof BLOCK_SECTION_TYPES)[number];
export type SectionType = (typeof ALL_SECTION_TYPES)[number];

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{6})$/, 'Must be a 6-digit hex color')
  .transform((v) => v.toUpperCase());

const fontSchema = z.enum(ALLOWED_FONTS);

export const faqItemSchema = z.object({
  q: z.string().min(1).max(160),
  a: z.string().min(1).max(600),
});

export const featureItemSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(240),
  icon: z.string().max(40).optional(),
});

export const lookbookItemSchema = z.object({
  imageUrl: z.string().url().or(z.literal('')),
  alt: z.string().max(120).optional(),
  caption: z.string().max(160).optional(),
});

export const sectionPropsSchema = z.object({
  title: z.string().max(120).optional(),
  subtitle: z.string().max(400).optional(),
  text: z.string().max(2000).optional(),
  buttonText: z.string().max(60).optional(),
  buttonUrl: z.string().max(300).optional(),
  imageUrl: z.string().max(800).optional(),
  imageAlt: z.string().max(160).optional(),
  layout: z.enum(['image-left', 'image-right', ...HERO_LAYOUTS]).optional(),
  backgroundColor: z.string().max(20).optional(),
  textColor: z.string().max(20).optional(),
  quote: z.string().max(400).optional(),
  author: z.string().max(80).optional(),
  authorTitle: z.string().max(80).optional(),
  videoUrl: z.string().max(400).optional(),
  marqueeText: z.string().max(240).optional(),
  html: z.string().max(8000).optional(),
  css: z.string().max(4000).optional(),
  faqItems: z.array(faqItemSchema).max(8).optional(),
  features: z.array(featureItemSchema).max(6).optional(),
  images: z.array(lookbookItemSchema).max(8).optional(),
});

export const homeSectionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(ALL_SECTION_TYPES),
  visible: z.boolean().default(true),
  props: sectionPropsSchema.default({}),
});

export const tokensSchema = z.object({
  primary: hexColor,
  background: hexColor,
  text: hexColor,
  accent: hexColor,
  secondary: hexColor,
  headingFont: fontSchema,
  bodyFont: fontSchema,
  radius: z.enum(['rounded-none', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-full']).default('rounded-lg'),
  buttonStyle: z.enum(BUTTON_STYLES).default('solid'),
  shadow: z.enum(['none', 'soft', 'lift']).default('soft'),
  navbarStyle: z.enum(NAVBAR_STYLES).default('glass'),
  heroLayout: z.enum(HERO_LAYOUTS).default('center'),
  productCardStyle: z.enum(CARD_STYLES).default('minimal'),
});

export const navSchema = z.object({
  style: z.enum(NAVBAR_STYLES).default('glass'),
  layout: z.enum(NAV_LAYOUTS).default('logoCenter'),
  showCollections: z.boolean().default(true),
  sticky: z.boolean().default(true),
});

export const productCardSchema = z.object({
  style: z.enum(CARD_STYLES).default('minimal'),
  imageRatio: z.enum(IMAGE_RATIOS).default('4/5'),
  showQuickAdd: z.boolean().default(true),
  showRating: z.boolean().default(true),
});

export const heroVariantSchema = z.object({
  layout: z.enum(HERO_LAYOUTS).default('split'),
  overlay: z.enum(HERO_OVERLAYS).default('soft'),
  ctaStyle: z.enum(BUTTON_STYLES).default('solid'),
});

export const copySchema = z.object({
  storeName: z.string().min(1).max(80),
  heroTitle: z.string().min(1).max(120),
  heroSubtitle: z.string().min(1).max(280),
  heroButtonText: z.string().min(1).max(40),
  heroImageUrl: z.string().max(800).optional().nullable(),
  logoUrl: z.string().max(800).optional().nullable(),
  footer: z.string().min(1).max(200),
  about: z.string().max(1200).optional(),
  announcement: z.string().max(160).optional(),
  faq: z.array(faqItemSchema).max(8).optional(),
});

export const catalogPageSchema = z.object({
  layout: z.enum(CATALOG_LAYOUTS).default('grid'),
  filters: z.boolean().default(true),
  cardStyle: z.enum(CARD_STYLES).default('minimal'),
});

export const productPageSchema = z.object({
  gallery: z.enum(GALLERY_LAYOUTS).default('stack'),
  tabs: z.boolean().default(true),
  related: z.boolean().default(true),
});

export const storefrontSpecSchema = z
  .object({
    version: z.literal(STOREFRONT_SPEC_VERSION),
    layoutId: z.enum(LAYOUT_IDS).default('atelier'),
    density: z.enum(DENSITY_OPTIONS).default('airy'),
    nav: navSchema.default({ style: 'glass', layout: 'logoCenter', showCollections: true, sticky: true }),
    productCard: productCardSchema.default({
      style: 'minimal',
      imageRatio: '4/5',
      showQuickAdd: true,
      showRating: true,
    }),
    hero: heroVariantSchema.default({ layout: 'split', overlay: 'soft', ctaStyle: 'solid' }),
    niche: z.string().min(1).max(60),
    mood: z.string().min(1).max(80),
    language: z.enum(['ro', 'en']),
    tokens: tokensSchema,
    copy: copySchema,
    pages: z.object({
      home: z.object({
        sections: z.array(homeSectionSchema).min(4).max(MAX_HOME_SECTIONS),
      }),
      catalog: catalogPageSchema.default({ layout: 'grid', filters: true, cardStyle: 'minimal' }),
      product: productPageSchema.default({ gallery: 'stack', tabs: true, related: true }),
    }),
    customCss: z.string().max(4000).default(''),
    /** Freeform home: AI-authored HTML/CSS with data-ai-slot hooks. Checkout stays host-owned. */
    renderMode: z.enum(['sections', 'document']).default('sections'),
    documentHtml: z.string().max(48000).default(''),
    documentCss: z.string().max(24000).default(''),
  })
  .superRefine((spec, ctx) => {
    const types = spec.pages.home.sections.map((s) => s.type);
    for (const required of ['header', 'hero', 'products', 'footer'] as const) {
      if (!types.includes(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Home must include a ${required} section`,
          path: ['pages', 'home', 'sections'],
        });
      }
    }
    const ids = spec.pages.home.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Section ids must be unique',
        path: ['pages', 'home', 'sections'],
      });
    }
  });

export type StorefrontSpec = z.infer<typeof storefrontSpecSchema>;
export type HomeSection = z.infer<typeof homeSectionSchema>;
export type StorefrontTokens = z.infer<typeof tokensSchema>;
export type StorefrontCopy = z.infer<typeof copySchema>;
export type SectionProps = z.infer<typeof sectionPropsSchema>;
export type NavVariant = z.infer<typeof navSchema>;
export type ProductCardVariant = z.infer<typeof productCardSchema>;
export type HeroVariant = z.infer<typeof heroVariantSchema>;
export type DensityOption = (typeof DENSITY_OPTIONS)[number];

export const storeBriefSchema = z.object({
  layoutId: z.enum(LAYOUT_IDS).optional(),
  density: z.enum(DENSITY_OPTIONS).optional(),
  nav: navSchema.partial().optional(),
  productCard: productCardSchema.partial().optional(),
  hero: heroVariantSchema.partial().optional(),
  sectionOrder: z.array(z.enum(ALL_SECTION_TYPES)).max(MAX_HOME_SECTIONS).optional(),
  niche: z.string().min(1).max(60),
  mood: z.string().min(1).max(80),
  language: z.enum(['ro', 'en']),
  storeName: z.string().min(1).max(80).optional(),
  colors: z
    .object({
      primary: hexColor.optional(),
      background: hexColor.optional(),
      text: hexColor.optional(),
    })
    .optional(),
  mustHaveSections: z.array(z.enum(ALL_SECTION_TYPES)).max(12).optional(),
  notes: z.string().max(400).optional(),
  friendReply: z.string().min(1).max(280),
});

export type StoreBrief = z.infer<typeof storeBriefSchema>;

export type StudioQuality = 'fast' | 'studio';

export type GenerateStatusStep = 'understanding' | 'designing' | 'verifying' | 'building' | 'ready' | 'error';

export function isBlockSectionType(type: string): type is BlockSectionType {
  return (BLOCK_SECTION_TYPES as readonly string[]).includes(type);
}

export function isSystemSectionType(type: string): type is SystemSectionType {
  return (SYSTEM_SECTION_TYPES as readonly string[]).includes(type);
}

export function parseStorefrontSpec(input: unknown): { spec: StorefrontSpec; warnings: string[] } {
  const warnings: string[] = [];
  const result = storefrontSpecSchema.safeParse(stripUnknown(input));
  if (result.success) return { spec: result.data, warnings };

  const recovered = recoverSpec(input, warnings);
  const second = storefrontSpecSchema.safeParse(recovered);
  if (second.success) {
    warnings.push('Spec was repaired to satisfy the schema');
    return { spec: second.data, warnings };
  }

  throw new SpecValidationError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
}

export class SpecValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'SpecValidationError';
    this.issues = issues;
  }
}

function stripUnknown(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  return input;
}

function recoverSpec(input: unknown, warnings: string[]): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Record<string, unknown>;
  const pages = (raw.pages && typeof raw.pages === 'object' ? raw.pages : {}) as Record<string, unknown>;
  const home = (pages.home && typeof pages.home === 'object' ? pages.home : {}) as Record<string, unknown>;
  let sections = Array.isArray(home.sections) ? [...home.sections] : [];

  const ensure = (type: SystemSectionType) => {
    if (!sections.some((s) => s && typeof s === 'object' && (s as { type?: string }).type === type)) {
      warnings.push(`Inserted missing ${type} section`);
      sections.push({ id: type, type, visible: true, props: {} });
    }
  };
  ensure('header');
  ensure('hero');
  ensure('products');
  ensure('footer');

  if (sections.length > MAX_HOME_SECTIONS) {
    warnings.push(`Trimmed sections from ${sections.length} to ${MAX_HOME_SECTIONS}`);
    const keep = new Set(['header', 'hero', 'products', 'footer']);
    const required = sections.filter((s) => s && typeof s === 'object' && keep.has((s as { type?: string }).type || ''));
    const rest = sections.filter((s) => !required.includes(s));
    sections = [...required, ...rest].slice(0, MAX_HOME_SECTIONS);
  }

  const seen = new Set<string>();
  sections = sections.map((s, i) => {
    if (!s || typeof s !== 'object') return { id: `section-${i}`, type: 'text', visible: true, props: {} };
    const rec = s as Record<string, unknown>;
    let id = typeof rec.id === 'string' && rec.id ? rec.id : `section-${i}`;
    if (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const type = (ALL_SECTION_TYPES as readonly string[]).includes(String(rec.type))
      ? rec.type
      : 'text';
    return { ...rec, id, type, visible: rec.visible !== false, props: rec.props && typeof rec.props === 'object' ? rec.props : {} };
  });

  const layoutId = (LAYOUT_IDS as readonly string[]).includes(String(raw.layoutId)) ? raw.layoutId : 'atelier';

  return {
    ...raw,
    version: STOREFRONT_SPEC_VERSION,
    layoutId,
    pages: {
      ...pages,
      home: { ...home, sections },
    },
  };
}

export function fontHref(heading: string, body: string): string {
  const unique = [...new Set([heading, body])];
  const query = unique
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}
