import type { LayoutGrammarId } from '@/lib/ai-studio/v2/layoutGrammar/types';
import { CANDIDATE_GRAMMARS, EXPERIMENTAL_GRAMMARS } from '@/lib/ai-studio/v2/layoutGrammar/status';
import type {
  ArchetypeResult,
  CatalogProfile,
  ChapterEligibility,
  ClassifiedAsset,
  GrammarCompatibility,
  GrammarGate,
  GrammarScoreBreakdown,
  IntelligenceInput,
  PlanOutcome,
  SafeFallbackKind,
} from './types';
import { roundConfidence } from './stable';

const WEIGHTS = { structural: 0.15, semantic: 0.25, asset: 0.25, brand: 0.2, commerce: 0.15 } as const;

/** Equal finals: prefer publication/campaign grammars over monument so monument is not a silent tie winner. */
const TIE_ORDER: LayoutGrammarId[] = [
  'editorial_asymmetric',
  'cinematic_full_bleed',
  'typographic_campaign',
  'product_monument',
  'immersive_catalog',
  'warm_storytelling',
];

function clamp01(n: number): number {
  return roundConfidence(Math.max(0, Math.min(1, n)));
}

function gate(id: string, passed: boolean, detail: string): GrammarGate {
  return { id, passed, detail };
}

function finalize(
  grammarId: LayoutGrammarId,
  parts: Omit<GrammarScoreBreakdown, 'weighted' | 'final'>,
  gates: GrammarGate[],
  reasons: string[],
  risks: string[],
  experimental: boolean
): GrammarCompatibility {
  const weighted = clamp01(
    parts.structural * WEIGHTS.structural +
      parts.semantic * WEIGHTS.semantic +
      parts.asset * WEIGHTS.asset +
      parts.brand * WEIGHTS.brand +
      parts.commerce * WEIGHTS.commerce -
      parts.penalties
  );
  const failedGates = gates.filter((g) => !g.passed).map((g) => g.id);
  const accepted = !experimental && failedGates.length === 0 && weighted >= 0.55;
  const final = accepted ? weighted : clamp01(weighted * 0.5);
  return {
    grammarId,
    score: final,
    breakdown: { ...parts, weighted, final },
    gates,
    failedGates,
    accepted,
    reasons,
    missingRequirements: failedGates,
    riskFlags: risks,
    experimental,
    rejectionReason: experimental
      ? 'Experimental/rejected grammar is diagnostic only.'
      : failedGates.length
        ? `Failed mandatory gates: ${failedGates.join(', ')}.`
        : weighted < 0.55
          ? `Weighted score ${weighted} is below the 0.55 acceptance threshold.`
          : null,
  };
}

export function lifestyleAssets(assets: ClassifiedAsset[]): ClassifiedAsset[] {
  return assets.filter(
    (a) =>
      (a.role === 'hero_lifestyle' || a.role === 'product_lifestyle') &&
      a.roleConfidence >= 0.55
  );
}

function scoreCinematic(assets: ClassifiedAsset[], catalog: CatalogProfile, archetype: ArchetypeResult): GrammarCompatibility {
  const lifestyle = lifestyleAssets(assets);
  const bleed = lifestyle.filter((a) => a.resolutionSuitability === 'full_bleed');
  const urls = new Set(lifestyle.map((a) => a.url));
  const reasons = ['Cinematic is image-sequence and atmosphere led.'];
  const risks: string[] = [];
  const gates = [
    gate('campaign_lifestyle_set', lifestyle.length >= 2, `${lifestyle.length} confident lifestyle/campaign frames.`),
    gate('full_bleed_assets', bleed.length >= 2, `${bleed.length} full-bleed lifestyle frames.`),
    gate('sequence_diversity', urls.size >= 2, `${urls.size} distinct lifestyle URLs.`),
    gate('not_packshot_only', lifestyle.length > 0, lifestyle.length ? 'Lifestyle imagery present.' : 'Packshot-only catalog.'),
  ];
  if (lifestyle.length >= 2) reasons.push('Sequential atmosphere imagery exists.');
  if (bleed.length >= 2) reasons.push('Multiple full-bleed campaign frames.');

  const structural = catalog.catalogShape === 'broad_catalog' ? 0.25 : catalog.catalogShape === 'single_product' ? 0.4 : 0.7;
  let semantic = clamp01(0.35 + Math.min(0.5, lifestyle.length * 0.2));
  let asset = clamp01(0.2 + bleed.length * 0.3 + (urls.size >= 2 ? 0.15 : 0));
  if (lifestyle.length >= 2 && bleed.length >= 2) {
    semantic = clamp01(Math.max(semantic, 0.86));
    asset = clamp01(Math.max(asset, 0.9));
    reasons.push('Campaign sequence is included in cinematic semantic and asset scores.');
  }
  const brand =
    archetype.archetype === 'streetwear_campaign' || archetype.archetype === 'beauty_ritual'
      ? lifestyle.length >= 2
        ? 0.9
        : 0.78
      : archetype.archetype === 'fashion_editorial'
        ? 0.72
        : archetype.archetype === 'technology_product' || archetype.archetype === 'unknown'
          ? 0.25
          : 0.45;
  const commerce = 0.4;
  let penalties = 0;
  if (catalog.imageCoverage < 0.5) {
    penalties += 0.12;
    risks.push('weak_imagery');
  }
  if (lifestyle.length === 0) {
    penalties += 0.2;
    risks.push('packshot_only_catalog');
  }
  return finalize('cinematic_full_bleed', { structural, semantic, asset, brand, commerce, penalties }, gates, reasons, risks, false);
}

function scoreEditorial(
  input: IntelligenceInput,
  assets: ClassifiedAsset[],
  catalog: CatalogProfile,
  archetype: ArchetypeResult
): GrammarCompatibility {
  const described = input.products.filter((p) => (p.description || '').length >= 24).length;
  const complementary = assets.filter(
    (a) =>
      (a.role === 'product_lifestyle' || a.role === 'hero_lifestyle' || a.role === 'brand_story' || a.role === 'product_detail') &&
      a.roleConfidence >= 0.5
  );
  const packshotProducts = new Set(assets.filter((a) => a.role === 'product_packshot' && a.productId).map((a) => a.productId));
  const curatedSet = catalog.catalogShape === 'focused_collection' && complementary.length >= 1 && packshotProducts.size >= 3;
  const merchantCopy = (input.merchant.description || '').length >= 40;
  const reasons = ['Editorial is story, curation, and publication led.'];
  const risks: string[] = [];
  const gates = [
    gate(
      'narrative_or_curation',
      catalog.editorialStorySupport || (merchantCopy && described >= 2),
      catalog.editorialStorySupport ? 'Editorial story support present.' : 'Need merchant copy plus described products.'
    ),
    gate('complementary_imagery', complementary.length >= 2 || curatedSet, `${complementary.length} story images; ${packshotProducts.size} packshot products.`),
    gate('usable_text', described / Math.max(1, input.products.length) >= 0.6 || merchantCopy, 'Usable narrative text.'),
    gate(
      'coherent_collection',
      catalog.catalogShape !== 'broad_catalog' && catalog.productDepth !== 'sparse',
      `${catalog.catalogShape} / ${catalog.productDepth}`
    ),
  ];
  if (catalog.editorialStorySupport) reasons.push('Curated catalog with narrative copy and complementary images.');
  if (archetype.archetype === 'fashion_editorial') reasons.push('Fashion editorial catalog matches publication-led grammar.');

  const structural = catalog.catalogShape === 'focused_collection' ? 0.88 : catalog.catalogShape === 'single_product' ? 0.45 : 0.2;
  const semantic = clamp01((described / Math.max(1, input.products.length)) * 0.5 + (merchantCopy ? 0.35 : 0.1));
  const asset = clamp01(complementary.length >= 2 ? 0.78 : curatedSet ? 0.62 : complementary.length === 1 ? 0.4 : 0.15);
  const brand = archetype.archetype === 'fashion_editorial' ? 0.95 : archetype.archetype === 'beauty_ritual' ? 0.72 : archetype.archetype === 'food_artisan' ? 0.6 : 0.4;
  const commerce = 0.55;
  let penalties = 0;
  if (catalog.catalogShape === 'broad_catalog') {
    penalties += 0.18;
    risks.push('catalog_too_broad');
  }
  if (catalog.productDepth === 'sparse') {
    penalties += 0.15;
    risks.push('sparse_content');
  }
  return finalize('editorial_asymmetric', { structural, semantic, asset, brand, commerce, penalties }, gates, reasons, risks, false);
}

function scoreMonument(
  assets: ClassifiedAsset[],
  catalog: CatalogProfile,
  archetype: ArchetypeResult
): GrammarCompatibility {
  const owned = assets.filter((a) => a.productId === catalog.primaryProductId);
  const strong = owned.some((a) => a.resolutionSuitability === 'full_bleed' || a.resolutionSuitability === 'contained');
  const reasons = ['Product Monument is primary-product and conversion led.'];
  const risks: string[] = [];
  const focused = catalog.catalogShape !== 'broad_catalog' && catalog.isDominantProduct;
  const gates = [
    gate('dominant_product', catalog.isDominantProduct && Boolean(catalog.primaryProductId), catalog.isDominantProduct ? 'Genuinely dominant primary product.' : 'No dominant product (only-available is not dominance).'),
    gate('strong_primary_imagery', strong && catalog.heroSuitability >= 0.45, `heroSuitability ${catalog.heroSuitability}.`),
    gate('adequate_product_information', catalog.evidenceCompleteness >= 0.5 && catalog.productDepth !== 'sparse', `completeness ${catalog.evidenceCompleteness}, depth ${catalog.productDepth}.`),
    gate('focused_catalog_structure', focused, focused ? 'Catalog can support a single-product stage.' : 'Catalog structure contradicts a monument focus.'),
  ];
  if (catalog.isDominantProduct) reasons.push('Clear primary product with explainable dominance.');
  if (strong) reasons.push('Primary product has usable owned imagery.');

  const structural = focused ? 0.8 : 0.25;
  const semantic = clamp01(catalog.narrativeSuitability);
  const asset = strong ? clamp01(0.55 + catalog.heroSuitability * 0.4) : 0.2;
  const brand = archetype.archetype === 'technology_product' ? 0.82 : archetype.archetype === 'fashion_editorial' || archetype.archetype === 'beauty_ritual' ? 0.42 : 0.5;
  const commerce = 0.85;
  let penalties = 0;
  if (lifestyleAssets(assets).length >= 2) {
    penalties += 0.12;
    risks.push('atmosphere_available_prefer_sequence');
  }
  if (catalog.editorialStorySupport) {
    penalties += 0.18;
    risks.push('publication_led_catalog');
    reasons.push('Editorial story support is applied as a monument penalty, not a hidden post-score override.');
  }
  if (catalog.catalogShape === 'broad_catalog') {
    penalties += 0.2;
    risks.push('undifferentiated_catalog');
  }
  if (archetype.archetype === 'unknown') {
    penalties += 0.15;
    risks.push('unknown_archetype');
  }
  return finalize('product_monument', { structural, semantic, asset, brand, commerce, penalties }, gates, reasons, risks, false);
}

function scoreTypographic(input: IntelligenceInput, assets: ClassifiedAsset[], archetype: ArchetypeResult): GrammarCompatibility {
  const names = input.products.map((p) => p.title);
  const shortNames = names.filter((t) => t.split(' ').length <= 4).length / Math.max(1, names.length);
  const longCopy = input.products.some((p) => (p.description || '').length > 280);
  const tagline = input.merchant.tagline || '';
  const campaignArchetype = archetype.archetype === 'streetwear_campaign';
  const campaignLanguage = tagline.length > 8 && tagline.length < 80;
  const reasons = ['Typographic is language, campaign, and display-type led.'];
  const risks: string[] = [];
  const supportImage = assets.some(
    (a) => a.role === 'hero_lifestyle' || a.role === 'product_lifestyle' || a.role === 'hero_product'
  );
  const gates = [
    gate('campaign_archetype', campaignArchetype, campaignArchetype ? 'Streetwear/campaign positioning.' : 'Not a campaign-led archetype.'),
    gate('brand_language_or_naming', campaignLanguage && shortNames >= 0.7, 'Short brand language and display-safe names.'),
    gate('safe_copy_length', !longCopy, longCopy ? 'Copy too long for display type.' : 'Copy length is display-safe.'),
    gate('appropriate_imagery', supportImage || assets.some((a) => a.resolutionSuitability !== 'thumb_only'), 'Imagery can support bold type.'),
  ];
  if (campaignArchetype) reasons.push('Streetwear/campaign positioning favors display-type leadership.');
  if (campaignLanguage) reasons.push('Brand language is short enough to lead as campaign type.');

  const structural = 0.65;
  const semantic = campaignArchetype ? 0.9 : 0.3;
  const asset = supportImage ? 0.7 : 0.35;
  const brand = campaignArchetype ? 0.95 : 0.28;
  const commerce = 0.7;
  let penalties = 0;
  if (archetype.archetype === 'fashion_editorial' || archetype.archetype === 'beauty_ritual' || archetype.archetype === 'food_artisan') {
    penalties += 0.12;
    risks.push('quiet_or_traditional_brand');
  }
  if (archetype.archetype === 'technology_product') {
    penalties += 0.1;
    risks.push('technical_comparison_needed');
  }
  if (longCopy) {
    penalties += 0.12;
    risks.push('copy_too_long_for_display');
  }
  return finalize('typographic_campaign', { structural, semantic, asset, brand, commerce, penalties }, gates, reasons, risks, false);
}

function scoreExperimental(id: LayoutGrammarId): GrammarCompatibility {
  const catalogFirst = id === 'immersive_catalog';
  return finalize(
    id,
    { structural: 0.3, semantic: 0.2, asset: 0.2, brand: 0.2, commerce: 0.4, penalties: 0 },
    [gate('approved_candidate_status', false, 'Experimental/rejected — not production-ready.')],
    [
      catalogFirst
        ? 'Diagnostic only: dense catalog grammar remains experimental/rejected.'
        : 'Diagnostic only: warm storytelling remains experimental/rejected.',
    ],
    ['experimental_grammar'],
    true
  );
}

export function scoreGrammars(opts: {
  input: IntelligenceInput;
  assets: ClassifiedAsset[];
  catalog: CatalogProfile;
  archetype: ArchetypeResult;
  narrative: ChapterEligibility[];
}): {
  rows: GrammarCompatibility[];
  selected: LayoutGrammarId | null;
  outcome: PlanOutcome;
  safeFallback: SafeFallbackKind;
  selectionReason: string;
  tradeoff: string | null;
} {
  const rows: GrammarCompatibility[] = [
    scoreCinematic(opts.assets, opts.catalog, opts.archetype),
    scoreEditorial(opts.input, opts.assets, opts.catalog, opts.archetype),
    scoreMonument(opts.assets, opts.catalog, opts.archetype),
    scoreTypographic(opts.input, opts.assets, opts.archetype),
    ...EXPERIMENTAL_GRAMMARS.map((id) => scoreExperimental(id)),
  ];

  const accepted = rows
    .filter((r) => r.accepted && CANDIDATE_GRAMMARS.includes(r.grammarId))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return TIE_ORDER.indexOf(a.grammarId) - TIE_ORDER.indexOf(b.grammarId);
    });

  const selected = accepted[0]?.grammarId || null;
  const runner = accepted[1];
  let tradeoff: string | null = null;
  if (selected && runner && Math.abs(accepted[0].score - runner.score) <= 0.04) {
    tradeoff = tradeoffText(selected, runner.grammarId);
    if (accepted[0].score === runner.score) {
      tradeoff = `Deterministic tie-break prefers ${selected} over ${runner.grammarId} (${TIE_ORDER.join(' > ')}). ${tradeoff}`;
    }
  } else if (selected && runner) {
    tradeoff = `${selected} final ${accepted[0].score} > ${runner.grammarId} final ${runner.score}.`;
  }

  const packshotLed =
    opts.assets.some((a) => a.role === 'product_packshot') && lifestyleAssets(opts.assets).length === 0;
  const weakEvidence =
    opts.archetype.confidence < 0.55 ||
    opts.catalog.evidenceCompleteness < 0.45 ||
    opts.archetype.archetype === 'unknown' ||
    opts.catalog.productDepth === 'sparse';

  let outcome: PlanOutcome;
  let safeFallback: SafeFallbackKind = 'none';
  let selectionReason: string;

  if (selected) {
    outcome = 'selected';
    selectionReason = `${selected} has the highest accepted final score (${accepted[0].score}) after gates, component scores, and penalties.${
      runner ? ` Next accepted: ${runner.grammarId} (${runner.score}).` : ' No other grammar passed acceptance.'
    }${tradeoff ? ` ${tradeoff}` : ''}`;
  } else if (opts.catalog.catalogShape === 'broad_catalog') {
    outcome = 'safe_fallback';
    safeFallback = 'general_catalog_plan';
    selectionReason = 'Broad mixed catalog matches no candidate grammar. Safe catalog-oriented fallback, not Product Monument.';
  } else if (weakEvidence) {
    outcome = 'needs_clarification';
    safeFallback = 'stable_renderer';
    selectionReason =
      'No grammar passed mandatory gates. Evidence is too weak to invent a premium narrative; clarification or the stable renderer is required.';
  } else if (packshotLed) {
    outcome = 'safe_fallback';
    safeFallback = 'stable_renderer';
    selectionReason =
      'Packshot-led catalog failed monument/cinematic/editorial gates. Safe commerce layout, not a fake premium narrative.';
  } else {
    outcome = 'no_compatible_grammar';
    safeFallback = 'stable_renderer';
    selectionReason = 'Candidate grammars were scored and rejected. Fallback is the existing stable renderer, not a fake monument.';
  }

  return { rows, selected, outcome, safeFallback, selectionReason, tradeoff };
}

function tradeoffText(a: LayoutGrammarId, b: LayoutGrammarId): string {
  const pair = [a, b].sort().join('|');
  if (pair.includes('cinematic_full_bleed') && pair.includes('typographic_campaign')) {
    return 'Cinematic is image-sequence and atmosphere led; Typographic is language, campaign, and display-type led.';
  }
  if (pair.includes('product_monument') && pair.includes('editorial_asymmetric')) {
    return 'Product Monument is primary-product and conversion led; Editorial is story, curation, and publication led.';
  }
  if (pair.includes('cinematic_full_bleed') && pair.includes('editorial_asymmetric')) {
    return 'Cinematic sequences campaign frames; Editorial composes type and images as a publication.';
  }
  if (pair.includes('product_monument') && pair.includes('typographic_campaign')) {
    return 'Monument stages one object to buy; Typographic leads with campaign language then merch.';
  }
  return `${a} vs ${b}: selected the higher accepted final score; tie-break prefers non-monument drivers.`;
}
