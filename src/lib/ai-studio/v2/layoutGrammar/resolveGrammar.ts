import {
  inferCreativeStrategy,
  type CreativeStrategy,
  type PageComposition,
} from '@shared/ai-studio-v2/creativeStrategy';
import {
  LAYOUT_GRAMMAR_IDS,
  type GrammarResolution,
  type LayoutGrammarId,
} from './types';

const DEAD_STRATEGY_FIELDS = [
  'silhouettePlan',
  'tokensOverride',
  'animation',
  'responsive.mobile.variant',
];

const COMPOSITION_WEIGHT: Record<PageComposition, LayoutGrammarId> = {
  cinematic_scroll: 'cinematic_full_bleed',
  editorial_journey: 'editorial_asymmetric',
  dense_campaign: 'typographic_campaign',
  catalogue_first: 'immersive_catalog',
  typography_led: 'typographic_campaign',
  product_artifact: 'product_monument',
  modular_grid: 'immersive_catalog',
  technical_story: 'product_monument',
  playful_blocks: 'typographic_campaign',
  asymmetric_magazine: 'editorial_asymmetric',
};

const TIE_BREAK: LayoutGrammarId[] = [
  'editorial_asymmetric',
  'cinematic_full_bleed',
  'product_monument',
  'typographic_campaign',
  'immersive_catalog',
  'warm_storytelling',
];

function emptyScores(): Record<LayoutGrammarId, number> {
  return {
    editorial_asymmetric: 0,
    cinematic_full_bleed: 0,
    product_monument: 0,
    typographic_campaign: 0,
    immersive_catalog: 0,
    warm_storytelling: 0,
  };
}

function add(scores: Record<LayoutGrammarId, number>, id: LayoutGrammarId, n: number) {
  scores[id] += n;
}

export function scoreCreativeStrategy(strategy: CreativeStrategy): Record<LayoutGrammarId, number> {
  const scores = emptyScores();
  const influencing: string[] = [];

  add(scores, COMPOSITION_WEIGHT[strategy.pageComposition], 5);

  switch (strategy.heroPhilosophy) {
    case 'atmosphere_first':
      add(scores, 'cinematic_full_bleed', 3);
      add(scores, 'editorial_asymmetric', 1);
      break;
    case 'typography_first':
      add(scores, 'typographic_campaign', 4);
      break;
    case 'product_as_artifact':
      add(scores, 'product_monument', 4);
      break;
    case 'split_editorial':
      add(scores, 'editorial_asymmetric', 3);
      add(scores, 'warm_storytelling', 1);
      break;
    case 'immediate_offer':
      add(scores, 'immersive_catalog', 4);
      break;
  }

  switch (strategy.narrativeModel) {
    case 'editorial':
      add(scores, 'editorial_asymmetric', 3);
      break;
    case 'campaign':
      add(scores, 'typographic_campaign', 2);
      add(scores, 'cinematic_full_bleed', 2);
      break;
    case 'catalogue':
      add(scores, 'immersive_catalog', 4);
      break;
    case 'chaptered':
      add(scores, 'warm_storytelling', 5);
      add(scores, 'editorial_asymmetric', 1);
      if (strategy.pageComposition === 'editorial_journey' || strategy.pageComposition === 'asymmetric_magazine') {
        add(scores, 'warm_storytelling', 6);
      }
      break;
    case 'product_journey':
      add(scores, 'product_monument', 4);
      break;
  }

  switch (strategy.commerceModel) {
    case 'flagship_then_rail':
      add(scores, 'product_monument', 2);
      add(scores, 'editorial_asymmetric', 1);
      break;
    case 'dense_catalogue':
      add(scores, 'immersive_catalog', 3);
      break;
    case 'shoppable_editorial':
      add(scores, 'editorial_asymmetric', 2);
      add(scores, 'warm_storytelling', 1);
      break;
    case 'collection_first':
      add(scores, 'immersive_catalog', 2);
      break;
    case 'single_artifact':
      add(scores, 'product_monument', 3);
      break;
    case 'spec_story':
      add(scores, 'product_monument', 2);
      break;
  }

  if (strategy.typographyRole === 'dominant_structural') add(scores, 'typographic_campaign', 3);
  if (strategy.typographyRole === 'quiet') {
    add(scores, 'editorial_asymmetric', 1);
    add(scores, 'warm_storytelling', 1);
    add(scores, 'product_monument', 1);
  }

  if (strategy.imageryRole === 'dominant') {
    add(scores, 'cinematic_full_bleed', 2);
    add(scores, 'editorial_asymmetric', 1);
  }
  if (strategy.imageryRole === 'supporting') add(scores, 'typographic_campaign', 2);

  if (strategy.asymmetry === 'high') add(scores, 'editorial_asymmetric', 2);
  if (strategy.density === 'high') add(scores, 'immersive_catalog', 2);
  if (strategy.density === 'low') {
    add(scores, 'editorial_asymmetric', 1);
    add(scores, 'warm_storytelling', 1);
  }
  if (strategy.rhythm === 'sparse_pause') {
    add(scores, 'editorial_asymmetric', 1);
    add(scores, 'warm_storytelling', 1);
  }
  if (strategy.rhythm === 'rapid_contrast') {
    add(scores, 'typographic_campaign', 1);
    add(scores, 'cinematic_full_bleed', 1);
  }

  void influencing;
  return scores;
}

function winnerOf(scores: Record<LayoutGrammarId, number>): LayoutGrammarId {
  let best = TIE_BREAK[0];
  let bestScore = -1;
  for (const id of TIE_BREAK) {
    if (scores[id] > bestScore) {
      best = id;
      bestScore = scores[id];
    }
  }
  return best;
}

function influencingFields(strategy: CreativeStrategy, grammarId: LayoutGrammarId): string[] {
  const fields: string[] = ['pageComposition'];
  if (COMPOSITION_WEIGHT[strategy.pageComposition] === grammarId) fields.push('pageComposition');
  if (strategy.heroPhilosophy === 'product_as_artifact' && grammarId === 'product_monument') {
    fields.push('heroPhilosophy');
  }
  if (strategy.heroPhilosophy === 'typography_first' && grammarId === 'typographic_campaign') {
    fields.push('heroPhilosophy');
  }
  if (strategy.heroPhilosophy === 'atmosphere_first' && grammarId === 'cinematic_full_bleed') {
    fields.push('heroPhilosophy');
  }
  if (strategy.heroPhilosophy === 'immediate_offer' && grammarId === 'immersive_catalog') {
    fields.push('heroPhilosophy');
  }
  if (strategy.narrativeModel === 'chaptered' && grammarId === 'warm_storytelling') {
    fields.push('narrativeModel');
  }
  if (strategy.narrativeModel === 'catalogue' && grammarId === 'immersive_catalog') {
    fields.push('narrativeModel');
  }
  if (strategy.typographyRole === 'dominant_structural' && grammarId === 'typographic_campaign') {
    fields.push('typographyRole');
  }
  if (strategy.commerceModel === 'single_artifact' && grammarId === 'product_monument') {
    fields.push('commerceModel');
  }
  if (strategy.asymmetry === 'high' && grammarId === 'editorial_asymmetric') {
    fields.push('asymmetry');
  }
  if (strategy.density === 'high' && grammarId === 'immersive_catalog') {
    fields.push('density');
  }
  return [...new Set(fields)];
}

function reasonFor(strategy: CreativeStrategy, grammarId: LayoutGrammarId): string {
  return `${strategy.pageComposition} + ${strategy.heroPhilosophy} + ${strategy.narrativeModel} resolved to ${grammarId}`;
}

export function resolveGrammarFromStrategy(
  strategy: CreativeStrategy,
  grammarOverride?: LayoutGrammarId
): GrammarResolution {
  if (grammarOverride && (LAYOUT_GRAMMAR_IDS as readonly string[]).includes(grammarOverride)) {
    return {
      grammarId: grammarOverride,
      reason: `Explicit grammar override: ${grammarOverride}`,
      influencingFields: ['grammarOverride'],
      fallback: 'none',
      unsupportedFields: DEAD_STRATEGY_FIELDS,
      scores: emptyScores(),
    };
  }

  const scores = scoreCreativeStrategy(strategy);
  const grammarId = winnerOf(scores);
  return {
    grammarId,
    reason: reasonFor(strategy, grammarId),
    influencingFields: influencingFields(strategy, grammarId),
    fallback: 'none',
    unsupportedFields: DEAD_STRATEGY_FIELDS,
    scores,
  };
}

export function resolveGrammarFromUnknownSpec(
  spec: unknown,
  grammarOverride?: LayoutGrammarId
): { strategy: CreativeStrategy; resolution: GrammarResolution } {
  let strategy: CreativeStrategy;
  let inferred = false;
  try {
    const s = spec as { creativeStrategy?: CreativeStrategy };
    if (s?.creativeStrategy?.pageComposition && s.creativeStrategy.heroPhilosophy) {
      strategy = s.creativeStrategy;
    } else {
      strategy = inferCreativeStrategy((spec || {}) as never);
      inferred = true;
    }
  } catch {
    strategy = inferCreativeStrategy({});
    inferred = true;
  }

  const resolution = resolveGrammarFromStrategy(strategy, grammarOverride);
  if (inferred) {
    resolution.fallback = spec ? 'inferred_strategy' : 'default_editorial';
    if (!spec) {
      resolution.reason = 'No DesignSpec provided; inferred conservative strategy then default scoring';
    } else {
      resolution.reason = `Legacy DesignSpec lacked creativeStrategy; inferred then ${resolution.reason}`;
    }
  }
  return { strategy, resolution };
}
