import { COMPOSITION_TYPES } from '@/lib/ai-studio/v2/siteTree';
import type { SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import type { CreativeStrategy } from '@shared/ai-studio-v2/creativeStrategy';
import {
  LAYOUT_GRAMMAR_IDS,
  type ChapterKind,
  type ChapterPlan,
  type GrammarViewport,
  type LayoutGrammarId,
  type LayoutPlan,
  type MobileRecomposition,
  type MotionHint,
  type ProductTreatment,
  type ResolveLayoutInput,
  type SurfaceTone,
} from './types';
import { resolveGrammarFromStrategy, resolveGrammarFromUnknownSpec } from './resolveGrammar';
import { resolveVariation } from './variation';
import { typographyFor } from './typography';
import { extractSemanticPage, type CatalogSlice } from './extractContent';

const MOBILE: Record<LayoutGrammarId, MobileRecomposition> = {
  editorial_asymmetric: {
    readingOrder: 'Media crops first, then inset copy with a staggered indent; products follow as offset stack, not a uniform column.',
    overlaps: 'Desktop hangs collapse to an 8% edge offset; no covering of CTAs.',
    typeScale: 'Display drops to ~72% but keeps serif editorial rhythm; measure stays ~34ch.',
    rails: 'No mandatory rail; if merch is mixed, two editorial cards stack with alternating insets.',
    productEmphasis: 'Featured product remains larger; supporting sit below at 86% width, right-aligned then left-aligned.',
    imageCrops: 'Hero uses crop-first with object-position from variation; portrait crop on story cluster.',
    sticky: 'Nav becomes a compact solid bar; nothing sticky over product actions.',
    navigation: 'Links collapse to Home / Shop / Cart with 44px targets.',
    whitespace: 'Chapter pauses remain (3.5rem+) so it does not become a tight stack.',
    grouping: 'Story + mosaic share one chapter; merch stays a separate chapter.',
    cta: 'Primary CTA sits under copy, full-width text button, not overlay.',
    density: 'One idea per screen-height; no 2-column product grid.',
  },
  cinematic_full_bleed: {
    readingOrder: 'Hero frame, then caption, then filmstrip, then story still.',
    overlaps: 'Type overlay only on hero when contrast is sufficient; otherwise type moves under the frame.',
    typeScale: 'Display ~68%; kickers stay tracked small; body on ink surfaces remains 15px+.',
    rails: 'Product filmstrip stays a horizontal snap-scroll; does not become a 1-col grid.',
    productEmphasis: 'One still dominates; supporting stills remain in the rail.',
    imageCrops: 'Hero switches to a taller crop (object-position top/center); letterbox becomes 16:10.',
    sticky: 'Transparent nav becomes a dark translucent bar; no parallax if reduced motion.',
    navigation: 'Light-on-dark links, 44px targets, cart remains reachable.',
    whitespace: 'Full-bleed chapters keep flush edges; copy internally padded 1.25rem.',
    grouping: 'Hero + first product still can share a dark canvas.',
    cta: 'Ghost button over image or solid under image depending on mobileHero.',
    density: 'One cinematic frame per pause; no card chrome.',
  },
  product_monument: {
    readingOrder: 'Monument image, then name/price/CTA, then spec chapters, then supporting rail.',
    overlaps: 'Desktop overlap of copy onto product is removed; copy follows the figure.',
    typeScale: 'Product name remains the largest type; specs stay 13–14px tabular.',
    rails: 'Supporting products become a horizontal rail after the story, not a grid.',
    productEmphasis: 'Hero product still occupies ~70vh; supporting never match its scale.',
    imageCrops: 'Product stays object-fit contain on a paper stage to avoid stretching.',
    sticky: 'Buy bar can pin at bottom on mobile (44px+); respects reduced motion (no slide).',
    navigation: 'Minimal wordmark + cart; shop link present.',
    whitespace: 'Large paper margins around the artifact; specs use tighter rhythm.',
    grouping: 'Spotlight + hero treated as one monument; grid/rail deferred.',
    cta: 'Primary View / Add stay in the copy column then pin as a bar.',
    density: 'Progressive disclosure: three spec lines, then supporting pieces.',
  },
  typographic_campaign: {
    readingOrder: 'Display type, then media collision, then poster products.',
    overlaps: 'Type/image collision becomes type stacked above a cropped still; a vertical label may remain as a short kicker.',
    typeScale: 'Display stays large (~18vw capped) with forced line breaks; never overflows horizontally.',
    rails: 'Optional marquee of names remains a CSS overflow-hidden strip, not page overflow.',
    productEmphasis: 'Campaign posters stack full-bleed; first poster is taller.',
    imageCrops: 'Corner media becomes a 4:5 slice under the headline.',
    sticky: 'Campaign nav stays a black bar; no sticky type.',
    navigation: 'Bold Home/Shop/Cart, high contrast, 44px targets.',
    whitespace: 'Tight campaign gaps (0–1.5rem) except after the hero (pause).',
    grouping: 'Hero type + first product poster can share an ink canvas.',
    cta: 'High-contrast solid button under the display block.',
    density: 'One poster thought at a time; marquee is secondary.',
  },
  immersive_catalog: {
    readingOrder: 'Compact intro, category chips, featured breakout, then mixed mosaic.',
    overlaps: 'None on mobile; featured simply spans full width.',
    typeScale: 'Functional 14–16px; intro heading ~28px.',
    rails: 'Category chips stay a horizontal snap rail; mosaic becomes featured + 2-up.',
    productEmphasis: 'Breakout product remains full-bleed; others 2-column with one full-width interrupt.',
    imageCrops: 'Catalog thumbs 4:5; featured 4:5 or 1:1 from variation.',
    sticky: 'Solid nav; chips can pin under nav without covering CTAs.',
    navigation: 'Standard storefront nav with Shop highlighting catalog intent.',
    whitespace: 'Tighter than editorial but not a Shopify 2xN dump — 1.25rem gutters, chapter rules.',
    grouping: 'Grid + rail merge into one mosaic chapter.',
    cta: 'Quick-add 44px on cards; featured has explicit CTA.',
    density: 'High but scannable; category interrupt resets the eye.',
  },
  warm_storytelling: {
    readingOrder: 'Image cluster, chapter title, story, then a product woven in, then trust quote.',
    overlaps: 'Cluster becomes a horizontal overlapping strip (translateX), not a stack of identical photos.',
    typeScale: 'Soft serif ~78%; body stays 16px+ with 1.6 leading.',
    rails: 'No catalog rail; products appear as chapter objects.',
    productEmphasis: 'One product per chapter; never a dense grid.',
    imageCrops: 'Cluster uses 1:1 / 4:5 / 3:4 mixed; object-position left.',
    sticky: 'None besides a quiet nav.',
    navigation: 'Word-like links, not uppercase chrome.',
    whitespace: 'Chapter padding 3–5rem; warm paper between stories.',
    grouping: 'Story + mosaic + a testimonial share a chapter canvas.',
    cta: 'Text-style CTA after the first chapter, not a banner.',
    density: 'Low; one story beat per pause.',
  },
};

function hint(order: number, extra?: Partial<MotionHint>): MotionHint {
  return {
    entrance: 'fade',
    revealOrder: order,
    parallax: false,
    sticky: false,
    reducedMotionSafe: true,
    ...extra,
  };
}

function chapter(
  id: string,
  kind: ChapterKind,
  nodeIds: string[],
  opts: Partial<ChapterPlan> & { geometry: string }
): ChapterPlan {
  return {
    id,
    kind,
    nodeIds,
    surface: 'paper',
    fullBleed: false,
    overlapNext: false,
    pad: 'standard',
    align: 'start',
    motion: hint(0),
    ...opts,
  };
}

function idsOf(document: SiteDocument, types: string[]): string[] {
  return document.pages.home.nodes.filter((n) => types.includes(n.type) && n.visible !== false).map((n) => n.id);
}

function surfaces(seq: LayoutPlan['variation']['surfaceSequence'], i: number): SurfaceTone {
  if (seq === 'ink_led') return i === 0 || i % 2 === 0 ? 'ink' : 'paper';
  if (seq === 'alternating') return i % 2 === 0 ? 'paper' : 'brand';
  if (seq === 'warm') return i % 2 === 0 ? 'paper' : 'accent';
  return 'paper';
}

export function buildChapters(grammarId: LayoutGrammarId, document: SiteDocument, variation: LayoutPlan['variation']): ChapterPlan[] {
  const nav = idsOf(document, ['nav', 'announcement']);
  const hero = idsOf(document, ['hero']);
  const statement = idsOf(document, ['brandStatement']);
  const story = idsOf(document, ['editorialSplit', 'editorialMosaic']);
  const monument = idsOf(document, ['productSpotlight']);
  const merch = idsOf(document, ['productGrid', 'productRail']);
  const trust = idsOf(document, ['testimonials', 'reviews']);
  const collections = idsOf(document, ['collections']);
  const cta = idsOf(document, ['newsletter']);
  const footer = idsOf(document, ['footer']);
  const grouped = variation.grouping;
  const seq = variation.surfaceSequence;
  let i = 0;

  const out: ChapterPlan[] = [];
  out.push(
    chapter('chrome', 'chrome', nav, {
      geometry: `nav:${variation.nav}`,
      fullBleed: variation.nav === 'overlay',
      pad: 'flush',
      surface: variation.nav === 'overlay' ? 'image' : 'paper',
      motion: hint(0),
    })
  );

  if (grammarId === 'cinematic_full_bleed') {
    out.push(
      chapter('hero', 'hero', hero, {
        geometry: variation.heroGeometry,
        fullBleed: true,
        overlapNext: variation.overlap !== 'none',
        pad: 'flush',
        surface: 'image',
        motion: hint(1, { parallax: true }),
      })
    );
    if (monument.length) {
      out.push(
        chapter('monument', 'monument', monument, {
          geometry: 'film_still',
          fullBleed: true,
          pad: 'flush',
          surface: 'ink',
          motion: hint(2),
        })
      );
    }
    if (story.length) {
      out.push(
        chapter('story', 'story', story, {
          geometry: 'cinematic_caption',
          fullBleed: true,
          pad: grouped === 'canvas' ? 'flush' : 'standard',
          surface: surfaces(seq, ++i),
          motion: hint(3),
        })
      );
    }
    if (merch.length) {
      out.push(
        chapter('merch', 'merch', merch, {
          geometry: 'filmstrip',
          fullBleed: true,
          pad: 'tight',
          surface: 'ink',
          motion: hint(4),
        })
      );
    }
  } else if (grammarId === 'product_monument') {
    out.push(
      chapter('hero', 'hero', [...hero, ...monument], {
        geometry: variation.heroGeometry,
        fullBleed: variation.contentWidth === 'wide',
        overlapNext: variation.overlap === 'modest',
        pad: 'flush',
        surface: 'paper',
        motion: hint(1),
      })
    );
    if (statement.length || story.length) {
      out.push(
        chapter('story', 'story', [...statement, ...story], {
          geometry: 'spec_chapters',
          pad: 'standard',
          surface: surfaces(seq, ++i),
          motion: hint(2),
        })
      );
    }
    if (merch.length) {
      out.push(
        chapter('merch', 'merch', merch, {
          geometry: 'supporting_rail',
          pad: 'standard',
          surface: 'paper',
          motion: hint(3),
        })
      );
    }
  } else if (grammarId === 'typographic_campaign') {
    out.push(
      chapter('hero', 'hero', [...hero, ...statement], {
        geometry: variation.heroGeometry,
        fullBleed: true,
        overlapNext: variation.overlap === 'pronounced',
        pad: 'flush',
        surface: 'ink',
        motion: hint(1),
      })
    );
    if (merch.length || monument.length) {
      out.push(
        chapter('merch', 'merch', [...monument, ...merch], {
          geometry: 'campaign_posters',
          fullBleed: true,
          pad: 'tight',
          surface: 'ink',
          motion: hint(2),
        })
      );
    }
    if (story.length) {
      out.push(
        chapter('story', 'story', story, {
          geometry: 'type_caption',
          fullBleed: false,
          pad: 'standard',
          surface: surfaces(seq, ++i),
          motion: hint(3),
        })
      );
    }
  } else if (grammarId === 'immersive_catalog') {
    out.push(
      chapter('hero', 'hero', hero, {
        geometry: variation.heroGeometry,
        fullBleed: false,
        pad: 'tight',
        surface: 'paper',
        motion: hint(1),
      })
    );
    if (collections.length) {
      out.push(
        chapter('collections', 'collections', collections, {
          geometry: 'category_rail',
          pad: 'tight',
          surface: 'paper',
          motion: hint(2),
        })
      );
    }
    out.push(
      chapter('merch', 'merch', [...monument, ...merch], {
        geometry: 'mixed_mosaic',
        pad: 'tight',
        surface: 'paper',
        motion: hint(3),
      })
    );
    if (story.length) {
      out.push(
        chapter('story', 'story', story, {
          geometry: 'category_interrupt',
          pad: 'standard',
          surface: surfaces(seq, ++i),
          motion: hint(4),
        })
      );
    }
  } else if (grammarId === 'warm_storytelling') {
    out.push(
      chapter('hero', 'hero', [...hero, ...story.slice(0, 1)], {
        geometry: variation.heroGeometry,
        overlapNext: variation.overlap !== 'none',
        pad: variation.rhythm === 'sparse' ? 'pause' : 'standard',
        surface: 'paper',
        motion: hint(1),
      })
    );
    if (statement.length) {
      out.push(
        chapter('statement', 'statement', statement, {
          geometry: 'chapter_mark',
          pad: 'pause',
          surface: 'accent',
          align: 'center',
          motion: hint(2),
        })
      );
    }
    out.push(
      chapter('story', 'story', [...story, ...monument], {
        geometry: 'woven_product',
        pad: 'pause',
        surface: 'paper',
        motion: hint(3),
      })
    );
    if (trust.length) {
      out.push(
        chapter('trust', 'trust', trust, {
          geometry: 'inline_quote',
          pad: 'standard',
          surface: 'accent',
          motion: hint(4),
        })
      );
    }
    if (merch.length) {
      out.push(
        chapter('merch', 'merch', merch, {
          geometry: 'chapter_objects',
          pad: 'standard',
          surface: 'paper',
          motion: hint(5),
        })
      );
    }
  } else {
    // editorial_asymmetric
    out.push(
      chapter('hero', 'hero', hero, {
        geometry: variation.heroGeometry,
        overlapNext: variation.overlap !== 'none',
        pad: 'flush',
        align: variation.mediaSide === 'right' ? 'start' : 'end',
        surface: 'paper',
        motion: hint(1),
      })
    );
    if (statement.length) {
      out.push(
        chapter('statement', 'statement', statement, {
          geometry: 'editorial_pause',
          pad: 'pause',
          align: 'end',
          surface: surfaces(seq, ++i),
          motion: hint(2),
        })
      );
    }
    if (monument.length) {
      out.push(
        chapter('monument', 'monument', monument, {
          geometry: 'editorial_feature',
          overlapNext: grouped === 'canvas',
          pad: 'standard',
          surface: 'paper',
          motion: hint(3),
        })
      );
    }
    if (story.length) {
      out.push(
        chapter('story', 'story', story, {
          geometry: grouped === 'canvas' ? 'shared_canvas' : 'offset_split',
          pad: 'pause',
          surface: surfaces(seq, ++i),
          motion: hint(4),
        })
      );
    }
    if (merch.length) {
      out.push(
        chapter('merch', 'merch', merch, {
          geometry: variation.productEmphasis === 'single' ? 'staggered_feature' : 'staggered_mixed',
          pad: 'standard',
          surface: 'paper',
          motion: hint(5),
        })
      );
    }
    if (trust.length) {
      out.push(
        chapter('trust', 'trust', trust, {
          geometry: 'editorial_notes',
          pad: 'standard',
          surface: surfaces(seq, ++i),
          motion: hint(6),
        })
      );
    }
  }

  if (cta.length) {
    out.push(
      chapter('cta', 'cta', cta, {
        geometry: 'quiet_cta',
        pad: 'tight',
        surface: 'paper',
        motion: hint(8),
      })
    );
  }
  out.push(
    chapter('footer', 'footer', footer, {
      geometry: 'grammar_footer',
      pad: 'standard',
      surface: grammarId === 'cinematic_full_bleed' || grammarId === 'typographic_campaign' ? 'ink' : 'paper',
      motion: hint(9),
    })
  );

  return out.filter((c) => c.kind === 'chrome' || c.kind === 'footer' || c.nodeIds.length > 0);
}

function treatmentsFor(grammarId: LayoutGrammarId, variation: LayoutPlan['variation']): ProductTreatment[] {
  switch (grammarId) {
    case 'editorial_asymmetric':
      return variation.productEmphasis === 'single'
        ? ['featured_oversized', 'editorial_borderless']
        : ['editorial_borderless', 'mixed_mosaic'];
    case 'cinematic_full_bleed':
      return ['film_still', 'horizontal_story'];
    case 'product_monument':
      return ['artifact_stage', 'horizontal_story'];
    case 'typographic_campaign':
      return ['campaign_poster', 'featured_oversized'];
    case 'immersive_catalog':
      return ['featured_oversized', 'mixed_mosaic', 'dense_catalog', 'category_interrupt'];
    case 'warm_storytelling':
      return ['warm_inset', 'editorial_borderless'];
  }
}

export function buildLayoutPlan(input: ResolveLayoutInput): LayoutPlan {
  const viewport: GrammarViewport = input.viewport || 'desktop';
  let strategy: CreativeStrategy | null = input.strategy || null;
  let resolution;

  if (input.grammarOverride && !strategy && !input.spec) {
    resolution = resolveGrammarFromStrategy(
      {
        pageComposition: 'editorial_journey',
        narrativeModel: 'editorial',
        heroPhilosophy: 'split_editorial',
        commerceEntry: 'mid',
        commerceModel: 'shoppable_editorial',
        rhythm: 'sparse_pause',
        density: 'low',
        asymmetry: 'high',
        typographyRole: 'balanced',
        imageryRole: 'balanced',
        navigationBehavior: 'minimal_chrome',
        experimentationLevel: 'medium',
        distinctivenessBrief: 'Explicit grammar prototype; strategy is illustrative only for metadata.',
      },
      input.grammarOverride
    );
  } else if (strategy) {
    resolution = resolveGrammarFromStrategy(strategy, input.grammarOverride);
  } else {
    const r = resolveGrammarFromUnknownSpec(input.spec, input.grammarOverride);
    strategy = r.strategy;
    resolution = r.resolution;
  }

  const grammarId = resolution.grammarId;
  const variation = resolveVariation(grammarId, input.seed);
  const typography = typographyFor(grammarId);

  const dummyDoc = {
    pages: { home: { nodes: (input.nodeTypes || COMPOSITION_TYPES).map((type, i) => ({ id: `${type}_${i}`, type, variant: 'x', visible: true, content: {}, design: {}, responsive: {} })) } },
  } as unknown as SiteDocument;

  const chapters = input.nodeTypes
    ? buildChapters(grammarId, dummyDoc, variation)
    : [];

  return {
    grammarId,
    resolution,
    variation,
    typography,
    chapters,
    heroGeometry: variation.heroGeometry,
    productPresentation: treatmentsFor(grammarId, variation),
    mobile: MOBILE[grammarId],
    viewport,
    overflowStrategy: 'clip_root',
    compositionIds: input.nodeTypes || [...COMPOSITION_TYPES],
    metadata: {
      strategy,
      contentWidth: variation.contentWidth,
      gridRatio: variation.gridRatio,
      overlap: variation.overlap,
      surfaceSequence: variation.surfaceSequence,
    },
  };
}

export function planForDocument(opts: {
  document: SiteDocument;
  catalog: CatalogSlice;
  strategy?: CreativeStrategy | null;
  spec?: unknown;
  seed?: string | number;
  grammarOverride?: LayoutGrammarId;
  viewport?: GrammarViewport;
}): { plan: LayoutPlan; page: ReturnType<typeof extractSemanticPage> } {
  const page = extractSemanticPage(opts.document, opts.catalog);
  const plan = buildLayoutPlan({
    strategy: opts.strategy,
    spec: opts.spec,
    seed: opts.seed,
    grammarOverride: opts.grammarOverride,
    viewport: opts.viewport,
    nodeTypes: page.nodes.map((n) => n.type),
  });
  plan.chapters = buildChapters(plan.grammarId, opts.document, plan.variation);
  plan.compositionIds = page.compositionIds;
  return { plan, page };
}

export function assertValidCompositionIds(ids: string[]): string[] {
  const knownTypes = new Set(COMPOSITION_TYPES as readonly string[]);
  return ids.filter((id) => {
    const type = id.split(':')[0];
    return !knownTypes.has(type);
  });
}

export function isLayoutGrammarId(v: string): v is LayoutGrammarId {
  return (LAYOUT_GRAMMAR_IDS as readonly string[]).includes(v);
}
