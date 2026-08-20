import type { TemplateBlock, BlockContent } from '@/components/templates/BlockEditor';
import type { BuilderConfig, BuilderSection, WebsiteCustomization } from '@/components/website-builder/types';
import { AI_TEMPLATE_ID, isBlockSectionType, type HomeSection, type StorefrontSpec } from './spec';
import { heroImageFor } from './stockImages';

export interface BuilderPayload {
  customization: Omit<WebsiteCustomization, 'id'>;
  blocks: Array<Omit<TemplateBlock, 'created_at' | 'updated_at' | 'id'> & { clientId: string }>;
  builderConfig: BuilderConfig;
}

export function specToBuilderPayload(spec: StorefrontSpec, userId: string): BuilderPayload {
  const { tokens, copy } = spec;
  const sections = spec.pages.home.sections;

  const blocks: BuilderPayload['blocks'] = [];
  const builderSections: BuilderSection[] = [];

  for (const section of sections) {
    if (!isBlockSectionType(section.type)) {
      builderSections.push({
        id: section.id,
        type: section.type,
        visible: section.visible !== false,
      });
      continue;
    }

    const clientId = section.id.startsWith('block-') ? section.id.slice(6) : section.id;
    blocks.push({
      clientId,
      user_id: userId,
      template_id: AI_TEMPLATE_ID,
      block_type: section.type,
      block_order: blocks.length,
      title: section.props.title || section.type,
      content: sectionToBlockContent(section),
      is_visible: section.visible !== false,
    });
    builderSections.push({
      id: `block-${clientId}`,
      type: 'block',
      visible: section.visible !== false,
      blockId: clientId,
      blockType: section.type,
    });
  }

  const customization: Omit<WebsiteCustomization, 'id'> = {
    user_id: userId,
    template_id: AI_TEMPLATE_ID,
    primary_color: tokens.primary,
    background_color: tokens.background,
    text_color: tokens.text,
    accent_color: tokens.accent,
    secondary_color: tokens.secondary,
    hero_image_url: copy.heroImageUrl || heroImageFor(spec.niche),
    logo_url: copy.logoUrl || null,
    hero_title: copy.heroTitle,
    hero_subtitle: copy.heroSubtitle,
    hero_button_text: copy.heroButtonText,
    store_name: copy.storeName,
    font_family: tokens.bodyFont,
    heading_font: tokens.headingFont,
    border_radius: tokens.radius,
    button_style: tokens.buttonStyle,
    hero_layout: tokens.heroLayout,
    product_card_style: tokens.productCardStyle,
    show_collection_images: sections.find((s) => s.type === 'collections')?.visible !== false,
    show_hero_section: sections.find((s) => s.type === 'hero')?.visible !== false,
    show_reviews: sections.find((s) => s.type === 'reviews')?.visible !== false,
    navbar_style: tokens.navbarStyle,
    footer_text: copy.footer,
    gradient_enabled: true,
    animation_style: 'smooth',
    builder_config: { version: 1, sections: builderSections },
  };

  return {
    customization,
    blocks,
    builderConfig: { version: 1, sections: builderSections },
  };
}

export function sectionToBlockContent(section: HomeSection): BlockContent {
  const p = section.props || {};
  const content: BlockContent = {};

  if (p.text) content.text = p.text;
  if (p.title && !content.text) content.text = p.title;
  if (p.subtitle && content.text) content.text = `${p.title || ''}\n${p.subtitle}`.trim();
  if (p.imageUrl) content.imageUrl = p.imageUrl;
  if (p.imageAlt) content.imageAlt = p.imageAlt;
  if (p.buttonText) content.buttonText = p.buttonText;
  if (p.buttonUrl) content.buttonUrl = p.buttonUrl;
  if (p.backgroundColor) content.backgroundColor = p.backgroundColor;
  if (p.textColor) content.textColor = p.textColor;
  if (p.quote) content.quote = p.quote;
  if (p.author) content.author = p.author;
  if (p.authorTitle) content.authorTitle = p.authorTitle;
  if (p.videoUrl) content.videoUrl = p.videoUrl;
  if (p.html) content.html = p.html;
  if (p.css) content.css = p.css;
  if (p.marqueeText) content.marqueeText = p.marqueeText;
  if (p.faqItems) content.faqItems = p.faqItems.map((i) => ({ q: i.q || '', a: i.a || '' })).filter((i) => i.q);
  if (p.features) content.features = p.features.map((f) => ({ title: f.title || '', body: f.body || '', icon: f.icon })).filter((f) => f.title);
  if (p.images) content.images = p.images.map((img) => ({ url: img.imageUrl, alt: img.alt, caption: img.caption }));
  if (p.layout === 'image-left' || p.layout === 'image-right') content.layout = p.layout;

  if (section.type === 'announcement' && !content.text) content.text = p.title || p.subtitle;
  if (section.type === 'about' && p.subtitle && !content.text) content.text = p.subtitle;
  if (section.type === 'newsletter' && !content.text) {
    content.text = p.subtitle || p.title || 'Join our newsletter';
    content.buttonText = p.buttonText || 'Subscribe';
  }

  return content;
}

export function specCssVariables(spec: StorefrontSpec): Record<string, string> {
  const t = spec.tokens;
  const density = spec.density || 'airy';
  const pad = density === 'compact' ? '3rem' : density === 'cozy' ? '4rem' : '4.5rem';
  const ratio = spec.productCard?.imageRatio || '4/5';
  return {
    '--ai-primary': t.primary,
    '--ai-bg': t.background,
    '--ai-text': t.text,
    '--ai-accent': t.accent,
    '--ai-secondary': t.secondary,
    '--ai-heading': t.headingFont,
    '--ai-body': t.bodyFont,
    '--ai-section-pad': pad,
    '--ai-card-ratio': ratio,
    '--prem-bg': t.background,
    '--prem-surface': t.secondary,
    '--prem-ink': t.text,
    '--prem-muted': t.accent,
    '--prem-line': `${t.text}14`,
    '--prem-accent': t.primary,
    '--prem-accent-soft': t.secondary,
    '--prem-font-display': `'${t.headingFont}', serif`,
    '--prem-font-body': `'${t.bodyFont}', system-ui, sans-serif`,
    '--prem-radius': t.radius === 'rounded-full' ? '999px' : t.radius === 'rounded-none' ? '0px' : '1rem',
  };
}
