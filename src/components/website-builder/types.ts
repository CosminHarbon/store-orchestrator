import type { BlockContent, TemplateBlock } from '@/components/templates/BlockEditor';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';
export type BuilderPanel = 'sections' | 'theme' | 'pages' | null;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type SystemSectionType =
  | 'header'
  | 'hero'
  | 'collections'
  | 'products'
  | 'reviews'
  | 'footer';

export type AddableSectionType =
  | 'text'
  | 'image'
  | 'text-image'
  | 'carousel'
  | 'banner'
  | 'testimonial'
  | 'video'
  | 'newsletter';

export type BuilderSectionType = SystemSectionType | 'block';

export interface BuilderSection {
  id: string;
  type: BuilderSectionType;
  visible: boolean;
  /** Present when type === 'block' */
  blockId?: string;
  /** Present for newsletter mapped as block_type banner with flag */
  blockType?: string;
}

export interface BuilderConfig {
  version: 1;
  sections: BuilderSection[];
}

export interface WebsiteCustomization {
  id?: string;
  user_id: string;
  template_id: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  secondary_color: string;
  hero_image_url: string | null;
  logo_url: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_button_text: string;
  store_name: string;
  font_family: string;
  heading_font: string;
  border_radius: string;
  button_style: string;
  hero_layout: string;
  product_card_style: string;
  show_collection_images: boolean;
  show_hero_section: boolean;
  show_reviews?: boolean;
  navbar_style: string;
  footer_text: string;
  gradient_enabled: boolean;
  animation_style: string;
  builder_config?: BuilderConfig | Record<string, unknown> | null;
}

export interface BuilderSnapshot {
  customization: WebsiteCustomization;
  blocks: TemplateBlock[];
  sections: BuilderSection[];
}

export interface SectionCatalogItem {
  id: AddableSectionType;
  category: 'content' | 'products' | 'marketing' | 'navigation';
  icon: string;
  defaultTitle: string;
  defaultContent: BlockContent;
}

export const SYSTEM_SECTION_ORDER: SystemSectionType[] = [
  'header',
  'hero',
  'collections',
  'products',
  'reviews',
  'footer',
];

export const DEFAULT_CUSTOMIZATION = (userId: string): WebsiteCustomization => ({
  user_id: userId,
  template_id: 'elementar',
  primary_color: '#000000',
  background_color: '#FFFFFF',
  text_color: '#000000',
  accent_color: '#666666',
  secondary_color: '#F5F5F5',
  hero_image_url: null,
  logo_url: null,
  hero_title: 'Welcome to Our Store',
  hero_subtitle: 'Discover products crafted for everyday life',
  hero_button_text: 'Shop Now',
  store_name: 'My Store',
  font_family: 'Inter',
  heading_font: 'Inter',
  border_radius: 'rounded-lg',
  button_style: 'solid',
  hero_layout: 'center',
  product_card_style: 'minimal',
  show_collection_images: true,
  show_hero_section: true,
  show_reviews: true,
  navbar_style: 'glass',
  footer_text: '© Your Store. All rights reserved.',
  gradient_enabled: true,
  animation_style: 'smooth',
  builder_config: null,
});

export function defaultSections(blocks: TemplateBlock[] = []): BuilderSection[] {
  const system: BuilderSection[] = [
    { id: 'header', type: 'header', visible: true },
    { id: 'hero', type: 'hero', visible: true },
    { id: 'collections', type: 'collections', visible: true },
    { id: 'products', type: 'products', visible: true },
    { id: 'reviews', type: 'reviews', visible: true },
  ];

  const blockSections: BuilderSection[] = [...blocks]
    .sort((a, b) => a.block_order - b.block_order)
    .map((block) => ({
      id: `block-${block.id}`,
      type: 'block' as const,
      visible: block.is_visible,
      blockId: block.id,
      blockType: block.block_type,
    }));

  return [
    ...system,
    ...blockSections,
    { id: 'footer', type: 'footer', visible: true },
  ];
}

export function parseBuilderConfig(
  raw: unknown,
  blocks: TemplateBlock[],
  customization: Pick<WebsiteCustomization, 'show_hero_section' | 'show_collection_images' | 'show_reviews'>
): BuilderSection[] {
  const fallback = defaultSections(blocks).map((section) => {
    if (section.type === 'hero') return { ...section, visible: customization.show_hero_section !== false };
    if (section.type === 'collections')
      return { ...section, visible: customization.show_collection_images !== false };
    if (section.type === 'reviews') return { ...section, visible: customization.show_reviews !== false };
    return section;
  });

  if (!raw || typeof raw !== 'object') return fallback;
  const config = raw as BuilderConfig;
  if (!Array.isArray(config.sections) || config.sections.length === 0) return fallback;

  const blockMap = new Map(blocks.map((b) => [b.id, b]));
  const seenBlocks = new Set<string>();

  const parsed: BuilderSection[] = [];
  for (const section of config.sections) {
    if (!section || typeof section !== 'object') continue;
    if (section.type === 'block') {
      const blockId = section.blockId;
      if (!blockId || !blockMap.has(blockId)) continue;
      seenBlocks.add(blockId);
      parsed.push({
        id: section.id || `block-${blockId}`,
        type: 'block',
        visible: section.visible !== false && blockMap.get(blockId)!.is_visible,
        blockId,
        blockType: blockMap.get(blockId)!.block_type,
      });
      continue;
    }
    if (SYSTEM_SECTION_ORDER.includes(section.type as SystemSectionType)) {
      parsed.push({
        id: section.id || section.type,
        type: section.type as SystemSectionType,
        visible: section.visible !== false,
      });
    }
  }

  // Ensure required system sections exist
  for (const type of SYSTEM_SECTION_ORDER) {
    if (!parsed.some((s) => s.type === type)) {
      const insertAt = type === 'footer' ? parsed.length : Math.max(0, parsed.length - 1);
      parsed.splice(insertAt, 0, {
        id: type,
        type,
        visible:
          type === 'hero'
            ? customization.show_hero_section !== false
            : type === 'collections'
              ? customization.show_collection_images !== false
              : type === 'reviews'
                ? customization.show_reviews !== false
                : true,
      });
    }
  }

  // Append any new blocks not yet in config (before footer)
  const footerIndex = parsed.findIndex((s) => s.type === 'footer');
  const insertIndex = footerIndex === -1 ? parsed.length : footerIndex;
  for (const block of [...blocks].sort((a, b) => a.block_order - b.block_order)) {
    if (seenBlocks.has(block.id)) continue;
    parsed.splice(insertIndex, 0, {
      id: `block-${block.id}`,
      type: 'block',
      visible: block.is_visible,
      blockId: block.id,
      blockType: block.block_type,
    });
  }

  return parsed;
}

export function toBuilderConfig(sections: BuilderSection[]): BuilderConfig {
  return { version: 1, sections };
}

export function syncCustomizationFlags(
  customization: WebsiteCustomization,
  sections: BuilderSection[]
): WebsiteCustomization {
  return {
    ...customization,
    show_hero_section: sections.find((s) => s.type === 'hero')?.visible !== false,
    show_collection_images: sections.find((s) => s.type === 'collections')?.visible !== false,
    show_reviews: sections.find((s) => s.type === 'reviews')?.visible !== false,
    builder_config: toBuilderConfig(sections),
  };
}

export function getDefaultBlockContent(type: string): BlockContent {
  switch (type) {
    case 'text':
      return { text: 'Tell your story. Share what makes your brand unique.', textAlign: 'center', fontSize: 'lg' };
    case 'image':
      return { imageUrl: '', imageAlt: 'Image', imageFit: 'cover' };
    case 'text-image':
      return {
        text: 'Highlight a product story, campaign, or brand value.',
        imageUrl: '',
        layout: 'image-right',
      };
    case 'carousel':
      return { images: [] };
    case 'banner':
      return {
        text: 'Limited time offer',
        buttonText: 'Shop the collection',
        buttonUrl: '#products-section',
        backgroundColor: '#111111',
        textColor: '#FFFFFF',
      };
    case 'newsletter':
      return {
        text: 'Join our newsletter for new arrivals and exclusive offers.',
        buttonText: 'Subscribe',
        buttonUrl: '#',
        backgroundColor: '#F5F5F5',
        textColor: '#111111',
      };
    case 'testimonial':
      return {
        quote: 'Absolutely love the quality and the shopping experience.',
        author: 'Alex M.',
        authorTitle: 'Verified customer',
      };
    case 'video':
      return { videoUrl: '', videoType: 'youtube' };
    default:
      return { text: '' };
  }
}
