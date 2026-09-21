/**
 * Typed invoke helpers for cursor-storefront-gateway.
 * Never exposes Cursor agent IDs / API keys / token counts / chargedCents.
 */

import { supabase } from '@/integrations/supabase/client';
import { mapGatewayError } from './builderState';

export type ConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  version_id?: string | null;
};

export type EntitlementSummary = {
  available: boolean;
  exhausted: boolean;
  low: boolean;
  enabled: boolean;
  backend_feature_enabled: boolean;
  plan_kind?: string | null;
  runs_used?: number | null;
  max_runs?: number | null;
};

export type VersionSummary = {
  id: string;
  version_number: number;
  parent_version_id?: string | null;
  status: string;
  build_status?: string | null;
  display_label?: string | null;
  prompt?: string | null;
  created_at: string;
};

export type GatewayStatus = {
  session: {
    id: string;
    status: string;
    pipeline_status: string | null;
    pipeline_stage: string;
    has_agent: boolean;
    current_draft_version_id: string | null;
    active_run_id: string | null;
    needs_design_sync: boolean;
    conversation: ConversationMessage[];
    last_error_category: string | null;
    updated_at?: string;
    runtime_commit_sha?: string | null;
  } | null;
  entitlement: EntitlementSummary;
  may_start: { allowed?: boolean; reason?: string | null } | Record<string, unknown> | null;
  product_count: number;
  versions: VersionSummary[];
  admin_debug?: Record<string, unknown> | null;
};

export type GatewayError = {
  error: string;
  error_category?: string;
  detail?: string;
  run_id?: string | null;
  active_run_id?: string | null;
  needs_reseed?: boolean;
  runtime_commit_sha?: string | null;
  [key: string]: unknown;
};

export class CursorGatewayError extends Error {
  code: string;
  category?: string;
  payload: GatewayError;

  constructor(payload: GatewayError) {
    const mapped = mapGatewayError(payload.error || payload.error_category);
    super(mapped.message);
    this.name = 'CursorGatewayError';
    this.code = mapped.code;
    this.category = payload.error_category;
    this.payload = payload;
  }
}

async function invoke<T extends Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cursor-storefront-gateway', {
    body: { action, ...body },
  });

  if (error) {
    // Functions client may park JSON body on context
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    let payload: GatewayError | null = null;
    if (ctx && typeof ctx.json === 'function') {
      try {
        payload = (await ctx.json()) as GatewayError;
      } catch {
        payload = null;
      }
    }
    if (payload?.error) throw new CursorGatewayError(payload);
    throw new CursorGatewayError({ error: error.message || 'invoke_failed' });
  }

  if (data && typeof data === 'object' && 'error' in data && (data as GatewayError).error) {
    throw new CursorGatewayError(data as GatewayError);
  }

  return data as T;
}

export async function fetchBuilderStatus(): Promise<GatewayStatus> {
  return invoke<GatewayStatus>('status');
}

export async function prepareContext(opts?: {
  max_products?: number;
  featured_ids?: string[];
}): Promise<{ context: unknown; chars: number; source: string; product_count?: number }> {
  return invoke('prepare_context', opts || {});
}

export async function startGeneration(opts: {
  prompt: string;
  idempotency_key: string;
  model?: string | null;
  max_products?: number;
}): Promise<{
  run_id: string;
  session_id: string;
  status: string;
  pipeline_status?: string;
  reused?: boolean;
}> {
  return invoke('start_generation', opts);
}

export async function followupEdit(opts: {
  prompt: string;
  idempotency_key: string;
  model?: string | null;
}): Promise<{
  run_id: string;
  session_id: string;
  status: string;
  pipeline_status?: string;
  parent_version_id?: string | null;
  reused?: boolean;
  needs_reseed?: boolean;
  runtime_commit_sha?: string | null;
}> {
  return invoke('followup_edit', opts);
}

export async function getRun(runId: string): Promise<{
  run: {
    id: string;
    status: string;
    run_type?: string;
    error_category?: string | null;
    created_at?: string;
    finished_at?: string | null;
  };
  cursor?: { status?: string; result?: unknown; error?: string } | null;
  pending?: boolean;
}> {
  return invoke('get_run', { run_id: runId });
}

export async function completeRun(runId: string): Promise<{
  ok: boolean;
  pending?: boolean;
  status?: string;
  pipeline_status?: string;
  version_id?: string;
  version_number?: number;
  display_label?: string;
  error?: string;
  error_category?: string;
}> {
  return invoke('complete_run', { run_id: runId });
}

export async function cancelRun(runId: string): Promise<{ ok: boolean; status: string }> {
  return invoke('cancel_run', { run_id: runId });
}

export async function listVersions(): Promise<{ versions: VersionSummary[] }> {
  return invoke('list_versions');
}

export async function restoreVersion(versionId: string): Promise<{
  ok: boolean;
  session_id?: string;
  version_id?: string;
  needs_design_sync?: boolean;
}> {
  return invoke('restore_version', { version_id: versionId });
}

export async function getPreviewToken(
  versionId: string,
  ttlSeconds = 300,
): Promise<{
  version_id: string;
  preview_url: string | null;
  token: string | null;
  expires_in?: number;
  status?: string;
  build_status?: string | null;
  note?: string;
}> {
  return invoke('get_preview_token', { version_id: versionId, ttl_seconds: ttlSeconds });
}

export async function createReplacementSession(opts: {
  runtime_commit_sha: string;
  replacement_reason?: string;
  force?: boolean;
}): Promise<{
  old_session_id: string;
  new_session_id: string;
  runtime_commit_sha: string;
}> {
  return invoke('create_replacement_session', opts);
}

export async function appendConversation(
  messages: ConversationMessage[],
): Promise<{ ok: boolean; conversation: ConversationMessage[] }> {
  return invoke('append_conversation', { messages });
}

export function newIdempotencyKey(prefix = 'cab'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}
