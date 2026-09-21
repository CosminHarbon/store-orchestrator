/**
 * Normalize Cursor pipeline_status → merchant UI stage labels + progress.
 */

export type PipelineStatus =
  | 'queued'
  | 'preparing_context'
  | 'cursor_running'
  | 'validating'
  | 'repairing'
  | 'storing_artifact'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'needs_recovery'
  | null
  | undefined;

export type UiStageId =
  | 'idle'
  | 'understanding'
  | 'creating'
  | 'preparing_preview'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'needs_recovery';

export type UiStage = {
  id: UiStageId;
  label: string;
  /** 0–1 approximate progress for banners */
  progress: number;
  isTerminal: boolean;
  isError: boolean;
};

const INITIAL_STAGES: Array<{ id: UiStageId; label: string; progress: number }> = [
  { id: 'understanding', label: 'Understanding your store', progress: 0.18 },
  { id: 'creating', label: 'Creating storefront', progress: 0.55 },
  { id: 'preparing_preview', label: 'Preparing preview', progress: 0.82 },
  { id: 'ready', label: 'Draft ready', progress: 1 },
];

const FOLLOWUP_STAGES: Array<{ id: UiStageId; label: string; progress: number }> = [
  { id: 'understanding', label: 'Understanding your edit', progress: 0.2 },
  { id: 'creating', label: 'Updating storefront', progress: 0.55 },
  { id: 'preparing_preview', label: 'Refreshing preview', progress: 0.82 },
  { id: 'ready', label: 'Update ready', progress: 1 },
];

export function progressStages(kind: 'initial' | 'followup' = 'initial') {
  return kind === 'followup' ? FOLLOWUP_STAGES : INITIAL_STAGES;
}

export function pipelineToUiStage(
  pipelineStatus: PipelineStatus,
  opts?: { runType?: 'initial' | 'followup' | string | null },
): UiStage {
  const followup = opts?.runType === 'followup';
  const labels = followup ? FOLLOWUP_STAGES : INITIAL_STAGES;

  switch (pipelineStatus) {
    case 'queued':
    case 'preparing_context':
      return {
        id: 'understanding',
        label: labels[0]!.label,
        progress: labels[0]!.progress,
        isTerminal: false,
        isError: false,
      };
    case 'cursor_running':
    case 'validating':
    case 'repairing':
      return {
        id: 'creating',
        label: labels[1]!.label,
        progress: labels[1]!.progress,
        isTerminal: false,
        isError: false,
      };
    case 'storing_artifact':
      return {
        id: 'preparing_preview',
        label: labels[2]!.label,
        progress: labels[2]!.progress,
        isTerminal: false,
        isError: false,
      };
    case 'ready':
      return {
        id: 'ready',
        label: labels[3]!.label,
        progress: 1,
        isTerminal: true,
        isError: false,
      };
    case 'failed':
      return {
        id: 'failed',
        label: 'Something went wrong',
        progress: 1,
        isTerminal: true,
        isError: true,
      };
    case 'cancelled':
      return {
        id: 'cancelled',
        label: 'Cancelled',
        progress: 1,
        isTerminal: true,
        isError: false,
      };
    case 'needs_recovery':
      return {
        id: 'needs_recovery',
        label: 'Needs a moment to recover',
        progress: 1,
        isTerminal: true,
        isError: true,
      };
    default:
      return {
        id: 'idle',
        label: 'Ready when you are',
        progress: 0,
        isTerminal: true,
        isError: false,
      };
  }
}

/** Merchant-safe pipeline stage string for gateway status responses. */
export function merchantPipelineStage(pipelineStatus: PipelineStatus): string {
  return pipelineToUiStage(pipelineStatus).label;
}

/** Map gateway / claim error codes → merchant-facing codes (no Cursor internals). */
export function mapGatewayError(code: string | null | undefined): {
  code: string;
  message: string;
} {
  const c = String(code || 'unknown').toLowerCase();

  const table: Record<string, string> = {
    unauthorized: 'Please sign in again.',
    forbidden: 'You do not have access to AI Store Builder.',
    invalid_prompt: 'Please enter a short description of your store.',
    idempotency_key_required: 'Please try again.',
    run_already_active: 'A generation is already in progress.',
    ai_entitlement_disabled: 'AI Store Builder is not enabled for this account.',
    ai_budget_exhausted: 'Your AI usage limit has been reached.',
    ai_runs_exhausted: 'You have used all available AI runs.',
    no_app_access: 'Your SpeedVendors access has expired.',
    cursor_not_configured: 'AI Store Builder is temporarily unavailable.',
    cursor_start_failed: 'Could not start generation. Please try again.',
    prepare_context_failed: 'Could not load your products. Please try again.',
    store_api_key_missing: 'Store API key is missing. Refresh the page or contact support.',
    no_agent: 'Start with an initial design first.',
    needs_reseed: 'Your draft was restored — we need a fresh design session for edits.',
    no_active_session: 'No active design session. Generate a store first.',
    version_not_ready: 'That version is not ready to preview yet.',
    not_found: 'Not found.',
    cancel_failed: 'Could not cancel. Please try again.',
    cancelled: 'Cancelled — your previous draft is unchanged.',
    expired: 'That run expired. Your previous draft is unchanged.',
    claim_failed: 'Could not start. Please try again.',
    ingest_failed: 'Preview packaging failed. Please try again.',
    no_artifacts: 'Generation finished without a preview. Please try again.',
    agent_id_not_accepted: 'Invalid request.',
    unknown_action: 'Invalid request.',
  };

  if (table[c]) return { code: c, message: table[c] };

  if (c.includes('entitlement') || c.includes('budget') || c.includes('runs_exhaust')) {
    return { code: 'entitlement', message: 'AI usage limit reached.' };
  }
  if (c.includes('concurren') || c.includes('already_active')) {
    return { code: 'run_already_active', message: table.run_already_active! };
  }
  if (c.includes('cursor') || c.includes('not_configured')) {
    return { code: 'unavailable', message: 'AI Store Builder is temporarily unavailable.' };
  }

  return { code: c || 'unknown', message: 'Something went wrong. Please try again.' };
}
