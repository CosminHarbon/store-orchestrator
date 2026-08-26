/**
 * Canonical DesignSpec field limits — single source for client + edge Zod schemas.
 * Structured + concise, not artificially short paragraphs.
 */
export const DESIGN_SPEC_LIMITS = {
  /** Short evocative color mood phrase (5–15 words), not a paragraph */
  colorMood: 120,
  /** Concise CTA treatment; include solid|outline|pill|ghost keyword */
  ctaStyle: 120,
  /** Concise nav treatment; include minimal|transparent|solid|editorial keyword */
  navStyle: 120,
  /** Product/content discovery strategy — one or two sentences */
  discovery: 280,
  primaryConversion: 160,
  mobileStrategy: 200,
  coreConcept: 400,
  emotionalGoal: 280,
  visualHierarchy: 400,
  typographyDirection: 400,
  photographyDirection: 400,
  interactionDirection: 280,
  homeNarrative: 600,
} as const;

/** Human-readable field labels for validation errors */
export const DESIGN_SPEC_FIELD_LABELS: Record<string, string> = {
  'artDirection.colorStrategy.mood': 'color mood',
  'ux.ctaStyle': 'CTA style',
  'ux.navStyle': 'navigation style',
  'ux.discovery': 'discovery strategy',
  'ux.primaryConversion': 'primary conversion',
  'ux.mobileStrategy': 'mobile strategy',
  'designIntent.coreConcept': 'design intent',
};
