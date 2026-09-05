import type { LayoutGrammarId } from './types';

export const GRAMMAR_STATUSES = ['candidate', 'needs_revision', 'experimental'] as const;
export type GrammarStatus = (typeof GRAMMAR_STATUSES)[number];

export const GRAMMAR_STATUS: Record<LayoutGrammarId, GrammarStatus> = {
  cinematic_full_bleed: 'candidate',
  editorial_asymmetric: 'candidate',
  product_monument: 'candidate',
  typographic_campaign: 'candidate',
  immersive_catalog: 'experimental',
  warm_storytelling: 'experimental',
};

export const CANDIDATE_GRAMMARS: LayoutGrammarId[] = [
  'cinematic_full_bleed',
  'editorial_asymmetric',
  'product_monument',
  'typographic_campaign',
];

export const EXPERIMENTAL_GRAMMARS: LayoutGrammarId[] = ['immersive_catalog', 'warm_storytelling'];
