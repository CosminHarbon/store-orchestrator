import type {
  ArchetypeResult,
  ConfidenceBand,
  Evidence,
  EvidenceGroup,
  EvidenceGroupId,
  IntelligenceInput,
  StoreArchetype,
} from './types';
import { roundConfidence } from './stable';

type Vocab = { archetype: StoreArchetype; words: string[] };

const VOCAB: Vocab[] = [
  { archetype: 'fashion_editorial', words: ['handbag', 'leather', 'atelier', 'couture', 'silk', 'tailor', 'editorial', 'luxury', 'tote', 'clutch', 'fashion'] },
  { archetype: 'streetwear_campaign', words: ['streetwear', 'hoodie', 'drop', 'oversized', 'cargo', 'sneaker', 'cap', 'tee', 'campaign', 'urban', 'graphic'] },
  { archetype: 'beauty_ritual', words: ['serum', 'skincare', 'cleanser', 'barrier', 'ritual', 'niacinamide', 'moisturizer', 'botanical', 'spf', 'cream'] },
  { archetype: 'technology_product', words: ['headphone', 'earbuds', 'wireless', 'anc', 'dac', 'audio', 'battery', 'driver', 'usb-c', 'electronics'] },
  { archetype: 'home_interior', words: ['sofa', 'lamp', 'ceramic', 'vase', 'linen', 'home interior', 'interior design', 'home', 'cushion', 'coffee table', 'vessel'] },
  { archetype: 'food_artisan', words: ['olive', 'honey', 'preserve', 'grove', 'harvest', 'pantry', 'artisan', 'small-batch', 'estate', 'marmalade'] },
  { archetype: 'kids_playful', words: ['kids', 'child', 'toy', 'play', 'plush', 'wooden toy', 'toddler', 'playful'] },
];

const GROUP_ORDER: EvidenceGroupId[] = [
  'merchant_description',
  'categories_collections',
  'product_names',
  'product_descriptions',
  'tags',
  'catalog_distribution',
  'asset_metadata',
  'design_spec',
  'creative_strategy',
];

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hitsIn(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => {
    const token = w.toLowerCase();
    if (token.includes(' ')) return lower.includes(token);
    return new RegExp(`(?:^|[^a-z0-9])${escapeRe(token)}(?:$|[^a-z0-9])`).test(lower);
  });
}

function specBlob(spec: unknown): string {
  if (!spec || typeof spec !== 'object') return '';
  const s = spec as Record<string, unknown>;
  const brand = (s.brand || {}) as Record<string, unknown>;
  const art = (s.artDirection || {}) as Record<string, unknown>;
  const intent = (s.designIntent || {}) as Record<string, unknown>;
  return [brand.businessType, brand.positioning, brand.audience, art.archetype, intent.coreConcept]
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();
}

function strategyBlob(strategy: IntelligenceInput['merchant']['strategy']): string {
  if (!strategy) return '';
  return [strategy.narrativeModel, strategy.heroPhilosophy, strategy.pageComposition, strategy.distinctivenessBrief]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function bandOf(confidence: number): ConfidenceBand {
  if (confidence >= 0.9) return 'multiple_independent';
  if (confidence >= 0.75) return 'strong';
  if (confidence >= 0.55) return 'plausible';
  if (confidence >= 0.3) return 'weak';
  return 'unknown';
}

function groupTexts(input: IntelligenceInput): Record<EvidenceGroupId, string> {
  return {
    merchant_description: [input.merchant.storeName, input.merchant.tagline, input.merchant.description].filter(Boolean).join(' '),
    categories_collections: [
      ...input.products.map((p) => p.category),
      ...input.collections.flatMap((c) => [c.name, c.description || '']),
    ].join(' '),
    product_names: input.products.map((p) => p.title).join(' '),
    product_descriptions: input.products.map((p) => p.description).join(' '),
    tags: input.products.flatMap((p) => p.tags || []).join(' '),
    catalog_distribution: '',
    asset_metadata: input.assets.flatMap((a) => [a.filename, a.alt, a.caption, ...(a.merchantTags || [])]).filter(Boolean).join(' '),
    design_spec: specBlob(input.merchant.designSpec),
    creative_strategy: strategyBlob(input.merchant.strategy),
  };
}

function distributionHits(input: IntelligenceInput, words: string[]): string[] {
  const cats = input.products.map((p) => (p.category || '').toLowerCase()).filter(Boolean);
  if (!cats.length) return [];
  const shareBy = new Map<string, number>();
  for (const c of cats) shareBy.set(c, (shareBy.get(c) || 0) + 1);
  const dominant = [...shareBy.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!dominant) return [];
  const share = dominant[1] / cats.length;
  if (share < 0.5) return [];
  return hitsIn(dominant[0], words);
}

export function classifyArchetype(input: IntelligenceInput): ArchetypeResult {
  const texts = groupTexts(input);
  const uniqueCats = new Set(input.products.map((p) => p.category.toLowerCase()).filter(Boolean));
  const mixed = uniqueCats.size >= 5;
  const described = input.products.filter((p) => (p.description || '').trim().length > 24).length;
  const missing: string[] = [];
  if (!(input.merchant.description || '').trim()) missing.push('merchant_description');
  if (described / Math.max(1, input.products.length) < 0.5) missing.push('product_descriptions');
  if (input.products.every((p) => !p.category)) missing.push('categories');
  if (!input.merchant.designSpec) missing.push('design_spec');
  if (!input.merchant.strategy) missing.push('creative_strategy');

  const ranked = VOCAB.map((row) => {
    const groups: EvidenceGroup[] = GROUP_ORDER.map((id) => {
      const rawHits = id === 'catalog_distribution' ? distributionHits(input, row.words) : hitsIn(texts[id], row.words);
      return {
        id,
        present: Boolean(texts[id] || (id === 'catalog_distribution' && uniqueCats.size > 0)),
        independent: false,
        hits: rawHits,
        weight: 0,
      };
    });
    const seen = new Set<string>();
    let independent = 0;
    for (const g of groups) {
      const novel = g.hits.filter((h) => !seen.has(h));
      if (novel.length) {
        g.independent = true;
        g.weight = novel.length;
        independent += 1;
        novel.forEach((h) => seen.add(h));
      }
    }
    return { archetype: row.archetype, independent, groups, hits: [...seen] };
  }).sort((a, b) => b.independent - a.independent || b.hits.length - a.hits.length || a.archetype.localeCompare(b.archetype));

  const top = ranked[0];
  const second = ranked[1];
  const contradictions: string[] = [];
  let ambiguity: string | null = null;
  if (second && top.independent > 0 && second.independent >= top.independent && second.independent >= 2) {
    ambiguity = `${top.archetype} and ${second.archetype} have the same independent evidence count (${top.independent}).`;
    contradictions.push(ambiguity);
  } else if (second && top.independent >= 3 && second.independent === top.independent - 1 && second.independent >= 2) {
    ambiguity = `${second.archetype} is within one evidence group of ${top.archetype}.`;
  }

  let archetype: StoreArchetype = 'unknown';
  let rawScore = 0;
  let groups: EvidenceGroup[] = GROUP_ORDER.map((id) => ({
    id,
    present: Boolean(texts[id]) || id === 'catalog_distribution',
    independent: false,
    hits: [],
    weight: 0,
  }));

  if (mixed && top.independent < 4) {
    archetype = 'general_catalog';
    rawScore = Math.min(3, uniqueCats.size / 2);
    groups = groups.map((g) =>
      g.id === 'catalog_distribution'
        ? { ...g, independent: true, hits: [`category_spread:${uniqueCats.size}`], weight: 1 }
        : g
    );
  } else if (top.independent >= 1) {
    archetype = top.archetype;
    rawScore = top.independent;
    groups = top.groups;
  } else if (input.products.length >= 8 || mixed) {
    archetype = 'general_catalog';
    rawScore = 1;
    groups = groups.map((g) =>
      g.id === 'catalog_distribution'
        ? { ...g, independent: true, hits: [`product_count:${input.products.length}`], weight: 1 }
        : g
    );
  }

  const assetGroup = groups.find((g) => g.id === 'asset_metadata');
  const hasVisualSupport = Boolean(assetGroup?.independent);
  let ceiling = 0.95;
  if (missing.includes('merchant_description')) ceiling = Math.min(ceiling, 0.74);
  if (missing.includes('product_descriptions')) ceiling = Math.min(ceiling, 0.62);
  if (missing.includes('categories')) ceiling = Math.min(ceiling, 0.7);
  if (input.products.length <= 1) ceiling = Math.min(ceiling, 0.54);
  if (rawScore <= 1) ceiling = Math.min(ceiling, 0.45);
  else if (rawScore === 2) ceiling = Math.min(ceiling, 0.62);
  else if (rawScore === 3) ceiling = Math.min(ceiling, 0.74);
  else if (rawScore === 4) ceiling = Math.min(ceiling, 0.86);
  if (!hasVisualSupport && missing.includes('design_spec') && missing.includes('creative_strategy')) {
    ceiling = Math.min(ceiling, 0.62);
  }
  if (ambiguity) ceiling = Math.min(ceiling, 0.62);
  if (archetype === 'unknown') ceiling = Math.min(ceiling, 0.29);

  let confidence = 0.18;
  if (archetype === 'general_catalog' && mixed) confidence = 0.55;
  else if (archetype === 'unknown') confidence = 0.18;
  else if (rawScore <= 1) confidence = 0.38;
  else if (rawScore === 2) confidence = 0.52;
  else if (rawScore === 3) confidence = 0.66;
  else if (rawScore === 4) confidence = 0.78;
  else confidence = Math.min(0.92, 0.82 + (rawScore - 5) * 0.03);

  if (ambiguity && archetype !== 'general_catalog') confidence *= 0.85;
  confidence = roundConfidence(Math.min(confidence, ceiling));

  const evidence: Evidence[] = groups
    .filter((g) => g.independent)
    .map((g) => ({
      provider: 'structured_metadata' as const,
      signal: `${g.id}:${g.hits.slice(0, 6).join(',')}`,
      weight: roundConfidence(g.weight / Math.max(1, rawScore)),
    }));
  if (!evidence.length) {
    evidence.push({ provider: 'structured_metadata', signal: 'insufficient_vocabulary', weight: 0.18 });
  }

  const alternatives = ranked
    .filter((r) => r.archetype !== archetype && r.independent > 0)
    .slice(0, 3)
    .map((r) => ({
      archetype: r.archetype,
      independentGroupCount: r.independent,
      confidence: roundConfidence(Math.min(0.7, 0.2 + r.independent * 0.12)),
    }));

  return {
    archetype,
    rawScore,
    confidence,
    band: bandOf(confidence),
    evidenceGroups: groups,
    independentGroupCount: groups.filter((g) => g.independent).length,
    confidenceCeiling: roundConfidence(ceiling),
    evidence,
    alternatives,
    contradictions,
    ambiguity,
    missing,
    clarificationValuable: confidence < 0.55 || missing.filter((m) => m !== 'design_spec' && m !== 'creative_strategy').length > 0,
  };
}
