/**
 * Foundation editable-field schema for the generic CuratedThemeForm.
 * Uses only existing field types. Four groups are new and must be added to the
 * `EditorFieldGroup` union: 'Collections' | 'Editorial' | 'Call to action' | 'Product page'.
 */
import type { CuratedThemeEditorSchema, EditorFieldSchema } from './editorSchema';

type FoundationFieldGroup =
  | EditorFieldSchema['group']
  | 'Collections'
  | 'Editorial'
  | 'Call to action'
  | 'Product page';

type FoundationField = Omit<EditorFieldSchema, 'group'> & { group: FoundationFieldGroup };

const fields: FoundationField[] = [
  // Brand
  { key: 'logo', label: 'Logo', group: 'Brand', type: 'image', helpText: 'Square or wide mark shown beside your store name.' },
  { key: 'announcement', label: 'Announcement bar', group: 'Brand', type: 'text', maxLength: 120, placeholder: 'Secure checkout · Delivery to your door or locker' },

  // Sections
  {
    key: 'sections',
    label: 'Marketing sections',
    group: 'Sections',
    type: 'section-controls',
    helpText: 'Show, hide and reorder optional blocks. Hero, shop, cart, checkout and footer cannot be removed.',
    sectionOptions: [
      { id: 'marquee', label: 'Marquee' },
      { id: 'collections', label: 'Collections' },
      { id: 'featured', label: 'Featured' },
      { id: 'editorial', label: 'Editorial' },
      { id: 'why', label: 'Why us' },
      { id: 'ctaBand', label: 'Call to action' },
    ],
  },
  { key: 'marqueeItems', label: 'Scrolling highlights', group: 'Sections', type: 'string-list', maxCount: 24, maxLength: 80, helpText: 'One short phrase per line.' },

  // Hero
  {
    key: 'hero.mediaMode',
    label: 'Hero media',
    group: 'Hero',
    type: 'choice',
    helpText: 'The framed stage on the right. Switch away from “Foundation artwork” to use your own photo or a live product.',
    options: [
      { value: 'template-art', label: 'Keep Foundation artwork' },
      { value: 'image', label: 'Upload / select an image' },
      { value: 'featured-product', label: 'Use a featured product' },
    ],
  },
  { key: 'hero.image', label: 'Hero image', group: 'Hero', type: 'image', helpText: 'Landscape or portrait both work; the focal point stays centred. Broken images fall back to Foundation art.', visibleWhen: { key: 'hero.mediaMode', equals: 'image' } },
  { key: 'hero.featuredProductId', label: 'Featured product', group: 'Hero', type: 'product', helpText: 'Live catalog — title, image and price come from commerce.', visibleWhen: { key: 'hero.mediaMode', equals: 'featured-product' } },
  { key: 'hero.backgroundImage', label: 'Soft background image (optional)', group: 'Hero', type: 'image', helpText: 'Shown faintly behind the hero text. Remove to clear.' },
  { key: 'hero.eyebrow', label: 'Eyebrow', group: 'Hero', type: 'text', maxLength: 80 },
  { key: 'hero.headline', label: 'Headline', group: 'Hero', type: 'text', maxLength: 120 },
  { key: 'hero.headlineAccent', label: 'Headline accent', group: 'Hero', type: 'text', maxLength: 80, helpText: 'Second line, set in italic plum.' },
  { key: 'hero.supportingCopy', label: 'Supporting description', group: 'Hero', type: 'textarea', maxLength: 400, helpText: 'Leave empty to use your store name + tagline.' },
  { key: 'merchantTaglineFallback', label: 'Fallback tagline', group: 'Hero', type: 'textarea', maxLength: 400, helpText: 'Used when supporting copy is empty and your store has no tagline.' },
  { key: 'hero.primaryCtaLabel', label: 'Primary button', group: 'Hero', type: 'text', maxLength: 60 },
  { key: 'hero.secondaryCtaLabel', label: 'Secondary button', group: 'Hero', type: 'text', maxLength: 60 },
  { key: 'heroStats', label: 'Hero highlights', group: 'Hero', type: 'hero-stats', maxCount: 4, helpText: 'Up to 4 short highlights under the buttons (3 recommended).' },

  // Collections
  {
    key: 'collectionsLiveNote',
    label: 'Collection tile images',
    group: 'Collections',
    type: 'commerce-note',
    helpText:
      'Collection photos come from your live catalogue — they are not theme marketing slots.',
    manageHref: '/?tab=products',
    manageLabel: 'Managed in Collections / Products',
  },
  { key: 'collectionsEyebrow', label: 'Collections eyebrow', group: 'Collections', type: 'text', maxLength: 80 },
  { key: 'collectionsTitle', label: 'Collections title', group: 'Collections', type: 'text', maxLength: 120, helpText: 'Collection tiles use your live categories.' },

  // Featured
  {
    key: 'featuredLiveNote',
    label: 'Featured product images',
    group: 'Featured',
    type: 'commerce-note',
    helpText: 'Featured cards always use live product imagery and prices from commerce.',
    manageHref: '/?tab=products',
    manageLabel: 'Managed in Products',
  },
  { key: 'featuredEyebrow', label: 'Featured eyebrow', group: 'Featured', type: 'text', maxLength: 80 },
  { key: 'featuredFallbackTitle', label: 'Featured fallback title', group: 'Featured', type: 'text', maxLength: 120, helpText: 'Used when the featured product has no title.' },
  { key: 'featuredFallbackBody', label: 'Featured fallback body', group: 'Featured', type: 'textarea', maxLength: 400, helpText: 'Used when the featured product has no description.' },

  // Shop
  {
    key: 'shopLiveNote',
    label: 'Shop / product grid images',
    group: 'Shop',
    type: 'commerce-note',
    helpText: 'Product cards and galleries always use your live product media.',
    manageHref: '/?tab=products',
    manageLabel: 'Managed in Products',
  },
  { key: 'shopEyebrow', label: 'Shop eyebrow', group: 'Shop', type: 'text', maxLength: 80 },
  { key: 'shopTitle', label: 'Shop title', group: 'Shop', type: 'text', maxLength: 80 },

  // Editorial
  { key: 'editorialEyebrow', label: 'Editorial eyebrow', group: 'Editorial', type: 'text', maxLength: 80 },
  { key: 'editorialTitle', label: 'Editorial title', group: 'Editorial', type: 'text', maxLength: 120 },
  { key: 'editorialBody', label: 'Editorial text', group: 'Editorial', type: 'textarea', maxLength: 400 },
  { key: 'editorialCtaLabel', label: 'Editorial button', group: 'Editorial', type: 'text', maxLength: 60, helpText: 'Always opens the shop.' },
  {
    key: 'editorialMediaMode',
    label: 'Editorial media',
    group: 'Editorial',
    type: 'choice',
    options: [
      { value: 'template-art', label: 'Keep Foundation artwork' },
      { value: 'image', label: 'Upload / select an image' },
      { value: 'hidden', label: 'Hide media (copy only)' },
    ],
  },
  {
    key: 'editorialMedia',
    label: 'Editorial image',
    group: 'Editorial',
    type: 'image',
    helpText: 'Shown when media mode is “Upload / select an image”. Broken images fall back to Foundation art.',
    visibleWhen: { key: 'editorialMediaMode', equals: 'image' },
  },

  // Why
  { key: 'whyEyebrow', label: 'Why eyebrow', group: 'Why us', type: 'text', maxLength: 80 },
  { key: 'whyTitle', label: 'Why title', group: 'Why us', type: 'text', maxLength: 120 },
  { key: 'whyCards', label: 'Why cards', group: 'Why us', type: 'why-cards', maxCount: 4, helpText: '4 cards fill one row on desktop.' },

  // CTA band
  { key: 'ctaEyebrow', label: 'Call-to-action eyebrow', group: 'Call to action', type: 'text', maxLength: 80 },
  { key: 'ctaTitle', label: 'Call-to-action title', group: 'Call to action', type: 'text', maxLength: 120 },
  { key: 'ctaBody', label: 'Call-to-action text', group: 'Call to action', type: 'textarea', maxLength: 280 },
  { key: 'ctaLabel', label: 'Call-to-action button', group: 'Call to action', type: 'text', maxLength: 60, helpText: 'Always opens the shop.' },
  {
    key: 'ctaBackgroundImage',
    label: 'Call-to-action background (optional)',
    group: 'Call to action',
    type: 'image',
    helpText: 'Soft photo behind the plum CTA panel. Remove to use the solid Foundation panel with decorative rings.',
  },

  // Product page
  {
    key: 'pdpLiveNote',
    label: 'Product page gallery',
    group: 'Product page',
    type: 'commerce-note',
    helpText: 'PDP gallery and related products use live commerce imagery.',
    manageHref: '/?tab=products',
    manageLabel: 'Managed in Products',
  },
  { key: 'relatedTitle', label: 'Related products heading', group: 'Product page', type: 'text', maxLength: 80 },

  // Navigation / footer / social
  { key: 'navLabels', label: 'Navigation labels', group: 'Navigation', type: 'nav-labels', maxLength: 40 },
  { key: 'footerTagline', label: 'Footer tagline', group: 'Footer', type: 'textarea', maxLength: 240 },
  { key: 'footerExploreTitle', label: 'Footer explore heading', group: 'Footer', type: 'text', maxLength: 40 },
  { key: 'footerPaymentsTitle', label: 'Footer payments heading', group: 'Footer', type: 'text', maxLength: 40 },
  { key: 'footerPaymentsCopy', label: 'Footer payments copy', group: 'Footer', type: 'textarea', maxLength: 320 },
  { key: 'socialLinks', label: 'Social links', group: 'Social', type: 'social-links', maxCount: 8, helpText: 'http(s) URLs only.' },
];

export const FOUNDATION_EDITOR_SCHEMA = {
  themeId: 'foundation',
  fields,
} as unknown as CuratedThemeEditorSchema;
