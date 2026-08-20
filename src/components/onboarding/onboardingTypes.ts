export type OnboardingStepId =
  | 'welcome'
  | 'store'
  | 'storefront'
  | 'product'
  | 'payments'
  | 'shipping'
  | 'settings'
  | 'review'
  | 'ready';

export type StepStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  'welcome',
  'store',
  'storefront',
  'product',
  'payments',
  'shipping',
  'settings',
  'review',
  'ready',
];

/** Steps counted in progress UI (excludes welcome + ready). */
export const PROGRESS_STEPS: OnboardingStepId[] = [
  'store',
  'storefront',
  'product',
  'payments',
  'shipping',
  'settings',
  'review',
];

export type OnboardingState = {
  version: 1;
  current_step: OnboardingStepId;
  steps: Partial<Record<OnboardingStepId, StepStatus>>;
  selected_template?: 'elementar' | 'premium' | 'floral' | 'ai' | null;
};

export function emptyOnboardingState(): OnboardingState {
  return {
    version: 1,
    current_step: 'welcome',
    steps: {},
    selected_template: null,
  };
}

export function parseOnboardingState(raw: unknown): OnboardingState {
  const base = emptyOnboardingState();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  const current =
    typeof obj.current_step === 'string' &&
    ONBOARDING_STEPS.includes(obj.current_step as OnboardingStepId)
      ? (obj.current_step as OnboardingStepId)
      : 'welcome';
  const stepsRaw =
    obj.steps && typeof obj.steps === 'object'
      ? (obj.steps as Record<string, unknown>)
      : {};
  const steps: Partial<Record<OnboardingStepId, StepStatus>> = {};
  for (const key of ONBOARDING_STEPS) {
    const value = stepsRaw[key];
    if (
      value === 'not_started' ||
      value === 'in_progress' ||
      value === 'completed' ||
      value === 'skipped'
    ) {
      steps[key] = value;
    }
  }
  const selected =
    obj.selected_template === 'elementar' ||
    obj.selected_template === 'premium' ||
    obj.selected_template === 'floral' ||
    obj.selected_template === 'ai'
      ? obj.selected_template
      : null;
  return {
    version: 1,
    current_step: current,
    steps,
    selected_template: selected,
  };
}

export function isDefaultStoreName(name: string | null | undefined) {
  const trimmed = (name || '').trim();
  return !trimmed || trimmed === 'My Store' || trimmed === 'Magazinul meu';
}
