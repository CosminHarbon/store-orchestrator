import { z } from 'zod';
import {
  buildCritiqueSchemas,
  meetsCritiqueStopThreshold,
  shouldRejectForDistinctivenessLoss,
  applyCritiqueCalibrationGuards,
  getActionableRecommendations,
  CRITIQUE_STOP_THRESHOLD,
  CRITIQUE_DIMENSION_KEYS,
  RENDER_MISMATCH_TYPES,
} from '@shared/ai-studio-v2/critiqueScoreCard.ts';
import type {
  CritiqueScoreCard,
  CritiqueRecommendation,
  CritiqueDecision,
  CritiqueIssueCategory,
  ScreenshotMeta,
  RenderVerification,
  RenderVerificationMismatch,
  RenderMismatchType,
} from '@shared/ai-studio-v2/critiqueScoreCard.ts';

export {
  meetsCritiqueStopThreshold,
  shouldRejectForDistinctivenessLoss,
  applyCritiqueCalibrationGuards,
  getActionableRecommendations,
  CRITIQUE_STOP_THRESHOLD,
  CRITIQUE_DIMENSION_KEYS,
  RENDER_MISMATCH_TYPES,
};
export type {
  CritiqueScoreCard,
  CritiqueRecommendation,
  CritiqueDecision,
  CritiqueIssueCategory,
  ScreenshotMeta,
  RenderVerification,
  RenderVerificationMismatch,
  RenderMismatchType,
};

const built = buildCritiqueSchemas(z);
export const dimensionScoreSchema = built.dimensionScoreSchema;
export const critiqueScoreCardSchema = built.critiqueScoreCardSchema;
export const critiqueRecommendationSchema = built.critiqueRecommendationSchema;
export const visualCritiqueOutputSchema = built.visualCritiqueOutputSchema;
