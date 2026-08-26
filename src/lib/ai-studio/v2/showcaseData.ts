import type {
  StorefrontCollection,
  StorefrontProduct,
  StorefrontReview,
} from '@/lib/storefront/types';
import type { BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import { brandDesignSystemFromSpec, designSpecSchema } from '@/lib/ai-studio/v2/designSpec';
import { siteDocumentSchema, type SiteDocument, type SiteNode } from '@/lib/ai-studio/v2/siteTree';

const u = (id: string, w = 1400) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export type ShowcaseBrandId =
  | 'atelier_no8'
  | 'aurelia'
  | 'northline'
  | 'forma_audio'
  | 'maison_alba';

function product(
  partial: Omit<StorefrontProduct, 'images' | 'collection_ids' | 'has_discount' | 'discount_percentage' | 'original_price'> & {
    original_price?: number;
    collection_ids?: string[];
  }
): StorefrontProduct {
  const original = partial.original_price ?? partial.price;
  const hasDiscount = original > partial.price;
  return {
    ...partial,
    original_price: original,
    has_discount: hasDiscount,
    discount_percentage: hasDiscount ? Math.round(((original - partial.price) / original) * 100) : 0,
    images: partial.image ? [{ image_url: partial.image, is_primary: true }] : [],
    collection_ids: partial.collection_ids || [],
  };
}

export type ShowcaseCatalog = {
  id: ShowcaseBrandId;
  label: string;
  storeName: string;
  tagline: string;
  /** Showcase immersion — ProductPresentation reads this; ProductCard is not used in V2. */
  currency: 'EUR' | 'USD' | 'GBP' | 'RON';
  locale: string;
  products: StorefrontProduct[];
  collections: StorefrontCollection[];
  reviews: StorefrontReview[];
  heroImage: string;
  storyImage: string;
};

export const SHOWCASE_CATALOGS: Record<ShowcaseBrandId, ShowcaseCatalog> = {
  atelier_no8: {
    id: 'atelier_no8',
    label: 'Luxury fashion',
    storeName: 'Atelier No. 8',
    tagline: 'Italian leather handbags.',
    currency: 'EUR',
    locale: 'en-EU',
    heroImage: u('photo-1746880223690-359948154c53'),
    storyImage: u('photo-1702326626601-74d2e86922b4'),
    collections: [
      { id: 'col-day', name: 'Day bags', description: 'Structured everyday leather', image_url: u('photo-1746880223690-359948154c53', 800) },
      { id: 'col-evening', name: 'Evening', description: 'Compact silhouettes', image_url: u('photo-1702326626601-74d2e86922b4', 800) },
      { id: 'col-travel', name: 'Travel', description: 'Soft totes & weekenders', image_url: u('photo-1713425885188-f1daa057691f', 800) },
    ],
    products: [
      product({ id: 'a1', title: 'Milano Day Bag', description: 'Structured tote with a single interior compartment.', price: 890, image: u('photo-1624687943971-e86af76d57de'), stock: 12, sku: 'AN8-MIL', category: 'Day bags', collection_ids: ['col-day'] }),
      product({ id: 'a2', title: 'Verona Mini', description: 'Compact top-handle bag with a detachable strap.', price: 620, image: u('photo-1594223274512-ad4803739b7c'), stock: 8, sku: 'AN8-VER', category: 'Evening', collection_ids: ['col-evening'] }),
      product({ id: 'a3', title: 'Florence Tote', description: 'Woven panels with a slim chain handle.', price: 740, image: u('photo-1598532163257-ae3c6b2524b6'), stock: 10, sku: 'AN8-FLO', category: 'Travel', collection_ids: ['col-travel'] }),
      product({ id: 'a4', title: 'Como Clutch', description: 'Evening silhouette with a chain shoulder strap.', price: 480, image: u('photo-1587538520952-fafa4eeee7be'), stock: 6, sku: 'AN8-COM', category: 'Evening', collection_ids: ['col-evening'] }),
      product({ id: 'a5', title: 'Siena Shoulder', description: 'Flap satchel with a buckled front closure.', price: 710, image: u('photo-1603219527847-24c87f552a77'), stock: 9, sku: 'AN8-SIE', category: 'Day bags', collection_ids: ['col-day'] }),
      product({ id: 'a6', title: 'Roma Weekender', description: 'Roomy weekend duffel with rolled handles.', price: 980, image: u('photo-1525103504173-8dc1582c7430'), stock: 5, sku: 'AN8-ROM', category: 'Travel', collection_ids: ['col-travel'] }),
    ],
    reviews: [
      { id: 'ar1', customer_name: 'Clara V.', rating: 5, comment: 'The leather softens beautifully. Feels considered, not loud.', product_id: 'a1', created_at: '2026-01-12' },
      { id: 'ar2', customer_name: 'Helena M.', rating: 5, comment: 'Packaging alone felt like a private atelier.', product_id: 'a2', created_at: '2026-02-03' },
      { id: 'ar3', customer_name: 'Sofia R.', rating: 4, comment: 'Quiet luxury done properly — no logos, just craft.', product_id: 'a3', created_at: '2026-03-18' },
    ],
  },
  aurelia: {
    id: 'aurelia',
    label: 'Premium skincare',
    storeName: 'Aurelia',
    tagline: 'Modern botanical skincare.',
    currency: 'EUR',
    locale: 'en-EU',
    heroImage: u('photo-1556228578-0d85b1a4d571'),
    storyImage: u('photo-1570172619644-dfd03ed5d881'),
    collections: [
      { id: 'col-cleanse', name: 'Cleanse', description: 'Gentle first steps', image_url: u('photo-1556228720-195a672e8a03', 800) },
      { id: 'col-treat', name: 'Treat', description: 'Serums & concentrates', image_url: u('photo-1512496015851-a90fb38ba796', 800) },
      { id: 'col-barrier', name: 'Barrier', description: 'Moisture & recovery', image_url: u('photo-1611930022073-b7a4ba5fcccd', 800) },
    ],
    products: [
      product({ id: 's1', title: 'Clarity Serum 15%', description: 'Niacinamide concentrate for refined texture.', price: 68, image: u('photo-1512496015851-a90fb38ba796'), stock: 40, sku: 'AUR-CLR', category: 'Treat', collection_ids: ['col-treat'] }),
      product({ id: 's2', title: 'Botanical Gel Cleanser', description: 'Fragrance-free gel for morning reset.', price: 34, image: u('photo-1556228720-195a672e8a03'), stock: 55, sku: 'AUR-CLN', category: 'Cleanse', collection_ids: ['col-cleanse'] }),
      product({ id: 's3', title: 'Barrier Cream', description: 'Ceramide-rich recovery moisturizer.', price: 52, image: u('photo-1611930022073-b7a4ba5fcccd'), stock: 32, sku: 'AUR-BAR', category: 'Barrier', collection_ids: ['col-barrier'] }),
      product({ id: 's4', title: 'Vitamin C Soft Mist', description: 'Daily antioxidant mist.', price: 42, image: u('photo-1570172619644-dfd03ed5d881'), stock: 28, sku: 'AUR-VIT', category: 'Treat', collection_ids: ['col-treat'] }),
      product({ id: 's5', title: 'Eye Recovery Gel', description: 'Cooling peptides for tired mornings.', price: 48, image: u('photo-1571781926291-c477ebfd024b'), stock: 22, sku: 'AUR-EYE', category: 'Treat', collection_ids: ['col-treat'] }),
      product({ id: 's6', title: 'Overnight Oil', description: 'Squalane blend for overnight repair.', price: 58, image: u('photo-1596755389378-c31d21fd1273'), stock: 18, sku: 'AUR-OIL', category: 'Barrier', collection_ids: ['col-barrier'] }),
    ],
    reviews: [
      { id: 'sr1', customer_name: 'Maya K.', rating: 5, comment: 'Texture improved in two weeks. No fragrance overwhelm.', product_id: 's1', created_at: '2026-01-20' },
      { id: 'sr2', customer_name: 'Priya S.', rating: 5, comment: 'Finally a routine that fits a 6:40am start.', product_id: 's2', created_at: '2026-02-11' },
      { id: 'sr3', customer_name: 'Elena T.', rating: 4, comment: 'Barrier cream is quietly excellent.', product_id: 's3', created_at: '2026-03-02' },
    ],
  },
  northline: {
    id: 'northline',
    label: 'Streetwear',
    storeName: 'Northline',
    tagline: 'Contemporary urban essentials.',
    currency: 'EUR',
    locale: 'en-EU',
    heroImage: u('photo-1552374196-1ab2a1c593e8'),
    storyImage: u('photo-1523381210434-271e8be1f52b'),
    collections: [
      { id: 'col-tops', name: 'Tops', description: 'Oversized cuts', image_url: u('photo-1521572163474-6864f9cf17ab', 800) },
      { id: 'col-bottoms', name: 'Bottoms', description: 'Wide & cargo', image_url: u('photo-1542272604-787c3835535d', 800) },
      { id: 'col-outer', name: 'Outerwear', description: 'City layers', image_url: u('photo-1551028719-00167b16eac5', 800) },
    ],
    products: [
      product({ id: 'n1', title: 'Oversized Box Tee', description: 'Heavyweight cotton, dropped shoulder.', price: 68, image: u('photo-1521572163474-6864f9cf17ab'), stock: 40, sku: 'NL-TEE', category: 'Tops', collection_ids: ['col-tops'] }),
      product({ id: 'n2', title: 'Cargo Wide Pant', description: 'Relaxed cargo with matte hardware.', price: 128, image: u('photo-1542272604-787c3835535d'), stock: 24, sku: 'NL-CRG', category: 'Bottoms', collection_ids: ['col-bottoms'] }),
      product({ id: 'n3', title: 'Night Shell Jacket', description: 'Water-resistant shell for city rain.', price: 198, image: u('photo-1551028719-00167b16eac5'), stock: 16, sku: 'NL-JKT', category: 'Outerwear', collection_ids: ['col-outer'] }),
      product({ id: 'n4', title: 'Utility Cap', description: 'Structured cotton with tonal embroidery.', price: 42, image: u('photo-1529374255404-311a2a4f1fd9'), stock: 50, sku: 'NL-CAP', category: 'Accessories', collection_ids: ['col-tops'] }),
      product({ id: 'n5', title: 'Layer Hoodie', description: 'Brushed fleece, oversized hood.', price: 118, image: u('photo-1556821840-3a63f95609a7'), stock: 30, sku: 'NL-HD', category: 'Tops', collection_ids: ['col-tops'] }),
      product({ id: 'n6', title: 'City Runner', description: 'Chunky sole sneaker in matte black.', price: 168, image: u('photo-1542291026-7eec264c27ff'), stock: 20, sku: 'NL-RUN', category: 'Footwear', collection_ids: ['col-bottoms'] }),
    ],
    reviews: [
      { id: 'nr1', customer_name: 'Mika', rating: 5, comment: 'Fit hits different. Keep the drops coming.', product_id: 'n1', created_at: '2026-01-08' },
      { id: 'nr2', customer_name: 'Noah', rating: 5, comment: 'Premium streetwear that doesn’t feel costume.', product_id: 'n3', created_at: '2026-02-14' },
      { id: 'nr3', customer_name: 'Jay', rating: 4, comment: 'Cargo pant silhouette is clean.', product_id: 'n2', created_at: '2026-03-01' },
    ],
  },
  forma_audio: {
    id: 'forma_audio',
    label: 'Premium electronics',
    storeName: 'Forma Audio',
    tagline: 'High-end wireless headphones.',
    currency: 'EUR',
    locale: 'en-EU',
    heroImage: u('photo-1505740420928-5e560c06d30e'),
    storyImage: u('photo-1484704849700-f032a568e944'),
    collections: [
      { id: 'col-headphones', name: 'Headphones', description: 'Over-ear flagships', image_url: u('photo-1505740420928-5e560c06d30e', 800) },
      { id: 'col-earbuds', name: 'Earbuds', description: 'Daily drivers', image_url: u('photo-1590658268037-6bf12165a8df', 800) },
      { id: 'col-accessories', name: 'Accessories', description: 'Cases & cables', image_url: u('photo-1484704849700-f032a568e944', 800) },
    ],
    products: [
      product({ id: 'e1', title: 'Forma One Wireless', description: 'Adaptive ANC with 36-hour battery.', price: 349, image: u('photo-1505740420928-5e560c06d30e'), stock: 25, sku: 'FA-ONE', category: 'Headphones', collection_ids: ['col-headphones'] }),
      product({ id: 'e2', title: 'Forma Buds Pro', description: 'Spatial audio earbuds with dual drivers.', price: 229, image: u('photo-1590658268037-6bf12165a8df'), stock: 40, sku: 'FA-BUD', category: 'Earbuds', collection_ids: ['col-earbuds'] }),
      product({ id: 'e3', title: 'Studio Stand', description: 'Machined aluminum headphone stand.', price: 89, image: u('photo-1484704849700-f032a568e944'), stock: 35, sku: 'FA-STN', category: 'Accessories', collection_ids: ['col-accessories'] }),
      product({ id: 'e4', title: 'Travel Case Soft', description: 'Molded case for Forma One.', price: 49, image: u('photo-1572635196237-14b3f281503f'), stock: 60, sku: 'FA-CSE', category: 'Accessories', collection_ids: ['col-accessories'] }),
      product({ id: 'e5', title: 'Forma Lite', description: 'Lightweight open-back wireless.', price: 199, original_price: 249, image: u('photo-1487215078519-e21cc028cb29'), stock: 18, sku: 'FA-LTE', category: 'Headphones', collection_ids: ['col-headphones'] }),
      product({ id: 'e6', title: 'USB-C DAC Cable', description: 'Hi-res cable for mobile listening.', price: 59, image: u('photo-1625948515291-69613efd103f'), stock: 70, sku: 'FA-DAC', category: 'Accessories', collection_ids: ['col-accessories'] }),
    ],
    reviews: [
      { id: 'er1', customer_name: 'Alex P.', rating: 5, comment: 'ANC is surgical on flights. Build feels expensive.', product_id: 'e1', created_at: '2026-01-15' },
      { id: 'er2', customer_name: 'Sam W.', rating: 5, comment: 'Buds Pro seal well without fatigue.', product_id: 'e2', created_at: '2026-02-20' },
      { id: 'er3', customer_name: 'Riley N.', rating: 4, comment: 'Stand is a desk flex. Worth it.', product_id: 'e3', created_at: '2026-03-09' },
    ],
  },
  maison_alba: {
    id: 'maison_alba',
    label: 'Artisan food',
    storeName: 'Maison Alba',
    tagline: 'Small-batch Mediterranean pantry.',
    currency: 'EUR',
    locale: 'en-EU',
    heroImage: u('photo-1474979266404-7eaacbcd87c5'),
    storyImage: u('photo-1505576391880-b3f9d713dc4f'),
    collections: [
      { id: 'col-oils', name: 'Oils', description: 'Named groves', image_url: u('photo-1474979266404-7eaacbcd87c5', 800) },
      { id: 'col-pantry', name: 'Pantry', description: 'Jars & conserves', image_url: u('photo-1606923829579-0cb981a83e2e', 800) },
      { id: 'col-gifts', name: 'Gifts', description: 'Tableside sets', image_url: u('photo-1414235077428-338989a2e8c0', 800) },
    ],
    products: [
      product({ id: 'f1', title: 'Grove No. 3 Olive Oil', description: 'Early harvest from the Alba estate.', price: 42, image: u('photo-1474979266404-7eaacbcd87c5'), stock: 40, sku: 'MA-OIL', category: 'Oils', collection_ids: ['col-oils'] }),
      product({ id: 'f2', title: 'Sun-Dried Tomato Conserve', description: 'Slow-dried with Mediterranean herbs.', price: 18, image: u('photo-1606923829579-0cb981a83e2e'), stock: 55, sku: 'MA-TOM', category: 'Pantry', collection_ids: ['col-pantry'] }),
      product({ id: 'f3', title: 'Wildflower Honey', description: 'Single-season jar from coastal hives.', price: 24, image: u('photo-1587049352846-4a222e784d38'), stock: 30, sku: 'MA-HNY', category: 'Pantry', collection_ids: ['col-pantry'] }),
      product({ id: 'f4', title: 'Herb Salt Blend', description: 'Hand-milled salt with rosemary & thyme.', price: 16, image: u('photo-1490818387583-1baba5e638af'), stock: 48, sku: 'MA-SLT', category: 'Pantry', collection_ids: ['col-pantry'] }),
      product({ id: 'f5', title: 'Table Gift Trio', description: 'Oil, honey, and salt in linen wrap.', price: 78, image: u('photo-1606313564200-e75d5e30476c'), stock: 20, sku: 'MA-GFT', category: 'Gifts', collection_ids: ['col-gifts'] }),
      product({ id: 'f6', title: 'Citrus Preserve', description: 'Bitter orange marmalade, small batch.', price: 19, image: u('photo-1481391319762-47dff72954d9'), stock: 35, sku: 'MA-CIT', category: 'Pantry', collection_ids: ['col-pantry'] }),
    ],
    reviews: [
      { id: 'fr1', customer_name: 'Elena R.', rating: 5, comment: 'The olive oil tastes like a place, not a brand.', product_id: 'f1', created_at: '2026-01-22' },
      { id: 'fr2', customer_name: 'Tom H.', rating: 5, comment: 'Gifting that feels considered.', product_id: 'f5', created_at: '2026-02-08' },
      { id: 'fr3', customer_name: 'Ana B.', rating: 4, comment: 'Honey is floral without being sweet-sweet.', product_id: 'f3', created_at: '2026-03-12' },
    ],
  },
};

function nodes(...list: SiteNode[]): SiteNode[] {
  return list;
}

function n(
  id: string,
  type: SiteNode['type'],
  variant: string,
  content: Record<string, unknown>,
  extra: Partial<SiteNode> = {}
): SiteNode {
  return {
    id,
    type,
    variant,
    visible: true,
    content,
    design: {},
    responsive: {},
    ...extra,
  };
}

export type ShowcaseStore = {
  id: ShowcaseBrandId;
  title: string;
  brief: string;
  compositionNote: string;
  brand: BrandDesignSystem;
  document: SiteDocument;
  catalog: ShowcaseCatalog;
  checklistHints: Record<string, string>;
};

function makeStore(
  id: ShowcaseBrandId,
  title: string,
  brief: string,
  compositionNote: string,
  specInput: Parameters<typeof designSpecSchema.parse>[0],
  homeNodes: SiteNode[],
  checklistHints: Record<string, string>
): ShowcaseStore {
  const designSpec = designSpecSchema.parse(specInput);
  const brand = brandDesignSystemFromSpec(designSpec);
  const catalog = SHOWCASE_CATALOGS[id];
  const document = siteDocumentSchema.parse({
    version: 2,
    siteId: id,
    designSystemId: brand.archetype.replace(/\W+/g, '_').toLowerCase(),
    pages: { home: { id: 'home', type: 'home', nodes: homeNodes } },
    meta: {
      language: 'en',
      niche: designSpec.brand.businessType,
      updatedAt: new Date().toISOString(),
    },
  });
  return { id, title, brief, compositionNote, brand, document, catalog, checklistHints };
}

/** Five complete SiteTrees — deliberately different architecture, not recolored clones. */
export const SHOWCASE_STORES: ShowcaseStore[] = [
  makeStore(
    'atelier_no8',
    'Store A — Luxury fashion',
    'Atelier No. 8 — Italian leather handbags.',
    'transparent nav → luxury full-bleed hero → brand statement → product spotlight → editorial story → product rail → luxury footer. Sparse rhythm, serif hierarchy.',
    {
      version: 1,
      creativeMode: 'balanced',
      brand: {
        businessType: 'luxury handbags',
        audience: 'women who prefer understated luxury',
        positioning: 'quiet luxury',
        personality: ['restrained', 'Italian', 'editorial'],
        priceLevel: 'luxury',
        language: 'en',
        storeName: 'Atelier No. 8',
      },
      designIntent: {
        coreConcept: 'Understated luxury closer to an editorial fashion magazine than a store.',
        emotionalGoal: 'Quiet confidence',
        visualHierarchy: 'Atmosphere first, then one object, then craft story, then slow rail.',
        compositionPrinciples: ['Sparse', 'Full-bleed atmosphere', 'Few products'],
        photographyDirection: 'Soft daylight leather stills',
        typographyDirection: 'Serif display with generous tracking',
        interactionDirection: 'Almost no chrome',
        premiumCharacteristics: ['Whitespace', 'Material honesty'],
        avoidPatterns: ['Busy grids', 'Neon CTAs'],
      },
      artDirection: {
        archetype: 'quiet_luxury_editorial',
        typography: { display: 'Cormorant Garamond', body: 'Manrope', scale: 'expressive' },
        colorStrategy: {
          primary: '#2C2420',
          background: '#F7F3EE',
          text: '#1A1614',
          accent: '#8A6A4F',
          secondary: '#EDE6DC',
        },
        photography: { style: 'leather still-life', treatment: 'soft daylight', avoid: ['stock models'] },
        density: 'sparse',
        radius: 'sharp',
        shadow: 'none',
        motion: 'subtle',
      },
      ux: {
        primaryConversion: 'Discover handbags',
        ctaStyle: 'outline quiet',
        navStyle: 'transparent immersive',
        discovery: 'spotlight then rail',
        mobileStrategy: 'Full-bleed then stack',
      },
      pageIntent: {
        homeNarrative: 'Enter a calm atelier.',
        mustHave: ['luxury hero', 'statement', 'spotlight'],
        mustAvoid: ['dense dump'],
      },
    },
    nodes(
      n('nav_01', 'nav', 'transparent', { storeName: 'Atelier No. 8', tone: 'dark' }),
      n(
        'hero_01',
        'hero',
        'luxury_minimal',
        {
          title: 'Leather, quietly made.',
          subtitle: 'Handbags for women who prefer presence without noise.',
          cta: 'Enter the atelier',
          imageUrl: SHOWCASE_CATALOGS.atelier_no8.heroImage,
        },
        { design: { minHeight: '100vh', spacing: 'dramatic' }, responsive: { mobile: { minHeight: '80vh' } } }
      ),
      n('statement_01', 'brandStatement', 'large_type', {
        statement: 'Understated luxury is a discipline, not a discount.',
      }, { design: { spacing: 'dramatic' } }),
      n(
        'spotlight_01',
        'productSpotlight',
        'feature',
        {
          title: 'The Milano Day Bag',
          body: 'Vegetable-tanned calfskin. Hand-finished seams. Made in small batches outside Florence.',
          cta: 'View the piece',
          presentation: 'luxury',
        },
        { dataBindings: { products: 'featured', limit: 1 } }
      ),
      n(
        'story_01',
        'editorialSplit',
        'image_text',
        {
          title: 'Florentine ateliers',
          body: 'Each piece is cut by partners we have known for a decade — no seasonal logo drops, only leather that ages with you.',
          imageUrl: SHOWCASE_CATALOGS.atelier_no8.storyImage,
        },
        { design: { spacing: 'dramatic' } }
      ),
      n(
        'rail_01',
        'productRail',
        'horizontal',
        { title: 'The collection', presentation: 'luxury' },
        { dataBindings: { products: 'newest', limit: 8 } }
      ),
      n(
        'footer_01',
        'footer',
        'editorial_luxury',
        { storeName: 'Atelier No. 8', blurb: 'Milan · Florence', text: 'Private appointments on request.' }
      )
    ),
    {
      'Visual hierarchy': 'Does the full-bleed hero dominate before any merch?',
      Composition: 'Is the rhythm sparse (statement → one product → story → rail)?',
      Typography: 'Does Cormorant feel editorial, not template?',
      Spacing: 'Is there intentional emptiness, or does it feel empty by accident?',
      Imagery: 'Do leather stills feel premium?',
      'Brand consistency': 'Quiet luxury throughout?',
      'Product presentation': 'Spotlight-first vs dump?',
      Mobile: 'Does 100vh hero still feel intentional?',
      Originality: 'Could this be mistaken for Nord Atelier / generic shop?',
      'Premium perception': 'Agency-level or builder default?',
    }
  ),

  makeStore(
    'aurelia',
    'Store B — Skincare',
    'Aurelia — modern botanical skincare.',
    'minimal nav → slim announcement → product-focus hero → spotlight → editorial benefits → editorial grid → review wall → minimal footer. Clinical-clean hierarchy.',
    {
      version: 1,
      creativeMode: 'balanced',
      brand: {
        businessType: 'skincare',
        audience: 'professionals 25–45',
        positioning: 'clinical botanical',
        personality: ['clean', 'precise', 'calm'],
        priceLevel: 'premium',
        language: 'en',
        storeName: 'Aurelia',
      },
      designIntent: {
        coreConcept: 'Clinical-minimal skincare that feels like a design studio, not a spa brochure.',
        emotionalGoal: 'Clarity and trust',
        visualHierarchy: 'Product first, benefits second, proof third.',
        compositionPrinciples: ['Product hero', 'Benefit editorial', 'Airy grids'],
        photographyDirection: 'Macro textures, cool light, glass bottles',
        typographyDirection: 'Geometric sans throughout',
        interactionDirection: 'Crisp, no drama',
        premiumCharacteristics: ['White space', 'Precision type'],
        avoidPatterns: ['Pink spa clichés'],
      },
      artDirection: {
        archetype: 'clinical_minimal',
        typography: { display: 'Space Grotesk', body: 'DM Sans', scale: 'restrained' },
        colorStrategy: {
          primary: '#1F3A3A',
          background: '#F4F7F6',
          text: '#14201F',
          accent: '#4A7C74',
          secondary: '#E4EEEC',
        },
        photography: { style: 'product macro', treatment: 'cool daylight', avoid: ['spa stock'] },
        density: 'balanced',
        radius: 'soft',
        shadow: 'soft',
        motion: 'subtle',
      },
      ux: {
        primaryConversion: 'Shop routines',
        ctaStyle: 'solid',
        navStyle: 'minimal',
        discovery: 'spotlight then grid',
        mobileStrategy: 'Product card prominence',
      },
      pageIntent: {
        homeNarrative: 'Lead with hero product, then ritual benefits, then catalog.',
        mustHave: ['product hero', 'benefits', 'reviews'],
        mustAvoid: ['busy mosaic first'],
      },
    },
    nodes(
      n('nav_01', 'nav', 'minimal', { storeName: 'Aurelia' }),
      n('announcement_01', 'announcement', 'slim', { text: 'Free shipping over €60 · Dermatologist tested' }),
      n('hero_01', 'hero', 'product_focus', {
        title: 'Skin, clarified.',
        subtitle: 'Modern botanical formulas for professionals who want results without ritual theater.',
        cta: 'Shop the serum',
        kicker: 'Clarity system',
        presentation: 'tech',
      }),
      n(
        'spotlight_01',
        'productSpotlight',
        'feature',
        {
          title: 'Clarity Serum 15%',
          body: 'Niacinamide + peptides. Fragrance-free. Designed for mornings that start at 6:40.',
          cta: 'View formula',
          presentation: 'tech',
        },
        { dataBindings: { products: 'bestsellers', limit: 1 } }
      ),
      n(
        'story_01',
        'editorialSplit',
        'image_text',
        {
          title: 'Fewer steps. Better skin.',
          body: 'We design for real schedules — not twelve-step routines that collapse by Wednesday.',
          imageUrl: SHOWCASE_CATALOGS.aurelia.storyImage,
        }
      ),
      n(
        'products_01',
        'productGrid',
        'editorial',
        { title: 'The line', layout: 'featureFirst', presentation: 'tech' },
        { dataBindings: { products: 'featured', limit: 6, showQuickAdd: true } }
      ),
      n('reviews_01', 'reviews', 'wall', { title: 'What people notice' }),
      n('footer_01', 'footer', 'minimal_commerce', {
        storeName: 'Aurelia',
        text: 'Dermatologist-tested · Ships across the EU',
      })
    ),
    {
      'Visual hierarchy': 'Is the product the first visual hero?',
      Composition: 'Product → benefit → grid → proof — clear?',
      Typography: 'Does Space Grotesk feel clinical-premium?',
      Spacing: 'Balanced density vs luxury sparsity?',
      Imagery: 'Bottle macros vs lifestyle spa?',
      'Brand consistency': 'Cool mint system held?',
      'Product presentation': 'Grid scannable and premium?',
      Mobile: 'Hero product stack readable?',
      Originality: 'Different from Store A luxury?',
      'Premium perception': 'Skincare brand or generic shop?',
    }
  ),

  makeStore(
    'northline',
    'Store C — Streetwear',
    'Northline — contemporary urban essentials.',
    'minimal dark nav → editorial split hero → asymmetric mosaic → dense product grid → rail → testimonials → minimal footer. High contrast, dense rhythm.',
    {
      version: 1,
      creativeMode: 'surprise',
      brand: {
        businessType: 'streetwear',
        audience: 'young urban customers',
        positioning: 'bold oversized',
        personality: ['loud', 'urban', 'graphic'],
        priceLevel: 'premium',
        language: 'en',
        storeName: 'Northline',
      },
      designIntent: {
        coreConcept: 'A graphic street drop page — night market energy, not quiet luxury.',
        emotionalGoal: 'Energy and belonging',
        visualHierarchy: 'Hero punch → mosaic culture → dense merch.',
        compositionPrinciples: ['High contrast', 'Asymmetric mosaic', 'Dense grid'],
        photographyDirection: 'Harsh flash, concrete, oversized fits',
        typographyDirection: 'Heavy display sans, tight packing',
        interactionDirection: 'Snappy rail',
        premiumCharacteristics: ['Bold type', 'Cultural collage'],
        avoidPatterns: ['Beige quiet luxury'],
      },
      artDirection: {
        archetype: 'urban_drop',
        typography: { display: 'Outfit', body: 'Inter', scale: 'expressive' },
        colorStrategy: {
          primary: '#E8FF47',
          background: '#0A0A0A',
          text: '#F5F5F5',
          accent: '#E8FF47',
          secondary: '#1A1A1A',
        },
        photography: { style: 'flash street', treatment: 'high contrast', avoid: ['pastel'] },
        density: 'dense',
        radius: 'sharp',
        shadow: 'none',
        motion: 'cinematic',
      },
      ux: {
        primaryConversion: 'Hit the drop',
        ctaStyle: 'solid punch',
        navStyle: 'minimal dark',
        discovery: 'mosaic then dense grid',
        mobileStrategy: 'Rail-first browsing',
      },
      pageIntent: {
        homeNarrative: 'Drop energy then sell-out grid.',
        mustHave: ['mosaic', 'dense products'],
        mustAvoid: ['luxury serif hero'],
      },
    },
    nodes(
      n('nav_01', 'nav', 'minimal', { storeName: 'Northline' }),
      n(
        'hero_01',
        'hero',
        'editorial_split',
        {
          kicker: 'Drop 09',
          title: 'Oversized. Loud. Yours.',
          subtitle: 'Contemporary urban essentials cut for city nights.',
          cta: 'Shop the drop',
          imageUrl: SHOWCASE_CATALOGS.northline.heroImage,
        },
        { design: { spacing: 'compact' } }
      ),
      n(
        'mosaic_01',
        'editorialMosaic',
        'asymmetric',
        { title: 'City cuts', layout: 'immersive', caption: 'Looks from the current drop.', presentation: 'street' },
        { dataBindings: { products: 'newest', limit: 4 } }
      ),
      n(
        'products_01',
        'productGrid',
        'editorial',
        { title: 'Now live', layout: 'standardEditorial', presentation: 'street' },
        { design: { spacing: 'compact' }, dataBindings: { products: 'bestsellers', limit: 6, showQuickAdd: true } }
      ),
      n(
        'rail_01',
        'productRail',
        'horizontal',
        { title: 'Extras', presentation: 'street' },
        { dataBindings: { products: 'featured', limit: 8 } }
      ),
      n('testimonials_01', 'testimonials', 'editorial', {
        layout: 'quote',
        title: 'From the block',
        items: [
          { quote: 'Fit hits different. Keep the drops coming.', author: 'Mika', location: 'Berlin' },
          { quote: 'Finally streetwear that feels premium, not costume.', author: 'Noah', location: 'London' },
          { quote: 'Cargo pant silhouette is clean.', author: 'Jay', location: 'Bucharest' },
        ],
      }),
      n('footer_01', 'footer', 'minimal_commerce', {
        storeName: 'Northline',
        text: 'Ships EU-wide · Returns 14 days',
      })
    ),
    {
      'Visual hierarchy': 'Does neon/dark punch before merch?',
      Composition: 'Mosaic before dense grid — cultural then commercial?',
      Typography: 'Outfit heavy enough for street?',
      Spacing: 'Dense by design — not cramped by accident?',
      Imagery: 'Street flash vs soft lifestyle?',
      'Brand consistency': 'Dark + acid accent held?',
      'Product presentation': 'Dense grid still premium?',
      Mobile: 'Mosaic collapse intentional?',
      Originality: 'Clearly not Store A/B?',
      'Premium perception': 'Drop-page energy or cheap dark theme?',
    }
  ),

  makeStore(
    'forma_audio',
    'Store D — Electronics',
    'Forma Audio — high-end wireless headphones.',
    'minimal nav → product-focus hero → collection tiles → bestseller grid → accessories rail → review wall → minimal footer. Conversion-clear tech structure.',
    {
      version: 1,
      creativeMode: 'faithful',
      brand: {
        businessType: 'consumer electronics',
        audience: 'audiophiles and remote workers',
        positioning: 'precision tech',
        personality: ['precise', 'modern', 'trustworthy'],
        priceLevel: 'premium',
        language: 'en',
        storeName: 'Forma Audio',
      },
      designIntent: {
        coreConcept: 'Electronics storefront that sells confidence through clarity and categories.',
        emotionalGoal: 'Competence and excitement',
        visualHierarchy: 'Hero product → categories → grid → proof.',
        compositionPrinciples: ['Product clarity', 'Category tiles', 'Review density'],
        photographyDirection: 'Studio product on dark slate',
        typographyDirection: 'Technical sans, medium weight',
        interactionDirection: 'Quick-add friendly',
        premiumCharacteristics: ['Clean grids', 'Spec-forward'],
        avoidPatterns: ['Fashion magazine layouts'],
      },
      artDirection: {
        archetype: 'precision_tech',
        typography: { display: 'Manrope', body: 'Inter', scale: 'restrained' },
        colorStrategy: {
          primary: '#2563EB',
          background: '#F8FAFC',
          text: '#0F172A',
          accent: '#0EA5E9',
          secondary: '#E2E8F0',
        },
        photography: { style: 'studio product', treatment: 'dark slate', avoid: ['fashion'] },
        density: 'balanced',
        radius: 'soft',
        shadow: 'lift',
        motion: 'subtle',
      },
      ux: {
        primaryConversion: 'Find headphones fast',
        ctaStyle: 'solid',
        navStyle: 'solid minimal',
        discovery: 'collections then grid then reviews',
        mobileStrategy: 'Category first',
      },
      pageIntent: {
        homeNarrative: 'Categories → products → reviews.',
        mustHave: ['collections', 'product grid', 'reviews'],
        mustAvoid: ['full-bleed fashion hero'],
      },
    },
    nodes(
      n('nav_01', 'nav', 'minimal', { storeName: 'Forma Audio' }),
      n('hero_01', 'hero', 'product_focus', {
        title: 'Hear everything.',
        subtitle: 'High-end wireless headphones engineered for focus, travel, and long sessions.',
        cta: 'Shop headphones',
        kicker: 'Forma One',
        presentation: 'tech',
      }),
      n('collections_01', 'collections', 'tiles', { title: 'Shop by world', layout: 'editorial' }),
      n(
        'products_01',
        'productGrid',
        'editorial',
        { title: 'Best sellers', layout: 'featureFirst', presentation: 'tech' },
        { dataBindings: { products: 'bestsellers', limit: 6, showQuickAdd: true } }
      ),
      n(
        'rail_01',
        'productRail',
        'horizontal',
        { title: 'Accessories', presentation: 'tech' },
        { dataBindings: { products: 'newest', limit: 8 } }
      ),
      n('reviews_01', 'reviews', 'wall', { title: 'Verified listening notes' }),
      n('footer_01', 'footer', 'minimal_commerce', {
        storeName: 'Forma Audio',
        text: '2-year warranty · Fast EU shipping',
      })
    ),
    {
      'Visual hierarchy': 'Product → categories → grid clear?',
      Composition: 'Is this a commerce machine vs editorial magazine?',
      Typography: 'Technical sans appropriate?',
      Spacing: 'Balanced conversion density?',
      Imagery: 'Studio product clarity?',
      'Brand consistency': 'Cool steel / blue system?',
      'Product presentation': 'Quick-add grid vs luxury rail?',
      Mobile: 'Category tiles usable?',
      Originality: 'Different from fashion/food?',
      'Premium perception': 'Apple-adjacent or generic blue shop?',
    }
  ),

  makeStore(
    'maison_alba',
    'Store E — Artisan food',
    'Maison Alba — small-batch Mediterranean pantry.',
    'minimal nav → editorial hero → story → magazine mosaic → feature-first pantry → image quote → statement → newsletter → luxury footer. Narrative-first rhythm.',
    {
      version: 1,
      creativeMode: 'balanced',
      brand: {
        businessType: 'artisan food',
        audience: 'food lovers seeking provenance',
        positioning: 'crafted provenance',
        personality: ['warm', 'story-rich', 'artisanal'],
        priceLevel: 'premium',
        language: 'en',
        storeName: 'Maison Alba',
      },
      designIntent: {
        coreConcept: 'Editorial food house that leads with place and craft before the cart.',
        emotionalGoal: 'Warmth and appetite',
        visualHierarchy: 'Story → mosaic → products → voices → statement.',
        compositionPrinciples: ['Narrative first', 'Warm photography', 'Slow scroll'],
        photographyDirection: 'Natural light tablescapes',
        typographyDirection: 'Warm serif display',
        interactionDirection: 'Invite linger',
        premiumCharacteristics: ['Provenance storytelling'],
        avoidPatterns: ['Tech grids first'],
      },
      artDirection: {
        archetype: 'artisan_editorial',
        typography: { display: 'Fraunces', body: 'Nunito Sans', scale: 'expressive' },
        colorStrategy: {
          primary: '#6B3A2A',
          background: '#FBF6EF',
          text: '#2A1C16',
          accent: '#C47A3A',
          secondary: '#F0E4D4',
        },
        photography: { style: 'tablescape', treatment: 'natural warm', avoid: ['stock pantry'] },
        density: 'balanced',
        radius: 'soft',
        shadow: 'soft',
        motion: 'subtle',
      },
      ux: {
        primaryConversion: 'Discover the pantry',
        ctaStyle: 'pill warm',
        navStyle: 'editorial',
        discovery: 'story then mosaic then products',
        mobileStrategy: 'Story before shop',
      },
      pageIntent: {
        homeNarrative: 'Place and craft before merchandising.',
        mustHave: ['editorial split', 'mosaic', 'testimonials'],
        mustAvoid: ['electronics category tiles first'],
      },
    },
    nodes(
      n('nav_01', 'nav', 'minimal', { storeName: 'Maison Alba' }),
      n(
        'hero_01',
        'hero',
        'editorial_split',
        {
          kicker: 'From the grove',
          title: 'Food with a place of origin.',
          subtitle: 'Small-batch Mediterranean pantry for tables that linger.',
          cta: 'Browse the pantry',
          imageUrl: SHOWCASE_CATALOGS.maison_alba.heroImage,
        },
        { design: { spacing: 'airy' } }
      ),
      n(
        'story_01',
        'editorialSplit',
        'image_text',
        {
          title: 'Small batches. Named farms.',
          body: 'We work with growers who still harvest by hand — and tell you which grove each jar came from.',
          imageUrl: SHOWCASE_CATALOGS.maison_alba.storyImage,
        },
        { design: { spacing: 'dramatic' } }
      ),
      n(
        'mosaic_01',
        'editorialMosaic',
        'asymmetric',
        {
          title: 'Ingredients worth naming',
          layout: 'magazine',
          caption: 'Named farms. Small batches. Provenance first.',
          presentation: 'editorial',
        },
        { dataBindings: { products: 'featured', limit: 4 } }
      ),
      n(
        'products_01',
        'productGrid',
        'editorial',
        { title: 'The pantry', layout: 'featureFirst', presentation: 'editorial' },
        { dataBindings: { products: 'newest', limit: 6 } }
      ),
      n('testimonials_01', 'testimonials', 'editorial', {
        layout: 'imageQuote',
        imageUrl: SHOWCASE_CATALOGS.maison_alba.storyImage,
        items: [
          {
            quote: 'The olive oil tastes like a place, not a brand.',
            author: 'Elena R.',
            location: 'Lisbon',
          },
          { quote: 'Gifting that feels considered.', author: 'Tom H.', location: 'Milan' },
          { quote: 'Honey is floral without being sweet-sweet.', author: 'Ana B.', location: 'Athens' },
        ],
      }),
      n('statement_01', 'brandStatement', 'large_type', { statement: 'Taste is a geography.' }),
      n(
        'newsletter_01',
        'newsletter',
        'quiet',
        {
          layout: 'statement',
          title: 'Notes from the grove',
          text: 'Seasonal harvests, tasting notes, and tables that linger.',
        }
      ),
      n('footer_01', 'footer', 'editorial_luxury', {
        storeName: 'Maison Alba',
        blurb: 'Artisan foods with provenance.',
        text: 'Ships chilled where needed.',
      })
    ),
    {
      'Visual hierarchy': 'Story before shop?',
      Composition: 'Hero → story → mosaic → grid → voices → statement?',
      Typography: 'Fraunces warm enough?',
      Spacing: 'Linger-friendly dramatic gaps?',
      Imagery: 'Tablescape appetite?',
      'Brand consistency': 'Harvest warmth held?',
      'Product presentation': 'Grid after narrative — earned?',
      Mobile: 'Double editorial splits not exhausting?',
      Originality: 'Food editorial vs other stores?',
      'Premium perception': 'Maison vs grocery template?',
    }
  ),
];

/** Gallery entries: every composition, tagged for grouped review. */
export const COMPOSITION_GALLERY: Array<{
  group: string;
  type: string;
  variant: string;
  label: string;
  brandId: ShowcaseBrandId;
  node: SiteNode;
}> = [
  {
    group: 'Navigation',
    type: 'nav',
    variant: 'minimal',
    label: 'Minimal navigation',
    brandId: 'aurelia',
    node: n('g_nav_min', 'nav', 'minimal', { storeName: 'Aurelia' }),
  },
  {
    group: 'Navigation',
    type: 'nav',
    variant: 'transparent',
    label: 'Transparent / immersive navigation',
    brandId: 'atelier_no8',
    node: n('g_nav_tr', 'nav', 'transparent', { storeName: 'Atelier No. 8', tone: 'dark' }),
  },
  {
    group: 'Hero',
    type: 'hero',
    variant: 'editorial_split',
    label: 'Editorial split hero',
    brandId: 'maison_alba',
    node: n('g_hero_ed', 'hero', 'editorial_split', {
      kicker: 'From the grove',
      title: 'Food with a place of origin.',
      subtitle: 'Small-batch Mediterranean pantry for tables that linger.',
      cta: 'Browse the pantry',
      imageUrl: SHOWCASE_CATALOGS.maison_alba.heroImage,
    }),
  },
  {
    group: 'Hero',
    type: 'hero',
    variant: 'luxury_minimal',
    label: 'Luxury / minimal hero',
    brandId: 'atelier_no8',
    node: n(
      'g_hero_lux',
      'hero',
      'luxury_minimal',
      {
        title: 'Leather, quietly made.',
        subtitle: 'Handbags for women who prefer presence without noise.',
        cta: 'Enter the atelier',
        imageUrl: SHOWCASE_CATALOGS.atelier_no8.heroImage,
      },
      { design: { minHeight: '80vh' } }
    ),
  },
  {
    group: 'Hero',
    type: 'hero',
    variant: 'product_focus',
    label: 'Product-focused hero',
    brandId: 'forma_audio',
    node: n('g_hero_pf', 'hero', 'product_focus', {
      title: 'Hear everything.',
      subtitle: 'High-end wireless headphones engineered for focus and travel.',
      cta: 'Shop headphones',
    }),
  },
  {
    group: 'Products',
    type: 'productGrid',
    variant: 'editorial',
    label: 'Editorial product grid',
    brandId: 'aurelia',
    node: n(
      'g_grid',
      'productGrid',
      'editorial',
      { title: 'The line', layout: 'featureFirst', presentation: 'tech' },
      { dataBindings: { products: 'featured', limit: 6, showQuickAdd: true } }
    ),
  },
  {
    group: 'Products',
    type: 'productRail',
    variant: 'horizontal',
    label: 'Horizontal product rail',
    brandId: 'atelier_no8',
    node: n(
      'g_rail',
      'productRail',
      'horizontal',
      { title: 'The collection', presentation: 'luxury' },
      { dataBindings: { products: 'newest', limit: 8 } }
    ),
  },
  {
    group: 'Products',
    type: 'productSpotlight',
    variant: 'feature',
    label: 'Product spotlight',
    brandId: 'atelier_no8',
    node: n(
      'g_spot',
      'productSpotlight',
      'feature',
      {
        title: 'The Milano Day Bag',
        body: 'Vegetable-tanned calfskin. Hand-finished seams.',
        cta: 'View the piece',
        presentation: 'luxury',
      },
      { dataBindings: { products: 'featured', limit: 1 } }
    ),
  },
  {
    group: 'Story',
    type: 'editorialSplit',
    variant: 'image_text',
    label: 'Editorial image / text',
    brandId: 'maison_alba',
    node: n('g_story', 'editorialSplit', 'image_text', {
      title: 'Small batches. Named farms.',
      body: 'We work with growers who still harvest by hand — and tell you which grove each jar came from.',
      imageUrl: SHOWCASE_CATALOGS.maison_alba.storyImage,
    }, { design: { spacing: 'dramatic' } }),
  },
  {
    group: 'Story',
    type: 'brandStatement',
    variant: 'large_type',
    label: 'Large brand statement',
    brandId: 'atelier_no8',
    node: n('g_stmt', 'brandStatement', 'large_type', {
      statement: 'Understated luxury is a discipline, not a discount.',
    }),
  },
  {
    group: 'Story',
    type: 'editorialMosaic',
    variant: 'asymmetric',
    label: 'Editorial mosaic',
    brandId: 'northline',
    node: n(
      'g_mosaic',
      'editorialMosaic',
      'asymmetric',
      { title: 'City cuts', layout: 'magazine', caption: 'Looks from the current drop.' },
      { dataBindings: { products: 'newest', limit: 4 } }
    ),
  },
  {
    group: 'Proof',
    type: 'testimonials',
    variant: 'editorial',
    label: 'Editorial testimonials',
    brandId: 'maison_alba',
    node: n('g_test', 'testimonials', 'editorial', {
      layout: 'quote',
      items: [
        { quote: 'The olive oil tastes like a place, not a brand.', author: 'Elena R.', location: 'Lisbon' },
        { quote: 'Gifting that feels considered.', author: 'Tom H.', location: 'Milan' },
      ],
    }),
  },
  {
    group: 'Proof',
    type: 'reviews',
    variant: 'wall',
    label: 'Review presentation',
    brandId: 'forma_audio',
    node: n('g_rev', 'reviews', 'wall', { title: 'Verified listening notes' }),
  },
  {
    group: 'Footer',
    type: 'footer',
    variant: 'minimal_commerce',
    label: 'Minimal commerce footer',
    brandId: 'forma_audio',
    node: n('g_foot_min', 'footer', 'minimal_commerce', {
      storeName: 'Forma Audio',
      text: '2-year warranty · Fast EU shipping',
    }),
  },
  {
    group: 'Footer',
    type: 'footer',
    variant: 'editorial_luxury',
    label: 'Editorial / luxury footer',
    brandId: 'atelier_no8',
    node: n('g_foot_lux', 'footer', 'editorial_luxury', {
      storeName: 'Atelier No. 8',
      blurb: 'Milan · Florence',
      text: 'Private appointments on request.',
    }),
  },
  {
    group: 'Extra',
    type: 'newsletter',
    variant: 'quiet',
    label: 'Quiet newsletter',
    brandId: 'atelier_no8',
    node: n('g_news', 'newsletter', 'quiet', {
      layout: 'statement',
      title: 'Stay in the know',
      text: 'Occasional notes on new collections, craft and the world around us.',
    }),
  },
  {
    group: 'Extra',
    type: 'announcement',
    variant: 'slim',
    label: 'Slim announcement',
    brandId: 'aurelia',
    node: n('g_ann', 'announcement', 'slim', {
      text: 'Free shipping over €60 · Dermatologist tested',
    }),
  },
  {
    group: 'Extra',
    type: 'collections',
    variant: 'tiles',
    label: 'Collection tiles',
    brandId: 'forma_audio',
    node: n('g_col', 'collections', 'tiles', { title: 'Shop by world', layout: 'editorial' }),
  },
];
