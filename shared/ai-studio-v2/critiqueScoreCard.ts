/**
 * Phase 4 — Visual Critic scorecard (grounded + calibrated).
 * Canonical for client + edge.
 */
import type { Zod } from './zodType.ts';

export const CRITIQUE_DIMENSION_KEYS = [
  'overall',
  'brandFit',
  'visualHierarchy',
  'composition',
  'typography',
  'spacing',
  'imagery',
  'color',
  'productPresentation',
  'ctaQuality',
  'sectionTransitions',
  'consistency',
  'premiumPerception',
  'distinctiveness',
  'mobileQuality',
] as const;

export type CritiqueDimensionKey = (typeof CRITIQUE_DIMENSION_KEYS)[number];

export const CRITIQUE_ISSUE_CATEGORIES = [
  'structural',
  'visual',
  'content',
  'brand_mismatch',
  'intentional',
] as const;

export type CritiqueIssueCategory = (typeof CRITIQUE_ISSUE_CATEGORIES)[number];

/** pass | refine | limited_by_registry */
export const CRITIQUE_DECISIONS = ['refine', 'pass', 'limited_by_registry'] as const;
export type CritiqueDecision = (typeof CRITIQUE_DECISIONS)[number];

export const SITE_OP_KINDS = ['insert', 'update', 'move', 'delete', 'replace', 'style'] as const;

export const PRIORITY_SEVERITIES = ['low', 'medium', 'high'] as const;

export const RENDER_MISMATCH_TYPES = [
  'missing_or_unreadable_element',
  'abnormal_section_spacing',
  'broken_crop',
  'mobile_typography',
  'typography_mismatch',
  'overflow_or_clipping',
  'contrast_or_readability',
  'other',
] as const;

export type RenderMismatchType = (typeof RENDER_MISMATCH_TYPES)[number];

/** Numerical stop threshold — PASS also requires earned decisionReason + no high priority fixes */
export const CRITIQUE_STOP_THRESHOLD = {
  overall: 8.5,
  brandFit: 8,
  premiumPerception: 8,
  distinctiveness: 8,
  maxCycles: 3,
} as const;

export type DimensionScore = {
  score: number;
  observations: string[];
  evidence: string[];
  issues: string[];
  recommendations: string[];
};

export type IntentMismatch = {
  intent: string;
  observed: string;
  severity: 'low' | 'medium' | 'high';
  nodeId?: string;
};

export type PriorityFix = {
  summary: string;
  severity: 'low' | 'medium' | 'high';
  nodeId?: string;
};

export type RenderVerificationMismatch = {
  type: RenderMismatchType;
  nodeId?: string;
  property?: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  viewport?: 'desktop' | 'mobile' | 'both';
};

export type RenderVerificationNode = {
  nodeId: string;
  type: string;
  titleVisible?: boolean | null;
  ctaVisible?: boolean | null;
  imageryPlausible?: boolean | null;
  notes: string[];
  mismatches: RenderVerificationMismatch[];
};

export type RenderVerification = {
  nodes: RenderVerificationNode[];
  summary: string;
};

export type CritiqueScoreCard = {
  overall: DimensionScore;
  brandFit: DimensionScore;
  visualHierarchy: DimensionScore;
  composition: DimensionScore;
  typography: DimensionScore;
  spacing: DimensionScore;
  imagery: DimensionScore;
  color: DimensionScore;
  productPresentation: DimensionScore;
  ctaQuality: DimensionScore;
  sectionTransitions: DimensionScore;
  consistency: DimensionScore;
  premiumPerception: DimensionScore;
  distinctiveness: DimensionScore;
  mobileQuality: DimensionScore;
  criticalIssues: string[];
  priorityFixes: PriorityFix[];
  approvedElements: string[];
  renderIntentMismatch: { mismatches: IntentMismatch[] };
  renderVerification: RenderVerification;
  rhythmNotes: string[];
  genericnessNotes: string[];
  /**
   * Confidence that the VISUAL DIAGNOSIS and node attribution
   * accurately reflect what is visible in the screenshots — not that JSON is valid.
   */
  confidence: number;
  decision: CritiqueDecision;
  decisionReason: string;
};

export type CritiqueRecommendation = {
  targetNodeId: string;
  operation: (typeof SITE_OP_KINDS)[number];
  /** Concrete problem observed in pixels */
  problem: string;
  /** Desired visual outcome */
  desiredOutcome: string;
  property?: string;
  currentValue?: unknown;
  suggestedValue?: unknown;
  reason: string;
  category: CritiqueIssueCategory;
  severity?: 'low' | 'medium' | 'high';
  /** false = cannot safely express as SiteOps */
  actionable: boolean;
  /** Confidence that this recommendation targets the correct node/defect */
  confidence?: number;
};

export type ScreenshotMeta = {
  viewport: string;
  mimeType: string;
  widthPx?: number;
  heightPx?: number;
  base64Chars: number;
  approxBytes: number;
  blankSuspect: boolean;
  notes?: string;
};

export function buildCritiqueSchemas(z: Zod) {
  const dimensionScoreSchema = z.object({
    score: z.number().min(1).max(10),
    observations: z.array(z.string().min(1).max(320)).min(1).max(6),
    evidence: z.array(z.string().min(1).max(320)).max(6).default([]),
    issues: z.array(z.string().max(280)).max(8).default([]),
    recommendations: z.array(z.string().max(280)).max(8).default([]),
  });

  const intentMismatchSchema = z.object({
    intent: z.string().min(1).max(280),
    observed: z.string().min(1).max(280),
    severity: z.enum(['low', 'medium', 'high']),
    nodeId: z.string().max(64).optional(),
  });

  const priorityFixSchema = z.object({
    summary: z.string().min(1).max(400),
    severity: z.enum(['low', 'medium', 'high']),
    nodeId: z.string().max(64).optional(),
  });

  const renderMismatchSchema = z.object({
    type: z.enum(RENDER_MISMATCH_TYPES),
    nodeId: z.string().max(64).optional(),
    property: z.string().max(80).optional(),
    severity: z.enum(['low', 'medium', 'high']),
    evidence: z.string().min(1).max(400),
    viewport: z.enum(['desktop', 'mobile', 'both']).optional(),
  });

  const renderVerificationNodeSchema = z.object({
    nodeId: z.string().min(1).max(64),
    type: z.string().min(1).max(64),
    titleVisible: z.boolean().nullable().optional(),
    ctaVisible: z.boolean().nullable().optional(),
    imageryPlausible: z.boolean().nullable().optional(),
    notes: z.array(z.string().max(280)).max(6).default([]),
    mismatches: z.array(renderMismatchSchema).max(8).default([]),
  });

  const renderVerificationSchema = z.object({
    nodes: z.array(renderVerificationNodeSchema).max(24).default([]),
    summary: z.string().min(1).max(600),
  });

  const critiqueScoreCardSchema = z.object({
    overall: dimensionScoreSchema,
    brandFit: dimensionScoreSchema,
    visualHierarchy: dimensionScoreSchema,
    composition: dimensionScoreSchema,
    typography: dimensionScoreSchema,
    spacing: dimensionScoreSchema,
    imagery: dimensionScoreSchema,
    color: dimensionScoreSchema,
    productPresentation: dimensionScoreSchema,
    ctaQuality: dimensionScoreSchema,
    sectionTransitions: dimensionScoreSchema,
    consistency: dimensionScoreSchema,
    premiumPerception: dimensionScoreSchema,
    distinctiveness: dimensionScoreSchema,
    mobileQuality: dimensionScoreSchema,
    criticalIssues: z.array(z.string().max(400)).max(12).default([]),
    priorityFixes: z.array(priorityFixSchema).max(12).default([]),
    approvedElements: z.array(z.string().max(280)).max(16).default([]),
    renderIntentMismatch: z
      .object({ mismatches: z.array(intentMismatchSchema).max(16).default([]) })
      .default({ mismatches: [] }),
    renderVerification: renderVerificationSchema,
    rhythmNotes: z.array(z.string().max(320)).max(8).default([]),
    genericnessNotes: z.array(z.string().max(320)).max(8).default([]),
    confidence: z.number().min(0).max(1).default(0.7),
    decision: z.enum(CRITIQUE_DECISIONS),
    decisionReason: z.string().min(20).max(800),
  });

  const critiqueRecommendationSchema = z.object({
    targetNodeId: z.string().min(1).max(64),
    operation: z.enum(SITE_OP_KINDS),
    problem: z.string().min(1).max(320),
    desiredOutcome: z.string().min(1).max(320),
    property: z.string().max(80).optional(),
    currentValue: z.unknown().optional(),
    suggestedValue: z.unknown().optional(),
    reason: z.string().min(1).max(400),
    category: z.enum(CRITIQUE_ISSUE_CATEGORIES),
    severity: z.enum(['low', 'medium', 'high']).optional(),
    actionable: z.boolean().default(true),
    confidence: z.number().min(0).max(1).optional(),
  });

  const visualCritiqueOutputSchema = z.object({
    scorecard: critiqueScoreCardSchema,
    recommendations: z.array(critiqueRecommendationSchema).max(20).default([]),
  });

  return {
    dimensionScoreSchema,
    critiqueScoreCardSchema,
    critiqueRecommendationSchema,
    visualCritiqueOutputSchema,
    intentMismatchSchema,
    priorityFixSchema,
    renderVerificationSchema,
    renderMismatchSchema,
  };
}

function isActionableRecommendation(r: CritiqueRecommendation): boolean {
  if (r.actionable === false) return false;
  if (r.category === 'intentional') return false;
  if (!r.property || r.suggestedValue === undefined) return false;
  return true;
}

/**
 * Enforce calibration + actionability rules server-side.
 */
export function applyCritiqueCalibrationGuards(
  scorecard: CritiqueScoreCard,
  recommendations: CritiqueRecommendation[] = []
): {
  scorecard: CritiqueScoreCard;
  recommendations: CritiqueRecommendation[];
  calibrationNotes: string[];
} {
  const notes: string[] = [];
  const next: CritiqueScoreCard = structuredClone(scorecard);
  let nextRecs = recommendations.map((r) => ({ ...r }));

  // Soft-fill renderVerification if omitted
  if (!next.renderVerification) {
    next.renderVerification = {
      nodes: [],
      summary: '(calibration) Model omitted renderVerification',
    };
    notes.push('renderVerification missing — filled empty');
  } else if (!next.renderVerification.summary) {
    next.renderVerification.summary = '(calibration) Empty renderVerification summary';
  }

  for (const key of CRITIQUE_DIMENSION_KEYS) {
    const dim = next[key];
    if (!dim.observations?.length) {
      dim.observations = ['(calibration) Model omitted observations — score capped'];
      notes.push(`${key}: missing observations`);
    }
    if (dim.score >= 9 && (dim.evidence?.length ?? 0) < 2) {
      notes.push(`${key}: score ${dim.score} lacked ≥2 evidence → capped to 8`);
      dim.score = Math.min(dim.score, 8);
      dim.issues = [
        ...(dim.issues || []),
        'Score reduced: insufficient concrete screenshot evidence for 9–10.',
      ];
    }
    if (dim.score === 10 && (dim.evidence?.length ?? 0) < 2) {
      dim.score = 8;
    }
  }

  const dims = CRITIQUE_DIMENSION_KEYS.filter((k) => k !== 'overall');
  const avg =
    dims.reduce((s, k) => s + next[k].score, 0) / Math.max(1, dims.length);
  if (next.overall.score >= 9 && avg < 8.5) {
    notes.push(`overall ${next.overall.score} inconsistent with dimension avg ${avg.toFixed(1)} → adjusted`);
    next.overall.score = Math.min(next.overall.score, Math.round(avg * 10) / 10);
  }

  // Soften confidence when high-severity mismatches exist but overall stays high,
  // or when node attribution is thin vs severity of claims.
  const highMismatches = (next.renderVerification?.nodes || []).flatMap((n) =>
    (n.mismatches || []).filter((m) => m.severity === 'high')
  );
  if (highMismatches.length > 0 && next.overall.score >= 8.5) {
    next.confidence = Math.min(next.confidence, 0.7);
    notes.push('confidence reduced — high-severity render mismatches with high overall score');
  }
  if (highMismatches.some((m) => !m.nodeId) && next.confidence >= 0.85) {
    next.confidence = Math.min(next.confidence, 0.65);
    notes.push('confidence reduced — high-severity mismatch lacks node attribution');
  }

  const emptyIssues = dims.every((k) => (next[k].issues?.length ?? 0) === 0);
  if (next.confidence >= 0.9 && emptyIssues && next.overall.score >= 9) {
    next.confidence = Math.min(next.confidence, 0.75);
    notes.push('confidence softened — perfect scores with zero issues are rare');
  }

  // Normalize recommendations
  for (const r of nextRecs) {
    if (!r.problem) r.problem = r.reason || 'Visual issue';
    if (!r.desiredOutcome) r.desiredOutcome = 'Improve visual execution for this node';
    if (r.actionable !== false && (!r.property || r.suggestedValue === undefined)) {
      r.actionable = false;
      notes.push(`recommendation ${r.targetNodeId}: marked unactionable (missing property/suggestedValue)`);
    }
  }

  const actionable = nextRecs.filter(isActionableRecommendation);
  const hasHighPriority = (next.priorityFixes || []).some((f) => f.severity === 'high');
  const hasCritical = (next.criticalIssues || []).length > 0;

  const numericPass =
    next.overall.score >= CRITIQUE_STOP_THRESHOLD.overall &&
    next.brandFit.score >= CRITIQUE_STOP_THRESHOLD.brandFit &&
    next.premiumPerception.score >= CRITIQUE_STOP_THRESHOLD.premiumPerception &&
    next.distinctiveness.score >= CRITIQUE_STOP_THRESHOLD.distinctiveness &&
    !hasCritical &&
    !hasHighPriority;

  const reasonOk =
    typeof next.decisionReason === 'string' &&
    next.decisionReason.length >= 40 &&
    /over-?design|intent|fidelity|diminishing|risk|further change|registry|cannot safely/i.test(
      next.decisionReason
    );

  // Decision normalization
  if (next.decision === 'pass' && (!numericPass || !reasonOk)) {
    notes.push('pass decision revoked — threshold/reason not earned');
    next.decision = actionable.length ? 'refine' : 'limited_by_registry';
    next.decisionReason =
      (next.decisionReason || '') +
      ' [calibration] PASS revoked: scores/evidence/priorityFixes did not fully earn a pass.';
  }

  if (next.decision === 'refine' && actionable.length === 0) {
    notes.push('refine → limited_by_registry (no actionable recommendations)');
    next.decision = 'limited_by_registry';
    next.decisionReason =
      (next.decisionReason || '') +
      ' [calibration] No registry-safe actionable SiteOps could be proposed for the observed issues.';
  }

  if (next.decision === 'pass') {
    nextRecs = nextRecs.filter((r) => r.category === 'intentional');
  }

  if (next.decision === 'limited_by_registry') {
    // Keep unactionable notes for analytics; SiteOps mapper will skip them
    nextRecs = nextRecs.map((r) => ({ ...r, actionable: false }));
  }

  return { scorecard: next, recommendations: nextRecs, calibrationNotes: notes };
}

export function meetsCritiqueStopThreshold(scorecard: CritiqueScoreCard): boolean {
  if (scorecard.decision === 'limited_by_registry') return true;

  const hasHighPriority = (scorecard.priorityFixes || []).some((f) => f.severity === 'high');
  const hasCritical = (scorecard.criticalIssues || []).length > 0;

  if (scorecard.decision === 'pass') {
    return (
      !hasCritical &&
      !hasHighPriority &&
      scorecard.overall.score >= CRITIQUE_STOP_THRESHOLD.overall &&
      scorecard.brandFit.score >= CRITIQUE_STOP_THRESHOLD.brandFit &&
      scorecard.premiumPerception.score >= CRITIQUE_STOP_THRESHOLD.premiumPerception &&
      scorecard.distinctiveness.score >= CRITIQUE_STOP_THRESHOLD.distinctiveness &&
      Boolean(scorecard.decisionReason && scorecard.decisionReason.length >= 40)
    );
  }

  return (
    scorecard.overall.score >= CRITIQUE_STOP_THRESHOLD.overall &&
    scorecard.brandFit.score >= CRITIQUE_STOP_THRESHOLD.brandFit &&
    scorecard.premiumPerception.score >= CRITIQUE_STOP_THRESHOLD.premiumPerception &&
    scorecard.distinctiveness.score >= CRITIQUE_STOP_THRESHOLD.distinctiveness &&
    !hasCritical &&
    !hasHighPriority
  );
}

export function shouldRejectForDistinctivenessLoss(
  before: CritiqueScoreCard,
  after: CritiqueScoreCard
): boolean {
  const overallGain = after.overall.score - before.overall.score;
  const distinctLoss = before.distinctiveness.score - after.distinctiveness.score;
  return distinctLoss >= 1.5 && overallGain < 1;
}

export function getActionableRecommendations(
  recommendations: CritiqueRecommendation[]
): CritiqueRecommendation[] {
  return recommendations.filter(isActionableRecommendation);
}
