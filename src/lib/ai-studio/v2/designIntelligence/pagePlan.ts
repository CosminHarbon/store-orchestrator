import type { LayoutGrammarId } from '@/lib/ai-studio/v2/layoutGrammar/types';
import type {
  CatalogProfile,
  ChapterEligibility,
  PageNarrativeChapter,
  PageNarrativePlan,
} from './types';

const TREATMENTS: Record<string, LayoutGrammarId[]> = {
  chrome: ['cinematic_full_bleed', 'editorial_asymmetric', 'product_monument', 'typographic_campaign'],
  product_introduction: ['product_monument', 'editorial_asymmetric', 'cinematic_full_bleed', 'typographic_campaign'],
  feature: ['product_monument', 'editorial_asymmetric'],
  form_design: ['product_monument', 'editorial_asymmetric'],
  material: ['product_monument', 'editorial_asymmetric'],
  process_making: ['editorial_asymmetric', 'cinematic_full_bleed'],
  usage: ['cinematic_full_bleed', 'product_monument'],
  lifestyle: ['cinematic_full_bleed', 'editorial_asymmetric', 'typographic_campaign'],
  collection: ['editorial_asymmetric', 'typographic_campaign', 'cinematic_full_bleed'],
  comparison: ['product_monument'],
  trust: ['editorial_asymmetric', 'product_monument'],
  brand_story: ['editorial_asymmetric', 'cinematic_full_bleed'],
  product_discovery: ['product_monument', 'editorial_asymmetric', 'cinematic_full_bleed', 'typographic_campaign'],
};

function actionFor(purpose: ChapterEligibility['purpose']): PageNarrativeChapter['ecommerceAction'] {
  if (purpose === 'product_introduction' || purpose === 'feature' || purpose === 'form_design') return 'open_product';
  if (purpose === 'product_discovery' || purpose === 'collection') return 'open_catalog';
  if (purpose === 'chrome') return 'open_cart';
  return 'none';
}

export function buildPageNarrative(opts: {
  eligibility: ChapterEligibility[];
  catalog: CatalogProfile;
  selectedGrammarId: LayoutGrammarId | null;
}): PageNarrativePlan {
  const accepted = opts.eligibility.filter((e) => e.eligible);
  const rejected = opts.eligibility.filter((e) => !e.eligible);
  const order: ChapterEligibility['purpose'][] = [
    'chrome',
    'product_introduction',
    'feature',
    'form_design',
    'material',
    'process_making',
    'usage',
    'lifestyle',
    'collection',
    'comparison',
    'trust',
    'brand_story',
    'product_discovery',
  ];

  const chapters: PageNarrativeChapter[] = [];
  const seenCopy = new Set<string>();
  for (const purpose of order) {
    const row = accepted.find((e) => e.purpose === purpose);
    if (!row) continue;
    if (purpose === 'chrome' && chapters.some((c) => c.purpose === 'chrome')) continue;
    const fp = row.copyFingerprint || purpose;
    if (purpose !== 'chrome' && purpose !== 'product_discovery' && seenCopy.has(fp)) continue;
    if (purpose !== 'chrome') seenCopy.add(fp);
    chapters.push({
      id: `ch_${purpose}`,
      purpose,
      productIds: row.assignedProductIds,
      assetIds: row.assignedAssetIds,
      copySource: purpose === 'chrome' ? 'merchant' : purpose === 'trust' ? 'document' : 'product',
      copyRef: row.assignedProductIds[0] || 'merchant',
      allowedGrammarTreatments: TREATMENTS[purpose] || (opts.selectedGrammarId ? [opts.selectedGrammarId] : TREATMENTS.chrome),
      ecommerceAction: actionFor(purpose),
      confidence: row.confidence,
      evidence: row.availableEvidence.map((signal) => ({
        provider: 'structured_metadata' as const,
        signal,
        weight: row.confidence,
      })),
      fallback: row.fallback,
      aiMayRewriteCopy: purpose !== 'chrome' && purpose !== 'trust',
      independentlyReplaceable: purpose !== 'chrome',
    });
  }

  if (!chapters.some((c) => c.purpose === 'chrome')) {
    chapters.unshift({
      id: 'ch_chrome',
      purpose: 'chrome',
      productIds: [],
      assetIds: [],
      copySource: 'merchant',
      copyRef: 'nav_footer',
      allowedGrammarTreatments: TREATMENTS.chrome,
      ecommerceAction: 'open_cart',
      confidence: 1,
      evidence: [],
      fallback: null,
      aiMayRewriteCopy: false,
      independentlyReplaceable: false,
    });
  }

  if (!chapters.some((c) => c.purpose === 'product_discovery') && opts.catalog.totalProducts >= 2) {
    const disc = accepted.find((e) => e.purpose === 'product_discovery');
    if (disc) {
      /* already added */
    }
  }

  const fallbackStrategy = rejected.some((r) => r.purpose === 'process_making' || r.purpose === 'material' || r.purpose === 'usage')
    ? 'Omit unsupported Form/Make/Use and keep product introduction, features, and discovery.'
    : 'Prefer evidence-backed chapters; do not fill empty grammar slots.';

  return { chapters, rejected, fallbackStrategy };
}
