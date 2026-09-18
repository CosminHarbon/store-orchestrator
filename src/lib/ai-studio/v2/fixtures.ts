import type { DesignSpec } from '@/lib/ai-studio/v2/designSpec';
import { brandDesignSystemFromSpec, designSpecSchema, ensureCreativeStrategy } from '@/lib/ai-studio/v2/designSpec';
import { siteDocumentSchema, type SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import {
  applyStrategyDefaults,
  applyLayoutDefaults,
  normalizeDesignSemanticsForNodes,
  type StrategyNode,
  type LayoutDefaultNode,
} from '@shared/ai-studio-v2/strategyDefaults';

type Fixture = {
  id: string;
  brief: string;
  designSpec: DesignSpec;
  document: SiteDocument;
};

function build(
  id: string,
  brief: string,
  specInput: Parameters<typeof designSpecSchema.parse>[0],
  nodes: SiteDocument['pages']['home']['nodes']
): Fixture {
  const designSpec = designSpecSchema.parse(specInput);
  const brand = brandDesignSystemFromSpec(designSpec);
  // These fixtures are hand-authored SiteNodes (the same shape the architect LLM would
  // produce), so — exactly like the real generation pipeline (see aiStudioV2.ts) — they
  // must go through applyStrategyDefaults/normalizeDesignSemantics too. Without this, only
  // each node's own hand-set `design.spacing` ever reached the renderer; every OTHER
  // strategy-driven knob (rhythm on unset spacing, emphasis from typographyRole, alignment
  // from asymmetry, measure/fullBleed from imageryRole) stayed permanently unset on these
  // static QA fixtures even though the exact same mechanism is fully wired and tested for
  // real generation output — which is why Phase 3's typography/density grammar looked
  // inert here. This only ever fills fields the fixture left unset; every hand-authored
  // value above still wins.
  const strategy = ensureCreativeStrategy(designSpec);
  const defaulted = applyStrategyDefaults(nodes as unknown as StrategyNode[], strategy) as unknown as typeof nodes;
  // Phase 4A/4B/4C/4D — same fill-only-if-unset contract as applyStrategyDefaults above,
  // but for content.layout (editorialSplit, productSpotlight, brandStatement, newsletter,
  // collections, testimonials, reviews — see strategyDefaults.ts's LAYOUT_DEFAULT_RESOLVERS).
  // Runs on these hand-authored fixtures for the same reason applyStrategyDefaults does:
  // without it, only the layout the fixture itself hand-sets ever reaches the renderer.
  const layoutDefaulted = applyLayoutDefaults(defaulted as unknown as LayoutDefaultNode[], strategy) as unknown as typeof defaulted;
  const normalizedNodes = normalizeDesignSemanticsForNodes(layoutDefaulted as unknown as Parameters<typeof normalizeDesignSemanticsForNodes>[0]) as unknown as typeof nodes;
  const document = siteDocumentSchema.parse({
    version: 2,
    siteId: id,
    designSystemId: brand.archetype.replace(/\W+/g, '_').toLowerCase(),
    pages: { home: { id: 'home', type: 'home', nodes: normalizedNodes } },
    meta: {
      language: designSpec.brand.language,
      niche: designSpec.brand.businessType,
      updatedAt: new Date().toISOString(),
    },
  });
  return { id, brief, designSpec, document };
}

/** Five variety briefs — must not share section order / hero / density / nav. */
export const V2_VARIETY_FIXTURES: Fixture[] = [
  build(
    'luxury_fashion',
    'Premium Italian leather handbags for women who prefer understated luxury.',
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
        storeName: 'Villa Pelle',
      },
      designIntent: {
        coreConcept:
          'Create an understated luxury experience that feels closer to an editorial fashion magazine than a traditional ecommerce store.',
        emotionalGoal: 'Quiet confidence and intimacy',
        visualHierarchy: 'Large type statement, then slow merchandising, then craft story.',
        compositionPrinciples: ['Sparse layout', 'Hero as atmosphere', 'Products as objects of desire'],
        photographyDirection: 'Soft daylight leather stills, negative space',
        typographyDirection: 'Serif display with airy tracking; restrained body',
        interactionDirection: 'Almost no chrome; soft fades',
        premiumCharacteristics: ['Whitespace', 'Material honesty', 'Few products on screen'],
        avoidPatterns: ['Busy grids', 'Neon CTAs', 'Generic feature icons'],
      },
      artDirection: {
        archetype: 'quiet_luxury_editorial',
        // Phase 3 effectiveness fix: this fixture predates typographyScale entirely and
        // was left at the schema default ('expressive') by accident — a "quiet luxury
        // editorial" brand whose own designIntent above says "presence without noise" is
        // the textbook 'restrained' case, not 'expressive'.
        typography: { display: 'Cormorant Garamond', body: 'Manrope', scale: 'restrained' },
        colorStrategy: {
          primary: '#2C2420',
          background: '#F7F3EE',
          text: '#1A1614',
          accent: '#8A6A4F',
          secondary: '#EDE6DC',
          mood: 'warm stone',
        },
        photography: { style: 'still-life leather', treatment: 'soft daylight', avoid: ['stock models'] },
        density: 'sparse',
        radius: 'sharp',
        shadow: 'none',
        motion: 'subtle',
      },
      ux: {
        primaryConversion: 'Browse curated handbags',
        ctaStyle: 'outline quiet',
        navStyle: 'transparent immersive',
        discovery: 'spotlight then rail',
        mobileStrategy: 'Full-bleed hero then stacked editorial',
      },
      pageIntent: {
        homeNarrative: 'Enter a calm atelier; discover bags as crafted objects.',
        mustHave: ['immersive hero', 'statement', 'spotlight'],
        mustAvoid: ['dense product dump'],
      },
      // Explicit (was previously left to inferCreativeStrategy's archetype-regex fallback) so
      // this static QA fixture actually exercises the same strategy-driven grammar (rhythm,
      // emphasis, alignment, measure/fullBleed via applyStrategyDefaults in build() below)
      // that production documents get, instead of only its own hand-set spacing values.
      creativeStrategy: {
        pageComposition: 'editorial_journey',
        narrativeModel: 'editorial',
        heroPhilosophy: 'atmosphere_first',
        commerceEntry: 'delayed',
        commerceModel: 'single_artifact',
        rhythm: 'sparse_pause',
        density: 'low',
        asymmetry: 'medium',
        typographyRole: 'quiet',
        imageryRole: 'dominant',
        navigationBehavior: 'quiet_overlay',
        experimentationLevel: 'medium',
        distinctivenessBrief:
          'Avoid a generic hero-manifesto-grid spine; let one full-bleed image carry the opening beat and keep every label whisper-quiet.',
      },
    },
    [
      { id: 'nav_01', type: 'nav', variant: 'transparent', visible: true, content: { storeName: 'Villa Pelle' }, design: {}, responsive: {} },
      {
        id: 'hero_01',
        type: 'hero',
        variant: 'luxury_minimal',
        visible: true,
        content: {
          title: 'Leather, quietly made.',
          subtitle: 'Handbags for women who prefer presence without noise.',
          cta: 'Enter the atelier',
          kicker: 'Villa Pelle — Est. Florence',
          layout: 'cinematic',
        },
        design: { minHeight: '100vh', spacing: 'dramatic' },
        responsive: { mobile: { minHeight: '80vh' } },
      },
      {
        id: 'statement_01',
        type: 'brandStatement',
        variant: 'large_type',
        visible: true,
        content: { statement: 'Understated luxury is a discipline, not a discount.' },
        design: { spacing: 'dramatic' },
        responsive: {},
      },
      {
        id: 'spotlight_01',
        type: 'productSpotlight',
        variant: 'feature',
        visible: true,
        content: { title: 'The Milano Day Bag', body: 'Vegetable-tanned hide. Hand-finished seams.' },
        design: {},
        responsive: {},
        dataBindings: { products: 'featured', limit: 1 },
      },
      {
        id: 'story_01',
        type: 'editorialSplit',
        variant: 'image_text',
        visible: true,
        content: {
          title: 'Florentine ateliers',
          body: 'Each piece is cut in small batches by partners we have known for a decade.',
        },
        design: { spacing: 'dramatic' },
        responsive: {},
      },
      {
        id: 'products_01',
        type: 'productRail',
        variant: 'horizontal',
        visible: true,
        content: { title: 'The collection', layout: 'alternatingOversized' },
        design: {},
        responsive: {},
        dataBindings: { products: 'newest', limit: 8 },
      },
      {
        id: 'newsletter_01',
        type: 'newsletter',
        variant: 'quiet',
        visible: true,
        content: { text: 'Private notes on new leather drops.' },
        design: {},
        responsive: {},
      },
      {
        id: 'footer_01',
        type: 'footer',
        variant: 'editorial_luxury',
        visible: true,
        content: { storeName: 'Villa Pelle', blurb: 'Milan · Florence', text: '© Villa Pelle' },
        design: {},
        responsive: {},
      },
    ]
  ),

  build(
    'modern_skincare',
    'Premium minimalist skincare brand for professionals aged 25–45.',
    {
      version: 1,
      creativeMode: 'balanced',
      brand: {
        businessType: 'skincare',
        audience: 'professionals 25–45',
        positioning: 'clinical minimal',
        personality: ['clean', 'precise', 'calm'],
        priceLevel: 'premium',
        language: 'en',
        storeName: 'Lumen Lab',
      },
      designIntent: {
        coreConcept: 'A clinical-minimal skincare house that feels like a design studio, not a spa brochure.',
        emotionalGoal: 'Clarity and trust',
        visualHierarchy: 'Product first, benefits second, proof third.',
        compositionPrinciples: ['Product hero', 'Benefit editorial', 'Airy grids'],
        photographyDirection: 'Macro textures, cool light, glass bottles',
        typographyDirection: 'Geometric sans throughout; tight hierarchy',
        interactionDirection: 'Crisp hover states, no drama',
        premiumCharacteristics: ['White space', 'Precision type', 'Honest formulas'],
        avoidPatterns: ['Pink spa clichés', 'Too many testimonials upfront'],
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
          mood: 'cool mint',
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
      // Explicit creativeStrategy (see Villa Pelle above for why) — rhythm is deliberately
      // 'long_short_long' here (5 rhythm-eligible sections is enough beats to actually show
      // the fixed 3-tier cycle) instead of matching what plain inference would give ('even').
      creativeStrategy: {
        pageComposition: 'editorial_journey',
        narrativeModel: 'editorial',
        heroPhilosophy: 'atmosphere_first',
        commerceEntry: 'mid',
        commerceModel: 'flagship_then_rail',
        rhythm: 'long_short_long',
        density: 'medium',
        asymmetry: 'low',
        typographyRole: 'balanced',
        imageryRole: 'balanced',
        navigationBehavior: 'solid_compact',
        experimentationLevel: 'medium',
        distinctivenessBrief:
          'Avoid a flat, static clinical grid; let one deliberate pause interrupt an otherwise calm, controlled rhythm.',
      },
    },
    [
      { id: 'nav_01', type: 'nav', variant: 'minimal', visible: true, content: { storeName: 'Lumen Lab' }, design: {}, responsive: {} },
      { id: 'announcement_01', type: 'announcement', variant: 'slim', visible: true, content: { text: 'Free shipping over €60' }, design: {}, responsive: {} },
      {
        id: 'hero_01',
        type: 'hero',
        variant: 'product_focus',
        visible: true,
        content: {
          title: 'Skin, clarified.',
          subtitle: 'Minimalist formulas for professionals who want results without ritual theater.',
          cta: 'Shop the serum',
        },
        design: { spacing: 'airy' },
        responsive: {},
      },
      {
        id: 'spotlight_01',
        type: 'productSpotlight',
        variant: 'feature',
        visible: true,
        content: { title: 'Daily Clarity Serum', body: 'Niacinamide + peptides. Fragrance-free.' },
        design: {},
        responsive: {},
        dataBindings: { products: 'bestsellers', limit: 1 },
      },
      {
        id: 'story_01',
        type: 'editorialSplit',
        variant: 'image_text',
        visible: true,
        content: {
          title: 'Fewer steps. Better skin.',
          body: 'We design for mornings that start at 6:40 — not 12-step routines.',
        },
        design: {},
        responsive: {},
      },
      {
        id: 'products_01',
        type: 'productGrid',
        // New composition (Part D/E): oversized full-bleed imagery, minimal chrome — a
        // structurally different silhouette from 'editorial', fitting for a minimalist brand.
        variant: 'luxury_image_first',
        visible: true,
        content: { title: 'The line' },
        design: {},
        responsive: {},
        dataBindings: { products: 'featured', limit: 4 },
      },
      {
        id: 'reviews_01',
        type: 'reviews',
        variant: 'wall',
        visible: true,
        content: { title: 'What people notice', layout: 'grid' },
        design: {},
        responsive: {},
      },
      {
        id: 'newsletter_01',
        type: 'newsletter',
        variant: 'quiet',
        visible: true,
        // No content.layout set — exercises Phase 4C's strategy-driven default. This
        // brand's typographyRole is 'balanced', so applyLayoutDefaults should resolve
        // 'split' (copy and form in distinct regions), not the centered 'statement' shape.
        content: { title: 'The routine, in your inbox', text: 'New formulas and restock notes, twice a month.' },
        design: {},
        responsive: {},
      },
      {
        id: 'footer_01',
        type: 'footer',
        variant: 'minimal_commerce',
        visible: true,
        content: { storeName: 'Lumen Lab', text: 'Dermatologist-tested · EU shipping' },
        design: {},
        responsive: {},
      },
    ]
  ),

  build(
    'streetwear',
    'Premium oversized streetwear for young customers, bold and urban.',
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
        storeName: 'BLOCK FORM',
      },
      designIntent: {
        coreConcept: 'A graphic street storefront that feels like a night market and a drop page.',
        emotionalGoal: 'Energy and belonging',
        visualHierarchy: 'Hero punch, mosaic culture, dense product grid.',
        compositionPrinciples: ['High contrast', 'Asymmetric mosaic', 'Dense merch'],
        photographyDirection: 'Harsh flash, concrete, oversized fits',
        typographyDirection: 'Heavy display sans, tight packing',
        interactionDirection: 'Snappy, high-motion rail',
        premiumCharacteristics: ['Bold type', 'Cultural collage', 'Drop energy'],
        avoidPatterns: ['Quiet luxury beige', 'Sparse editorial'],
      },
      artDirection: {
        archetype: 'urban_drop',
        typography: { display: 'Outfit', body: 'Inter', scale: 'expressive' },
        colorStrategy: {
          primary: '#111111',
          background: '#0A0A0A',
          text: '#F5F5F5',
          accent: '#E8FF47',
          secondary: '#1A1A1A',
          mood: 'night neon',
        },
        photography: { style: 'flash street', treatment: 'high contrast', avoid: ['pastel lifestyle'] },
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
        homeNarrative: 'Drop energy → culture mosaic → sell-out grid → voices.',
        mustHave: ['mosaic', 'dense products'],
        mustAvoid: ['luxury serif hero'],
      },
      // Explicit creativeStrategy (see Villa Pelle above for why).
      creativeStrategy: {
        pageComposition: 'dense_campaign',
        narrativeModel: 'campaign',
        heroPhilosophy: 'typography_first',
        commerceEntry: 'early',
        commerceModel: 'dense_catalogue',
        rhythm: 'rapid_contrast',
        density: 'high',
        asymmetry: 'high',
        typographyRole: 'dominant_structural',
        imageryRole: 'dominant',
        navigationBehavior: 'bold_campaign',
        experimentationLevel: 'medium',
        distinctivenessBrief:
          'Avoid a quiet editorial pace; alternate tight and dramatic beats and let type carry as much weight as the photography.',
      },
    },
    [
      { id: 'nav_01', type: 'nav', variant: 'minimal', visible: true, content: { storeName: 'BLOCK FORM' }, design: {}, responsive: {} },
      {
        id: 'hero_01',
        type: 'hero',
        variant: 'editorial_split',
        visible: true,
        content: {
          kicker: 'Drop 09',
          title: 'Oversized. Loud. Yours.',
          subtitle: 'Premium streetwear cut for city nights.',
          cta: 'Shop the drop',
          layout: 'asymmetric',
        },
        design: { spacing: 'compact' },
        responsive: {},
      },
      {
        id: 'statement_01',
        type: 'brandStatement',
        variant: 'large_type',
        visible: true,
        // No content.layout set — exercises Phase 4B's strategy-driven default. This
        // brand's typographyRole is 'dominant_structural', so applyLayoutDefaults should
        // resolve 'anchoredLarge' (breaks outside the content canvas), not 'centered'.
        content: { statement: 'No quiet drops. No small talk.' },
        design: {},
        responsive: {},
      },
      {
        id: 'spotlight_01',
        type: 'productSpotlight',
        variant: 'feature',
        visible: true,
        // No content.layout set — exercises Phase 4B's strategy-driven default. Same
        // typographyRole as above, so applyLayoutDefaults should resolve
        // 'structuredFeature' (copy leads in ratio and DOM order), not the plain 'feature' split.
        content: { title: 'The anchor piece', body: 'One silhouette, every drop. This is the one that started it.' },
        design: {},
        responsive: {},
        dataBindings: { products: 'featured', limit: 1 },
      },
      {
        id: 'mosaic_01',
        type: 'editorialMosaic',
        variant: 'asymmetric',
        visible: true,
        content: { title: 'City cuts' },
        design: {},
        responsive: {},
        dataBindings: { products: 'newest', limit: 4 },
      },
      {
        id: 'story_01',
        type: 'editorialSplit',
        variant: 'image_text',
        visible: true,
        // No content.layout set — exercises Phase 4A's strategy-driven default. This
        // brand's typographyRole is 'dominant_structural' (see creativeStrategy above),
        // so applyLayoutDefaults should resolve 'overlayStatement', not the plain split.
        content: {
          title: 'Made for the block, not the runway.',
          body: 'Cut oversized, printed loud. Every drop is small-batch and gone in days.',
        },
        design: {},
        responsive: {},
      },
      {
        id: 'products_01',
        type: 'productGrid',
        variant: 'editorial',
        visible: true,
        // "dense product grid" is the design intent's own stated discovery pattern above.
        content: { title: 'Now live', layout: 'dense' },
        design: { spacing: 'compact' },
        responsive: {},
        dataBindings: { products: 'bestsellers', limit: 12 },
      },
      {
        id: 'rail_01',
        type: 'productRail',
        variant: 'horizontal',
        visible: true,
        content: { title: 'Extras' },
        design: {},
        responsive: {},
        dataBindings: { products: 'featured', limit: 10 },
      },
      {
        id: 'collections_01',
        type: 'collections',
        variant: 'tiles',
        visible: true,
        // No content.layout set — exercises Phase 4D's strategy-driven default. This
        // brand's asymmetry is 'high', so applyLayoutDefaults should resolve 'stacked'
        // (alternating rows), not the plain 'editorial' grid. imageryRole:'dominant' also
        // makes the whole block full-bleed edge-to-edge (see IMAGE_LED_TYPES), and
        // density:'high' tightens the tile gap.
        content: { title: 'Shop by drop' },
        design: {},
        responsive: {},
      },
      {
        id: 'testimonials_01',
        type: 'testimonials',
        variant: 'editorial',
        visible: true,
        content: {
          title: 'From the block',
          items: [
            { quote: 'Fit hits different. Keep the drops coming.', author: 'Mika' },
            { quote: 'Finally streetwear that feels premium, not costume.', author: 'Noah' },
          ],
        },
        design: {},
        responsive: {},
      },
      {
        id: 'newsletter_01',
        type: 'newsletter',
        variant: 'quiet',
        visible: true,
        // No content.layout set — exercises Phase 4C's strategy-driven default. This
        // brand's typographyRole is 'dominant_structural', so applyLayoutDefaults should
        // resolve 'campaign' (assertive, bordered band), not the centered 'statement' shape.
        content: { title: 'First to know. First to cop.', text: 'Drop alerts only. No filler.' },
        design: {},
        responsive: {},
      },
      {
        id: 'footer_01',
        type: 'footer',
        variant: 'minimal_commerce',
        visible: true,
        content: { storeName: 'BLOCK FORM', text: 'Ships EU-wide · Returns 14 days' },
        design: {},
        responsive: {},
      },
    ]
  ),

  build(
    'electronics',
    'Modern consumer electronics store focused on premium headphones and accessories.',
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
        storeName: 'Auric',
      },
      designIntent: {
        coreConcept: 'A modern electronics storefront that sells confidence through clarity and comparison.',
        emotionalGoal: 'Competence and excitement',
        visualHierarchy: 'Hero tech → categories → grid → social proof.',
        compositionPrinciples: ['Product clarity', 'Category tiles', 'Review density'],
        photographyDirection: 'Studio product shots on dark slate',
        typographyDirection: 'Technical sans, medium weight',
        interactionDirection: 'Crisp; quick-add friendly',
        premiumCharacteristics: ['Clean grids', 'Spec-forward copy', 'Trust signals'],
        avoidPatterns: ['Fashion magazine layouts', 'Sparse luxury'],
      },
      artDirection: {
        archetype: 'precision_tech',
        // Phase 3 effectiveness fix: was 'restrained', identical to Lumen Lab, leaving the
        // 5-fixture QA set with only one scale value represented among these two "calm"
        // categories. A confident, bold display headline ("sells confidence through
        // clarity") is equally plausible for a tech brand — use it here so 'expressive' and
        // 'restrained' are both represented among the four named QA fixtures.
        typography: { display: 'Manrope', body: 'Inter', scale: 'expressive' },
        colorStrategy: {
          primary: '#2563EB',
          background: '#F8FAFC',
          text: '#0F172A',
          accent: '#0EA5E9',
          secondary: '#E2E8F0',
          mood: 'cool steel',
        },
        photography: { style: 'studio product', treatment: 'dark slate', avoid: ['lifestyle fashion'] },
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
        homeNarrative: 'Categories → products → reviews; maximize conversion clarity.',
        mustHave: ['collections', 'product grid', 'reviews'],
        mustAvoid: ['full-bleed fashion hero'],
      },
      // Explicit creativeStrategy (see Villa Pelle above for why).
      creativeStrategy: {
        pageComposition: 'technical_story',
        narrativeModel: 'product_journey',
        heroPhilosophy: 'product_as_artifact',
        commerceEntry: 'immediate',
        commerceModel: 'spec_story',
        rhythm: 'even',
        density: 'medium',
        asymmetry: 'low',
        typographyRole: 'balanced',
        imageryRole: 'supporting',
        navigationBehavior: 'solid_compact',
        experimentationLevel: 'medium',
        distinctivenessBrief:
          'Avoid decorative type; keep a controlled, scannable rhythm so display headlines and spec/commerce type feel like one system.',
      },
    },
    [
      { id: 'nav_01', type: 'nav', variant: 'minimal', visible: true, content: { storeName: 'Auric' }, design: {}, responsive: {} },
      {
        id: 'hero_01',
        type: 'hero',
        variant: 'product_focus',
        visible: true,
        content: {
          title: 'Hear everything.',
          subtitle: 'Premium headphones and accessories engineered for focus and travel.',
          cta: 'Shop headphones',
          layout: 'stacked',
        },
        design: {},
        responsive: {},
      },
      {
        id: 'collections_01',
        type: 'collections',
        variant: 'tiles',
        visible: true,
        content: { title: 'Shop by category', layout: 'stacked' },
        design: {},
        responsive: {},
      },
      {
        id: 'products_01',
        type: 'productGrid',
        variant: 'editorial',
        visible: true,
        content: { title: 'Best sellers', layout: 'asymmetricFeature' },
        design: {},
        responsive: {},
        dataBindings: { products: 'bestsellers', limit: 8, showQuickAdd: true },
      },
      {
        id: 'rail_01',
        type: 'productRail',
        variant: 'horizontal',
        visible: true,
        content: { title: 'Accessories' },
        design: {},
        responsive: {},
        dataBindings: { products: 'newest', limit: 10 },
      },
      {
        id: 'reviews_01',
        type: 'reviews',
        variant: 'wall',
        visible: true,
        // No content.layout set — exercises Phase 4D's strategy-driven default. Auric's
        // density is 'medium', so this resolves to 'index' (the lead-review hierarchy
        // treatment), not 'grid'. Lumen Lab's OWN reviews_01 already has an explicit,
        // pre-existing `layout: 'grid'` (predates Phase 4D — see git blame), so between
        // the two fixtures both reviews layouts are genuinely exercised: Lumen Lab='grid',
        // Auric='index'. An earlier pass here explicitly set 'grid' on Auric too, which
        // was wrong: it left 'index' - the layout with the new lead-review hierarchy work -
        // with zero live fixture coverage. Title no longer claims "verified" - Phase 4D
        // removed the system's own fabricated verified-customer label; this fixture's own
        // copy shouldn't contradict that fix.
        content: { title: 'What listeners say' },
        design: {},
        responsive: {},
      },
      {
        id: 'footer_01',
        type: 'footer',
        variant: 'minimal_commerce',
        visible: true,
        content: { storeName: 'Auric', text: '2-year warranty · Fast EU shipping' },
        design: {},
        responsive: {},
      },
    ]
  ),

  build(
    'artisan_food',
    'High-end artisan food brand selling premium products online.',
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
        storeName: 'Hearth & Grove',
      },
      designIntent: {
        coreConcept: 'An editorial food house that leads with place and craft before the cart.',
        emotionalGoal: 'Warmth and appetite',
        visualHierarchy: 'Story → mosaic ingredients → products → voices.',
        compositionPrinciples: ['Narrative first', 'Warm photography', 'Editorial footer'],
        photographyDirection: 'Natural light tablescapes, hands at work',
        typographyDirection: 'Warm serif display with soft sans body',
        interactionDirection: 'Gentle; invite linger',
        premiumCharacteristics: ['Provenance storytelling', 'Warm palette', 'Slow scroll'],
        avoidPatterns: ['Tech grids', 'Dark neon', 'Hard-sell hero'],
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
          mood: 'harvest warm',
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
        homeNarrative: 'Place and craft before merchandising density.',
        mustHave: ['editorial split', 'mosaic', 'testimonials'],
        mustAvoid: ['electronics-style category tiles first'],
      },
      // Explicit creativeStrategy (see Villa Pelle above for why).
      creativeStrategy: {
        pageComposition: 'editorial_journey',
        narrativeModel: 'editorial',
        heroPhilosophy: 'atmosphere_first',
        commerceEntry: 'mid',
        commerceModel: 'flagship_then_rail',
        rhythm: 'even',
        density: 'medium',
        asymmetry: 'medium',
        typographyRole: 'quiet',
        imageryRole: 'balanced',
        navigationBehavior: 'minimal_chrome',
        experimentationLevel: 'medium',
        distinctivenessBrief:
          'Avoid a generic feature-trio story; keep an even, unhurried pace true to the provenance narrative.',
      },
    },
    [
      { id: 'nav_01', type: 'nav', variant: 'minimal', visible: true, content: { storeName: 'Hearth & Grove' }, design: {}, responsive: {} },
      {
        id: 'hero_01',
        type: 'hero',
        variant: 'editorial_split',
        visible: true,
        content: {
          kicker: 'From the grove',
          title: 'Food with a place of origin.',
          subtitle: 'High-end artisan goods for tables that linger.',
          cta: 'Browse the pantry',
        },
        design: { spacing: 'airy' },
        responsive: {},
      },
      {
        id: 'story_01',
        type: 'editorialSplit',
        variant: 'image_text',
        visible: true,
        content: {
          title: 'Small batches. Named farms.',
          body: 'We work with growers who still harvest by hand — and tell you which grove each jar came from.',
        },
        design: { spacing: 'dramatic' },
        responsive: {},
      },
      {
        id: 'mosaic_01',
        type: 'editorialMosaic',
        variant: 'asymmetric',
        visible: true,
        content: { title: 'Ingredients worth naming' },
        design: {},
        responsive: {},
        dataBindings: { products: 'featured', limit: 4 },
      },
      {
        id: 'products_01',
        type: 'productGrid',
        variant: 'editorial',
        visible: true,
        // Explicit 'standardEditorial' (was unset, which silently defaults to
        // 'featureFirst'): none of the 5 QA fixtures previously rendered the plain
        // .ai-v2-merch-grid — every other fixture's productGrid either uses a different
        // composition (luxury_image_first) or a layout branch (asymmetricFeature, dense)
        // that renders a different container, so the density-driven --ai-v2-grid-gap
        // token had zero fixture coverage. This exercises it at density='balanced'.
        content: { title: 'The pantry', layout: 'standardEditorial' },
        design: {},
        responsive: {},
        dataBindings: { products: 'newest', limit: 8 },
      },
      {
        id: 'testimonials_01',
        type: 'testimonials',
        variant: 'editorial',
        visible: true,
        content: {
          title: 'From our tables',
          items: [
            { quote: 'The olive oil tastes like a place, not a brand.', author: 'Elena R.' },
            { quote: 'Gifting that feels considered.', author: 'Tom H.' },
          ],
        },
        design: {},
        responsive: {},
      },
      {
        id: 'statement_01',
        type: 'brandStatement',
        variant: 'large_type',
        visible: true,
        content: { statement: 'Taste is a geography.' },
        design: {},
        responsive: {},
      },
      {
        id: 'footer_01',
        type: 'footer',
        variant: 'editorial_luxury',
        visible: true,
        content: {
          storeName: 'Hearth & Grove',
          blurb: 'Artisan foods with provenance.',
          text: 'Ships chilled where needed.',
        },
        design: {},
        responsive: {},
      },
    ]
  ),
];

export function varietyFingerprint(doc: SiteDocument) {
  const nodes = doc.pages.home.nodes.filter((n) => n.visible !== false);
  return {
    order: nodes.map((n) => n.type).join('>'),
    hero: nodes.find((n) => n.type === 'hero')?.variant,
    nav: nodes.find((n) => n.type === 'nav')?.variant,
    product: nodes.find((n) => n.type.startsWith('product'))?.type + ':' + nodes.find((n) => n.type.startsWith('product'))?.variant,
  };
}

/**
 * A second, deliberately more granular fingerprint for the expressiveness-foundation
 * phase. `varietyFingerprint` predates content.layout/design knobs/responsive overrides
 * entirely (hero/nav/product variant + section order only) and other code may already
 * depend on that exact shape — this is additive, not a replacement.
 *
 * Captures every renderer-relevant structural instruction per visible node: type,
 * variant, content.layout, the design knobs that actually change layout (not copy), and
 * a mobile override summary. Two documents with the same fingerprint are guaranteed to
 * hand the renderer identical structural instructions; this is a proxy for "the renderer
 * was told to do something different," not a claim about pixels — it does not replace
 * visual QA (no screenshots, no DOM, no layout math).
 */
export function expressivenessFingerprint(doc: SiteDocument) {
  return doc.pages.home.nodes
    .filter((n) => n.visible !== false)
    .map((n) => ({
      type: n.type,
      variant: n.variant,
      layout: typeof n.content?.layout === 'string' ? n.content.layout : null,
      design: {
        spacing: n.design?.spacing ?? null,
        alignment: n.design?.alignment ?? null,
        emphasis: n.design?.emphasis ?? null,
        measure: n.design?.measure ?? null,
        fullBleed: n.design?.fullBleed ?? null,
        minHeight: n.design?.minHeight ?? null,
      },
      mobile: n.responsive?.mobile
        ? {
            variant: n.responsive.mobile.variant ?? null,
            hide: n.responsive.mobile.hide ?? null,
            spacing: n.responsive.mobile.spacing ?? null,
            minHeight: n.responsive.mobile.minHeight ?? null,
          }
        : null,
    }));
}
