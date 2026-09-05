import type { CreativeStrategy } from '@shared/ai-studio-v2/creativeStrategy';
import { brandDesignSystemFromSpec, designSpecSchema, type BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import { siteDocumentSchema, type SiteDocument, type SiteNode } from '@/lib/ai-studio/v2/siteTree';
import { SHOWCASE_CATALOGS, SHOWCASE_STORES, type ShowcaseCatalog } from '@/lib/ai-studio/v2/showcaseData';
import type { LayoutGrammarId } from './types';

function n(
  id: string,
  type: SiteNode['type'],
  variant: string,
  content: Record<string, unknown>
): SiteNode {
  return { id, type, variant, visible: true, content, design: {}, responsive: {} };
}

const brief = (text: string) => text;

export const CANONICAL_STRATEGIES: Record<LayoutGrammarId, CreativeStrategy> = {
  editorial_asymmetric: {
    pageComposition: 'asymmetric_magazine',
    narrativeModel: 'editorial',
    heroPhilosophy: 'split_editorial',
    commerceEntry: 'mid',
    commerceModel: 'shoppable_editorial',
    rhythm: 'sparse_pause',
    density: 'low',
    asymmetry: 'high',
    typographyRole: 'quiet',
    imageryRole: 'dominant',
    navigationBehavior: 'minimal_chrome',
    experimentationLevel: 'medium',
    distinctivenessBrief: brief('Avoid a stacked hero-rail-footer. Build a magazine with offset columns and editorial pauses.'),
  },
  cinematic_full_bleed: {
    pageComposition: 'cinematic_scroll',
    narrativeModel: 'campaign',
    heroPhilosophy: 'atmosphere_first',
    commerceEntry: 'delayed',
    commerceModel: 'flagship_then_rail',
    rhythm: 'long_short_long',
    density: 'low',
    asymmetry: 'medium',
    typographyRole: 'balanced',
    imageryRole: 'dominant',
    navigationBehavior: 'quiet_overlay',
    experimentationLevel: 'medium',
    distinctivenessBrief: brief('Avoid boxed sections. Tell the story in full-bleed frames with layered type and dark/light cuts.'),
  },
  product_monument: {
    pageComposition: 'product_artifact',
    narrativeModel: 'product_journey',
    heroPhilosophy: 'product_as_artifact',
    commerceEntry: 'immediate',
    commerceModel: 'single_artifact',
    rhythm: 'sparse_pause',
    density: 'low',
    asymmetry: 'low',
    typographyRole: 'quiet',
    imageryRole: 'supporting',
    navigationBehavior: 'minimal_chrome',
    experimentationLevel: 'low',
    distinctivenessBrief: brief('Avoid a product grid in the hero. Stage one object as a monument, then reveal supporting pieces.'),
  },
  typographic_campaign: {
    pageComposition: 'typography_led',
    narrativeModel: 'campaign',
    heroPhilosophy: 'typography_first',
    commerceEntry: 'early',
    commerceModel: 'dense_catalogue',
    rhythm: 'rapid_contrast',
    density: 'high',
    asymmetry: 'high',
    typographyRole: 'dominant_structural',
    imageryRole: 'supporting',
    navigationBehavior: 'bold_campaign',
    experimentationLevel: 'high',
    distinctivenessBrief: brief('Avoid image-first templates. Let display type be the campaign; collide it with media on purpose.'),
  },
  immersive_catalog: {
    pageComposition: 'catalogue_first',
    narrativeModel: 'catalogue',
    heroPhilosophy: 'immediate_offer',
    commerceEntry: 'immediate',
    commerceModel: 'dense_catalogue',
    rhythm: 'even',
    density: 'high',
    asymmetry: 'medium',
    typographyRole: 'balanced',
    imageryRole: 'balanced',
    navigationBehavior: 'solid_compact',
    experimentationLevel: 'medium',
    distinctivenessBrief: brief('Avoid a uniform three-column grid. Mix featured breakouts, category interrupts and mosaic spans.'),
  },
  warm_storytelling: {
    pageComposition: 'editorial_journey',
    narrativeModel: 'chaptered',
    heroPhilosophy: 'split_editorial',
    commerceEntry: 'delayed',
    commerceModel: 'shoppable_editorial',
    rhythm: 'sparse_pause',
    density: 'low',
    asymmetry: 'medium',
    typographyRole: 'quiet',
    imageryRole: 'balanced',
    navigationBehavior: 'minimal_chrome',
    experimentationLevel: 'medium',
    distinctivenessBrief: brief('Avoid a merch dump. Write chapters, cluster images, and let products appear as objects in the story.'),
  },
};

const SHARED_HERO = 'https://images.unsplash.com/photo-1746880223690-359948154c53?auto=format&fit=crop&w=1600&q=80';
const SHARED_STORY = 'https://images.unsplash.com/photo-1702326626601-74d2e86922b4?auto=format&fit=crop&w=1400&q=80';

export const SHARED_DOCUMENT: SiteDocument = siteDocumentSchema.parse({
  version: 2,
  siteId: 'layout_grammar_shared',
  designSystemId: 'linea_neutral',
  pages: {
    home: {
      id: 'home',
      type: 'home',
      nodes: [
        n('nav_01', 'nav', 'minimal', { storeName: 'Linea' }),
        n('hero_01', 'hero', 'editorial_split', {
          kicker: 'Autumn collection',
          title: 'Objects made to be kept.',
          subtitle: 'A considered collection for rooms that prefer quiet over spectacle.',
          cta: 'View the collection',
          imageUrl: SHARED_HERO,
        }),
        n('statement_01', 'brandStatement', 'large_type', {
          statement: 'Made slowly, in small batches, for people who notice the grain.',
        }),
        n('spotlight_01', 'productSpotlight', 'feature', {
          title: 'The Milano Day Bag',
          body: 'Vegetable-tanned calfskin. Hand-finished seams. A single interior, because most days need less.',
          cta: 'View the piece',
          kicker: 'Featured piece',
        }),
        n('story_01', 'editorialSplit', 'image_text', {
          title: 'Hands, light, leather',
          body: 'Each hide is cut by partners we have known for a decade. No seasonal logo drops — only material that ages with you.',
          imageUrl: SHARED_STORY,
        }),
        n('mosaic_01', 'editorialMosaic', 'asymmetric', { title: 'Atelier notes' }),
        n('grid_01', 'productGrid', 'editorial', { title: 'The collection' }),
        n('rail_01', 'productRail', 'horizontal', { title: 'Also in the atelier' }),
        n('reviews_01', 'reviews', 'wall', { title: 'From the studio visitors' }),
        n('collections_01', 'collections', 'tiles', { title: 'Departments' }),
        n('newsletter_01', 'newsletter', 'quiet', { title: 'Notes from the studio', cta: 'Subscribe' }),
        n('footer_01', 'footer', 'editorial_luxury', {
          storeName: 'Linea',
          blurb: 'Milan · Florence',
          text: 'Private appointments on request.',
        }),
      ],
    },
  },
  meta: { language: 'en', niche: 'leather goods', updatedAt: '2026-09-04T00:00:00.000Z' },
});

/** Same products/images for every grammar in neutral mode. */
export const SHARED_CATALOG: ShowcaseCatalog = {
  ...SHOWCASE_CATALOGS.atelier_no8,
  id: 'atelier_no8',
  storeName: 'Linea',
  tagline: 'Objects made to be kept.',
};

const neutralSpec = designSpecSchema.parse({
  version: 1,
  creativeMode: 'balanced',
  brand: {
    businessType: 'leather goods',
    audience: 'people who prefer quiet objects',
    positioning: 'considered essentials',
    personality: ['calm', 'precise', 'warm'],
    priceLevel: 'premium',
    language: 'en',
    storeName: 'Linea',
  },
  designIntent: {
    coreConcept: 'A neutral canvas so layout grammar — not color — carries the identity.',
    emotionalGoal: 'Calm attention',
    visualHierarchy: 'Type, then object, then story.',
    compositionPrinciples: ['Grammar first', 'Shared catalog', 'No decorative chrome'],
    photographyDirection: 'Existing fixture stills only',
    typographyDirection: 'Grammar-owned roles',
    interactionDirection: 'Quiet commerce',
    premiumCharacteristics: ['Whitespace', 'Material honesty'],
    avoidPatterns: ['Neon gradients', 'Glassmorphism'],
  },
  artDirection: {
    archetype: 'quiet_luxury_editorial',
    typography: { display: 'Cormorant Garamond', body: 'Manrope', scale: 'restrained' },
    colorStrategy: {
      primary: '#1C1C1C',
      background: '#F4F1EC',
      text: '#1C1C1C',
      accent: '#6B645C',
      secondary: '#E7E2DA',
    },
    photography: { style: 'still life', treatment: 'daylight', avoid: ['stock models'] },
    density: 'balanced',
    radius: 'sharp',
    shadow: 'none',
    motion: 'none',
  },
  ux: {
    primaryConversion: 'View the collection',
    ctaStyle: 'quiet text',
    navStyle: 'minimal',
    discovery: 'spotlight then collection',
    mobileStrategy: 'Recompose, do not collapse',
  },
  pageIntent: {
    homeNarrative: 'Shared content, six grammars.',
    mustHave: ['hero', 'product', 'story'],
    mustAvoid: ['generic stacked landing page'],
  },
  creativeStrategy: CANONICAL_STRATEGIES.editorial_asymmetric,
});

export const NEUTRAL_BRAND: BrandDesignSystem = brandDesignSystemFromSpec(neutralSpec);

export const NICHE_STORE_ID: Record<LayoutGrammarId, keyof typeof SHOWCASE_CATALOGS> = {
  editorial_asymmetric: 'atelier_no8',
  cinematic_full_bleed: 'northline',
  product_monument: 'forma_audio',
  typographic_campaign: 'northline',
  immersive_catalog: 'aurelia',
  warm_storytelling: 'maison_alba',
};

export function nicheBrand(grammarId: LayoutGrammarId): BrandDesignSystem {
  const id = NICHE_STORE_ID[grammarId];
  return SHOWCASE_STORES.find((s) => s.id === id)!.brand;
}

export function nicheCatalog(grammarId: LayoutGrammarId): ShowcaseCatalog {
  return SHOWCASE_CATALOGS[NICHE_STORE_ID[grammarId]];
}

export function nicheDocument(grammarId: LayoutGrammarId): SiteDocument {
  const store = SHOWCASE_STORES.find((s) => s.id === NICHE_STORE_ID[grammarId])!;
  return store.document;
}

export type BrandingMode = 'neutral' | 'niche';

export function catalogFor(mode: BrandingMode, grammarId: LayoutGrammarId): ShowcaseCatalog {
  return mode === 'neutral' ? SHARED_CATALOG : nicheCatalog(grammarId);
}

export function documentFor(mode: BrandingMode, grammarId: LayoutGrammarId): SiteDocument {
  if (mode === 'neutral') {
    return {
      ...SHARED_DOCUMENT,
      pages: {
        home: {
          ...SHARED_DOCUMENT.pages.home,
          nodes: SHARED_DOCUMENT.pages.home.nodes.map((node) =>
            node.type === 'nav' || node.type === 'footer'
              ? { ...node, content: { ...node.content, storeName: 'Linea' } }
              : node
          ),
        },
      },
    };
  }
  return nicheDocument(grammarId);
}

export function brandFor(mode: BrandingMode, grammarId: LayoutGrammarId): BrandDesignSystem {
  return mode === 'neutral' ? NEUTRAL_BRAND : nicheBrand(grammarId);
}
