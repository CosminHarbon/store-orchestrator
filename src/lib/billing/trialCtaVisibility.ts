/**
 * Pure visibility rules for the /subscribe free-trial CTA.
 * Intent (trial/subscribe) may emphasize a path — it must never hide the trial option.
 */

export type TrialCtaVisibility = 'start' | 'continue' | 'ended' | 'hidden';

export type TrialCtaInput = {
  hasPaidEntitlement: boolean;
  isSuperadmin?: boolean;
  /** True while get_my_trial_status is in flight. */
  trialLoading: boolean;
  /** Server trial_eligible; undefined while unknown. */
  trialEligible?: boolean;
  trialActive: boolean;
  trialExpired: boolean;
  /** Server plan_state when known. */
  planState?: string | null;
};

/**
 * Decide what the merchant should see for the free-trial path.
 *
 * Important: while status is loading / unknown, prefer showing "Start trial"
 * rather than hiding it — the previous bug hid the CTA until RPC resolved,
 * and hid it forever when the RPC failed.
 */
export function resolveTrialCtaVisibility(input: TrialCtaInput): TrialCtaVisibility {
  if (input.hasPaidEntitlement || input.isSuperadmin) return 'hidden';
  if (input.trialActive) return 'continue';
  if (input.trialExpired) return 'ended';

  if (input.trialLoading || input.trialEligible === undefined) return 'start';
  if (input.trialEligible === true) return 'start';

  // Explicitly ineligible (legacy pre-cutover, etc.)
  if (input.planState === 'legacy' || input.trialEligible === false) return 'hidden';

  return 'start';
}

export type SignupIntent = 'trial' | 'subscribe' | null;

export function readSignupIntent(raw: string | null | undefined): SignupIntent {
  if (raw === 'trial' || raw === 'subscribe') return raw;
  return null;
}

/** Intent only controls emphasis — never whether trial exists. */
export function preferTrialEmphasis(intent: SignupIntent): boolean {
  return intent === 'trial';
}

export function preferPlansEmphasis(intent: SignupIntent): boolean {
  return intent === 'subscribe';
}
