import type { StorefrontSpec } from '../spec';
import {
  brandDesignSystemFromSpec,
  designSpecSchema,
  type BrandDesignSystem,
  type DesignSpec,
} from './designSpec';
import { siteDocumentSchema, type SiteDocument, type SiteNode } from './siteTree';

function nid(prefix: string, n: number) {
  return `${prefix}_${String(n).padStart(2, '0')}`;
}

/**
 * Best-effort V1 StorefrontSpec → V2 SiteDocument.
 * Legacy layoutId is recorded in meta only — it does NOT drive V2 creativity going forward.
 */
export function adaptV1SpecToSiteDocument(spec: StorefrontSpec): {
  document: SiteDocument;
  designSpec: DesignSpec;
  brandSystem: BrandDesignSystem;
} {
  const language = spec.language === 'ro' ? 'ro' : 'en';
  const designSpec = designSpecSchema.parse({
    version: 1,
    creativeMode: 'balanced',
    brand: {
      businessType: spec.niche || 'boutique',
      audience: 'online shoppers',
      positioning: spec.mood || 'premium',
      personality: [spec.mood || 'refined', 'modern'],
      priceLevel: /luxe|dark|luxury/i.test(`${spec.layoutId} ${spec.mood}`) ? 'luxury' : 'premium',
      language,
      storeName: spec.copy.storeName,
    },
    designIntent: {
      coreConcept: `Migrated from V1 layout "${spec.layoutId}" — preserve brand tokens while enabling compositional freedom.`,
      emotionalGoal: spec.mood || 'calm confidence',
      visualHierarchy: 'Hero statement first, then merchandising, then proof and footer.',
      compositionPrinciples: ['Clear hierarchy', 'Restrained chrome', 'Live product binding'],
      photographyDirection: 'Prefer merchant product photography over stock.',
      typographyDirection: `${spec.tokens.headingFont} display with ${spec.tokens.bodyFont} body.`,
      interactionDirection: 'Subtle motion only; commerce actions stay host-owned.',
      premiumCharacteristics: ['Intentional whitespace', 'Strong type', 'Consistent tokens'],
      avoidPatterns: [
        'generic three-column feature cards',
        'random Unsplash hero spam',
        'identical section stacks across niches',
      ],
    },
    artDirection: {
      archetype: spec.layoutId || 'editorial',
      typography: {
        display: spec.tokens.headingFont,
        body: spec.tokens.bodyFont,
        scale: 'expressive',
      },
      colorStrategy: {
        primary: spec.tokens.primary,
        background: spec.tokens.background,
        text: spec.tokens.text,
        accent: spec.tokens.accent,
        secondary: spec.tokens.secondary,
        mood: spec.mood,
      },
      photography: {
        style: 'product-led',
        treatment: 'natural',
        avoid: ['random stock collage'],
      },
      density: spec.density === 'compact' ? 'dense' : spec.density === 'cozy' ? 'balanced' : 'sparse',
      radius: /none/i.test(spec.tokens.radius || '') ? 'sharp' : 'soft',
      shadow: (spec.tokens.shadow as 'none' | 'soft' | 'lift') || 'soft',
      motion: 'subtle',
    },
    ux: {
      primaryConversion: 'Browse and purchase products',
      ctaStyle: spec.tokens.buttonStyle || 'solid',
      navStyle: spec.nav?.style === 'transparent' ? 'transparent' : 'minimal',
      discovery: 'featured products',
      mobileStrategy: 'Stack editorial sections; keep product grids scannable.',
    },
    pageIntent: {
      homeNarrative: spec.copy.heroSubtitle || spec.copy.about || 'Premium ecommerce home',
      mustHave: ['nav', 'hero', 'products', 'footer'],
      mustAvoid: ['generic_feature_trio'],
    },
  });

  const brandSystem = brandDesignSystemFromSpec(designSpec);
  const nodes: SiteNode[] = [];
  let i = 1;

  const navVariant = spec.nav?.style === 'transparent' ? 'transparent' : 'minimal';
  nodes.push({
    id: nid('nav', i++),
    type: 'nav',
    variant: navVariant,
    visible: true,
    content: { storeName: spec.copy.storeName, logoUrl: spec.copy.logoUrl },
    design: {},
    responsive: {},
  });

  if (spec.copy.announcement) {
    nodes.push({
      id: nid('announcement', i++),
      type: 'announcement',
      variant: 'slim',
      visible: true,
      content: { text: spec.copy.announcement },
      design: {},
      responsive: {},
    });
  }

  const heroVariant =
    spec.hero?.layout === 'split' || spec.tokens.heroLayout === 'split'
      ? 'editorial_split'
      : spec.hero?.layout === 'fullBleed'
        ? 'luxury_minimal'
        : 'product_focus';

  nodes.push({
    id: nid('hero', i++),
    type: 'hero',
    variant: heroVariant,
    visible: true,
    content: {
      title: spec.copy.heroTitle,
      subtitle: spec.copy.heroSubtitle,
      cta: spec.copy.heroButtonText,
      imageUrl: spec.copy.heroImageUrl,
    },
    design: {
      minHeight: heroVariant === 'luxury_minimal' ? '100vh' : '80vh',
      spacing: 'airy',
    },
    responsive: { mobile: { minHeight: '60vh' } },
    animation: { entrance: 'fade', intensity: 'subtle' },
  });

  // Map remaining v1 sections into compositions without enforcing old order as future creativity
  for (const section of spec.pages.home.sections) {
    if (section.visible === false) continue;
    if (section.type === 'header' || section.type === 'footer' || section.type === 'hero' || section.type === 'announcement') {
      continue;
    }
    if (section.type === 'products' || section.type === 'featured-collection') {
      nodes.push({
        id: nid('products', i++),
        type: 'productGrid',
        variant: 'editorial',
        visible: true,
        content: { title: String(section.props.title || (language === 'ro' ? 'Produse' : 'Featured')) },
        design: { spacing: 'airy' },
        responsive: {},
        dataBindings: { products: 'featured', limit: 8, showQuickAdd: spec.productCard?.showQuickAdd !== false },
      });
      continue;
    }
    if (section.type === 'collections') {
      nodes.push({
        id: nid('collections', i++),
        type: 'collections',
        variant: 'tiles',
        visible: true,
        content: { title: String(section.props.title || (language === 'ro' ? 'Colecții' : 'Collections')) },
        design: {},
        responsive: {},
      });
      continue;
    }
    if (section.type === 'about') {
      nodes.push({
        id: nid('story', i++),
        type: 'editorialSplit',
        variant: 'image_text',
        visible: true,
        content: {
          title: String(section.props.title || (language === 'ro' ? 'Povestea' : 'Our story')),
          body: spec.copy.about || section.props.text || '',
        },
        design: { spacing: 'dramatic' },
        responsive: {},
      });
      continue;
    }
    if (section.type === 'reviews') {
      nodes.push({
        id: nid('reviews', i++),
        type: 'reviews',
        variant: 'wall',
        visible: true,
        content: { title: String(section.props.title || (language === 'ro' ? 'Recenzii' : 'Reviews')) },
        design: {},
        responsive: {},
      });
      continue;
    }
    if (section.type === 'lookbook') {
      nodes.push({
        id: nid('mosaic', i++),
        type: 'editorialMosaic',
        variant: 'asymmetric',
        visible: true,
        content: { title: 'Lookbook' },
        design: {},
        responsive: {},
        dataBindings: { products: 'newest', limit: 4 },
      });
      continue;
    }
  }

  if (!nodes.some((n) => n.type === 'productGrid' || n.type === 'productRail' || n.type === 'productSpotlight')) {
    nodes.push({
      id: nid('products', i++),
      type: 'productGrid',
      variant: 'editorial',
      visible: true,
      content: { title: language === 'ro' ? 'Produse' : 'Featured' },
      design: {},
      responsive: {},
      dataBindings: { products: 'featured', limit: 8 },
    });
  }

  nodes.push({
    id: nid('footer', i++),
    type: 'footer',
    variant: /luxe|editorial/i.test(spec.layoutId) ? 'editorial_luxury' : 'minimal_commerce',
    visible: true,
    content: {
      storeName: spec.copy.storeName,
      text: spec.copy.footer,
      blurb: spec.copy.heroSubtitle,
    },
    design: {},
    responsive: {},
  });

  const document = siteDocumentSchema.parse({
    version: 2,
    siteId: `site_${spec.copy.storeName.replace(/\W+/g, '_').slice(0, 24).toLowerCase() || 'store'}`,
    designSystemId: `bds_${spec.layoutId || 'migrated'}`,
    pages: { home: { id: 'home', type: 'home', nodes } },
    meta: {
      language,
      niche: spec.niche,
      updatedAt: new Date().toISOString(),
      legacyLayoutId: spec.layoutId,
    },
  });

  return { document, designSpec, brandSystem };
}
