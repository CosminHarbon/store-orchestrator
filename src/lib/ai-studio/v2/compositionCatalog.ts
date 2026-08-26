import { COMPOSITION_TYPES, COMPOSITION_VARIANTS } from './siteTree';

export type CompositionCatalogEntry = {
  type: string;
  variant: string;
  label: string;
  whenToUse: string;
  contentFields: string[];
  optionalFields?: string[];
};

/** Registry vocabulary for AI prompts and validation — not a page template. */
export const COMPOSITION_CATALOG: CompositionCatalogEntry[] = [
  {
    type: 'nav',
    variant: 'minimal',
    label: 'Minimal navigation',
    whenToUse: 'Compact solid navigation chrome when immersion is not required.',
    contentFields: ['storeName'],
    optionalFields: ['tone: dark|light'],
  },
  {
    type: 'nav',
    variant: 'transparent',
    label: 'Transparent / immersive navigation',
    whenToUse: 'Transparent overlay navigation when the opening section should feel immersive.',
    contentFields: ['storeName'],
    optionalFields: ['tone: dark|light'],
  },
  {
    type: 'hero',
    variant: 'luxury_minimal',
    label: 'Luxury / minimal hero',
    whenToUse: 'Full-bleed atmospheric hero — image-led opening with restrained type.',
    contentFields: ['title', 'subtitle', 'cta'],
    optionalFields: ['imageUrl'],
  },
  {
    type: 'hero',
    variant: 'editorial_split',
    label: 'Editorial split hero',
    whenToUse: 'Measured split hero — copy and media share the first viewport.',
    contentFields: ['title', 'subtitle', 'cta'],
    optionalFields: ['imageUrl', 'align: left|right'],
  },
  {
    type: 'hero',
    variant: 'product_focus',
    label: 'Product-focused hero',
    whenToUse: 'Product-as-artifact hero — object-led opening for flagship merchandise.',
    contentFields: ['title', 'subtitle', 'cta', 'presentation: luxury|street|tech|editorial'],
  },
  {
    type: 'productGrid',
    variant: 'editorial',
    label: 'Editorial product grid',
    whenToUse: 'Primary catalog moment — choose layout and presentation mode deliberately.',
    contentFields: ['title', 'presentation: luxury|street|tech|editorial'],
    optionalFields: ['layout: featureFirst|standardEditorial'],
  },
  {
    type: 'productRail',
    variant: 'horizontal',
    label: 'Horizontal product rail',
    whenToUse: 'Secondary discovery, scrollable collection after story or spotlight.',
    contentFields: ['title', 'presentation: luxury|street|tech|editorial'],
  },
  {
    type: 'productSpotlight',
    variant: 'feature',
    label: 'Product spotlight',
    whenToUse: 'Single hero product — luxury pieces, flagship SKU, launch item.',
    contentFields: ['title', 'body', 'cta', 'presentation: luxury|street|tech|editorial'],
  },
  {
    type: 'editorialSplit',
    variant: 'image_text',
    label: 'Editorial image/text',
    whenToUse: 'Craft story, provenance, science, brand narrative between commerce beats.',
    contentFields: ['title', 'body'],
    optionalFields: ['imageUrl', 'imagePosition: left|right'],
  },
  {
    type: 'brandStatement',
    variant: 'large_type',
    label: 'Large brand statement',
    whenToUse: 'Manifesto beat — luxury positioning, bold streetwear voice, editorial pause.',
    contentFields: ['statement'],
    optionalFields: ['subtext'],
  },
  {
    type: 'editorialMosaic',
    variant: 'asymmetric',
    label: 'Editorial mosaic',
    whenToUse: 'Visual storytelling grid — food, fashion lookbook, multi-image narrative.',
    contentFields: [],
    optionalFields: ['title', 'layout: magazine|immersive'],
  },
  {
    type: 'testimonials',
    variant: 'editorial',
    label: 'Editorial testimonials',
    whenToUse: 'Social proof only when the creativeStrategy calls for trust; omit otherwise.',
    contentFields: [],
    optionalFields: ['title', 'layout: quote|imageQuote'],
  },
  {
    type: 'reviews',
    variant: 'wall',
    label: 'Review presentation',
    whenToUse: 'Aggregate ratings wall when trust/index presentation fits the strategy.',
    contentFields: [],
    optionalFields: ['title'],
  },
  {
    type: 'collections',
    variant: 'tiles',
    label: 'Collection tiles',
    whenToUse: 'Multi-collection discovery — fashion, food ranges, electronics families.',
    contentFields: [],
    optionalFields: ['title'],
  },
  {
    type: 'newsletter',
    variant: 'quiet',
    label: 'Quiet newsletter',
    whenToUse: 'Only when list-building suits the brand — omit if it breaks luxury/editorial tone.',
    contentFields: ['title'],
    optionalFields: ['subtitle', 'cta'],
  },
  {
    type: 'announcement',
    variant: 'slim',
    label: 'Slim announcement',
    whenToUse: 'Shipping note, launch window, subtle promo — use sparingly.',
    contentFields: ['text'],
  },
  {
    type: 'footer',
    variant: 'minimal_commerce',
    label: 'Minimal commerce footer',
    whenToUse: 'Compact commerce footer.',
    contentFields: ['storeName'],
    optionalFields: ['text'],
  },
  {
    type: 'footer',
    variant: 'editorial_luxury',
    label: 'Editorial / luxury footer',
    whenToUse: 'Editorial closing note with quieter commerce chrome.',
    contentFields: ['storeName'],
    optionalFields: ['blurb', 'text'],
  },
];

export function catalogPromptBlock(): string {
  return COMPOSITION_CATALOG.map(
    (c) =>
      `- ${c.type}/${c.variant}: ${c.label}. Use when: ${c.whenToUse}. Content: { ${[
        ...c.contentFields,
        ...(c.optionalFields || []),
      ].join(', ')} }`
  ).join('\n');
}

export function isValidComposition(type: string, variant: string): boolean {
  const allowed = COMPOSITION_VARIANTS[type as keyof typeof COMPOSITION_VARIANTS];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(variant);
}

export function listRegisteredCompositions(): Array<{ type: string; variant: string }> {
  return COMPOSITION_CATALOG.map(({ type, variant }) => ({ type, variant }));
}

export const PRODUCT_PRESENTATION_MODES = ['luxury', 'street', 'tech', 'editorial'] as const;
export type ProductPresentationMode = (typeof PRODUCT_PRESENTATION_MODES)[number];

export function compositionTypes(): readonly string[] {
  return COMPOSITION_TYPES;
}
