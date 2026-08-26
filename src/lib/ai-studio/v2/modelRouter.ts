/**
 * Modular model router for AI Studio V2.
 * Provider bindings stay here — never scatter Claude/OpenAI/DeepSeek calls in UI.
 *
 * Phase 1–2: routing table only (orchestration lands in Phase 5).
 * Edge `_shared/aiStudio.ts` chatJson remains the live V1 executor until Phase 5.
 */

export type AiTask =
  | 'brand_analysis'
  | 'creative_direction'
  | 'design_spec'
  | 'site_architecture'
  | 'site_ops'
  | 'micro_edit'
  | 'classify_intent'
  | 'visual_critique'
  | 'remix';

export type AiProvider = 'anthropic' | 'openai' | 'deepseek';

export type AiRoute = {
  task: AiTask;
  primary: AiProvider;
  fallback: AiProvider[];
  preferredModels: string[];
  notes: string;
};

export const AI_TASK_ROUTES: Record<AiTask, AiRoute> = {
  brand_analysis: {
    task: 'brand_analysis',
    primary: 'anthropic',
    fallback: ['openai', 'deepseek'],
    preferredModels: ['claude-sonnet-4-5-20250929', 'gpt-4o'],
    notes: 'Brand interpretation and positioning',
  },
  creative_direction: {
    task: 'creative_direction',
    primary: 'anthropic',
    fallback: ['openai'],
    preferredModels: ['claude-sonnet-4-5-20250929', 'gpt-4o'],
    notes: 'Art direction and designIntent',
  },
  design_spec: {
    task: 'design_spec',
    primary: 'anthropic',
    fallback: ['openai'],
    preferredModels: ['claude-sonnet-4-5-20250929', 'gpt-4o'],
    notes: 'Full DesignSpec JSON',
  },
  site_architecture: {
    task: 'site_architecture',
    primary: 'anthropic',
    fallback: ['openai'],
    preferredModels: ['claude-sonnet-4-5-20250929', 'gpt-4o'],
    notes: 'Compose SiteTree from DesignSpec — not legacy layoutId',
  },
  site_ops: {
    task: 'site_ops',
    primary: 'openai',
    fallback: ['anthropic', 'deepseek'],
    preferredModels: ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-5-20250929'],
    notes: 'Schema-constrained INSERT/UPDATE/MOVE/DELETE/REPLACE/STYLE',
  },
  micro_edit: {
    task: 'micro_edit',
    primary: 'deepseek',
    fallback: ['openai', 'anthropic'],
    preferredModels: ['deepseek-chat', 'gpt-4o-mini'],
    notes: 'Cheap high-volume copy/token tweaks',
  },
  classify_intent: {
    task: 'classify_intent',
    primary: 'deepseek',
    fallback: ['openai'],
    preferredModels: ['deepseek-chat', 'gpt-4o-mini'],
    notes: 'micro vs design vs remix classification',
  },
  visual_critique: {
    task: 'visual_critique',
    primary: 'openai',
    fallback: ['anthropic'],
    preferredModels: ['gpt-4o'],
    notes: 'Phase 4 multimodal visual critic — uses OPENAI_VISION_MODEL or gpt-4o',
  },
  remix: {
    task: 'remix',
    primary: 'anthropic',
    fallback: ['openai'],
    preferredModels: ['claude-sonnet-4-5-20250929', 'gpt-4o'],
    notes: 'Future section remix — not implemented in Phase 1–2',
  },
};

export function routeForTask(task: AiTask): AiRoute {
  return AI_TASK_ROUTES[task];
}
