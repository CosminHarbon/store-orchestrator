import { z } from 'zod';
import {
  buildDesignSpecSchemas,
  DESIGN_SPEC_VERSION,
  BRAND_DESIGN_SYSTEM_VERSION,
  CREATIVE_MODES,
} from '@shared/ai-studio-v2/designSpecSchema';
import {
  ensureCreativeStrategy,
  buildArchitectureFingerprint,
  type CreativeStrategy,
  type ArchitectureFingerprint,
} from '@shared/ai-studio-v2/creativeStrategy';
import { ALLOWED_FONTS } from '@shared/ai-studio-v2/fonts';
import { DESIGN_SPEC_LIMITS } from '@shared/ai-studio-v2/designSpecLimits';
import { summarizeDesignSpecValidation } from '@shared/ai-studio-v2/designSpecValidation';

export {
  DESIGN_SPEC_VERSION,
  BRAND_DESIGN_SYSTEM_VERSION,
  CREATIVE_MODES,
  ALLOWED_FONTS,
  DESIGN_SPEC_LIMITS,
};
export { summarizeDesignSpecValidation };
export { ensureCreativeStrategy, buildArchitectureFingerprint };
export type { CreativeStrategy, ArchitectureFingerprint };

export const SITE_DOCUMENT_VERSION = 2 as const;

export type CreativeMode = (typeof CREATIVE_MODES)[number];

export const CRITIQUE_DIMENSIONS = [
  'visualHierarchy',
  'composition',
  'typography',
  'imagery',
  'brandConsistency',
  'ecommerceUX',
  'mobile',
  'originality',
  'premiumPerception',
] as const;
export type CritiqueDimension = (typeof CRITIQUE_DIMENSIONS)[number];

/** Placeholder score card shape for DesignSpec.qualityTargets (lightweight targets). */
export const critiqueScoreCardSchema = z.object({
  visualHierarchy: z.number().min(0).max(10),
  composition: z.number().min(0).max(10),
  typography: z.number().min(0).max(10),
  imagery: z.number().min(0).max(10),
  brandConsistency: z.number().min(0).max(10),
  ecommerceUX: z.number().min(0).max(10),
  mobile: z.number().min(0).max(10),
  originality: z.number().min(0).max(10),
  premiumPerception: z.number().min(0).max(10),
  notes: z.string().max(2000).optional(),
});
export type CritiqueScoreCard = z.infer<typeof critiqueScoreCardSchema>;

const built = buildDesignSpecSchemas(z);

export const designIntentSchema = built.designIntentSchema;
export type DesignIntent = z.infer<typeof designIntentSchema>;

export const designTokensSchema = built.designTokensSchema;
export type DesignTokens = z.infer<typeof designTokensSchema>;

export const brandDesignSystemSchema = built.brandDesignSystemSchema;
export type BrandDesignSystem = z.infer<typeof brandDesignSystemSchema>;

export const designSpecSchema = built.designSpecSchema.extend({
  qualityTargets: critiqueScoreCardSchema.partial().optional(),
});
export type DesignSpec = z.infer<typeof designSpecSchema>;

export const brandDesignSystemFromSpec = built.brandDesignSystemFromSpec as (
  spec: DesignSpec
) => BrandDesignSystem;

export function withCreativeStrategy(
  spec: DesignSpec
): DesignSpec & { creativeStrategy: CreativeStrategy } {
  return built.withCreativeStrategy(spec);
}
