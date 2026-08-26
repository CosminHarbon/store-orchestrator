import type { ZodIssue } from 'zod';
import { DESIGN_SPEC_FIELD_LABELS, DESIGN_SPEC_LIMITS } from './designSpecLimits.ts';

export type DesignSpecValidationSummary = {
  fieldLabels: string[];
  lengthViolations: Array<{ path: string; label: string; max: number }>;
  issueCount: number;
  repairable: boolean;
  userMessage: string;
  technicalMessage: string;
};

function fieldLabel(path: (string | number)[]): string {
  const key = path.join('.');
  return DESIGN_SPEC_FIELD_LABELS[key] || key;
}

export function summarizeDesignSpecValidation(issues: ZodIssue[]): DesignSpecValidationSummary {
  const lengthViolations = issues
    .filter((i) => i.code === 'too_big' && i.type === 'string')
    .map((i) => ({
      path: i.path.join('.'),
      label: fieldLabel(i.path),
      max: typeof i.maximum === 'number' ? i.maximum : 0,
    }));

  const fieldLabels = [...new Set(issues.map((i) => fieldLabel(i.path)))];
  const repairable =
    issues.length > 0 &&
    issues.every((i) => i.code === 'too_big' || i.code === 'too_small' || i.code === 'invalid_string');

  const lengthCount = lengthViolations.length;
  let userMessage: string;
  if (lengthCount > 0) {
    userMessage =
      lengthCount === 1
        ? `Design direction could not be validated. The AI description for ${lengthViolations[0].label} exceeded the allowed length. Retrying with a tighter format…`
        : `Design direction could not be validated. The AI returned descriptions that exceeded the allowed length for ${lengthCount} fields (${lengthViolations.map((v) => v.label).join(', ')}). Retrying with a constrained format…`;
  } else {
    userMessage =
      issues.length === 1
        ? `Design direction could not be validated (${fieldLabels[0]}). Retrying…`
        : `Design direction could not be validated for ${issues.length} fields. Retrying…`;
  }

  const technicalMessage = issues
    .map((i) => {
      const label = fieldLabel(i.path);
      if (i.code === 'too_big' && i.type === 'string') {
        return `${label}: maximum ${i.maximum} characters`;
      }
      if (i.code === 'too_small' && i.type === 'string') {
        return `${label}: minimum ${i.minimum} characters`;
      }
      return `${label}: ${i.message}`;
    })
    .join('; ');

  return {
    fieldLabels,
    lengthViolations,
    issueCount: issues.length,
    repairable,
    userMessage,
    technicalMessage,
  };
}

export function designSpecLimitsForPrompt(): string {
  return [
    `colorStrategy.mood: concise phrase up to ${DESIGN_SPEC_LIMITS.colorMood} chars (e.g. "quiet warm stone, muted brass") — NOT a paragraph`,
    `ux.ctaStyle: concise CTA treatment up to ${DESIGN_SPEC_LIMITS.ctaStyle} chars; include solid|outline|pill|ghost`,
    `ux.navStyle: concise nav treatment up to ${DESIGN_SPEC_LIMITS.navStyle} chars; include minimal|transparent|solid|editorial`,
    `ux.discovery: 1–2 sentences up to ${DESIGN_SPEC_LIMITS.discovery} chars`,
    `designIntent fields: rich creative direction OK where limits allow (coreConcept up to ${DESIGN_SPEC_LIMITS.coreConcept} chars)`,
  ].join('\n');
}
