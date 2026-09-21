/**
 * Authenticated SpeedVendors gateway for Cursor AI Store Builder (Phase 1–3).
 *
 * - Browser never receives CURSOR_API_KEY
 * - Browser cannot supply arbitrary cursor agent IDs
 * - Merchant ownership = authenticated user (profiles.user_id)
 * - Entitlement + concurrency checked in Postgres BEFORE Cursor calls
 * - Phase 2: prepare_context / start_generation return quickly; complete_run ingests artifacts
 * - Phase 3: merchant status/conversation/restore; strip agent ids + billing from merchant JWT
 *
 * Developer-only: backend_feature_enabled must be true on cursor_ai_entitlements.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { CursorCloudApiError, CursorCloudClient } from '../_shared/cursorCloudClient.ts';
import { resolveActingOwnerId } from '../_shared/actingAs.ts';
import {
  loadMerchantContextFromStoreApi,
  type MerchantContextStrategy,
} from '../_shared/cursorMerchantContext.ts';
import {
  createArtifactSignedUrl,
  ingestCursorArtifact,
  artifactStorageDir,
} from '../_shared/cursorArtifactStore.ts';
import {
  findCompanionManifestPath,
  pickArtifactPath,
} from '../_shared/cursorArtifactPaths.ts';
import { mintPreviewToken, PREVIEW_TOKEN_DEFAULT_TTL_SECONDS } from '../_shared/cursorPreviewToken.ts';
import {
  buildFollowupPrompt,
  buildGenerationPrompt,
} from '../_shared/cursorGenerationPrompt.ts';
import {
  completionMessageForVersion,
  deriveVersionLabel,
} from '../_shared/cursorVersionLabels.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

type Action =
  | 'status'
  | 'start_run'
  | 'get_run'
  | 'cancel_run'
  | 'list_artifacts'
  | 'download_artifact'
  | 'models'
  | 'prepare_context'
  | 'start_generation'
  | 'complete_run'
  | 'followup_edit'
  | 'get_version'
  | 'list_versions'
  | 'get_preview_token'
  | 'create_replacement_session'
  | 'restore_version'
  | 'append_conversation'
  | 'reconcile_run_cost';

type ConversationEntry = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  version_id?: string | null;
};

/** Active = not replaced/archived (at most one per user via partial unique index). */
function activeSessionFilter(q: {
  not: (col: string, op: string, val: string) => typeof q;
}) {
  return q.not('status', 'in', '(replaced,archived)');
}

async function loadActiveSession(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  select =
    'id, status, pipeline_status, cursor_agent_id, runtime_revision, runtime_commit_sha, runtime_repo_url, runtime_starting_ref, current_draft_version_id, active_run_id, last_error_category, metadata, updated_at, needs_design_sync, conversation',
) {
  let q = admin.from('cursor_storefront_sessions').select(select).eq('user_id', ownerId);
  q = activeSessionFilter(q as never) as typeof q;
  const { data } = await q.maybeSingle();
  return data;
}

function merchantPipelineStage(pipelineStatus: string | null | undefined): string {
  switch (pipelineStatus) {
    case 'queued':
    case 'preparing_context':
      return 'Understanding your store';
    case 'cursor_running':
    case 'validating':
    case 'repairing':
      return 'Creating storefront';
    case 'storing_artifact':
      return 'Preparing preview';
    case 'ready':
      return 'Draft ready';
    case 'failed':
      return 'Something went wrong';
    case 'cancelled':
      return 'Cancelled';
    case 'needs_recovery':
      return 'Needs a moment to recover';
    default:
      return 'Ready when you are';
  }
}

function entitlementSummary(ent: Record<string, unknown> | null | undefined) {
  const enabled = Boolean(ent?.enabled);
  const backend = Boolean(ent?.backend_feature_enabled);
  const budget = ent?.budget_cents == null ? null : Number(ent.budget_cents);
  const spent = Number(ent?.spent_charged_cents || 0);
  const maxRuns = ent?.max_runs == null ? null : Number(ent.max_runs);
  const runsUsed = Number(ent?.runs_used || 0);
  const budgetExhausted = budget != null && spent >= budget;
  const runsExhausted = maxRuns != null && runsUsed >= maxRuns;
  const exhausted = !enabled || !backend || budgetExhausted || runsExhausted;
  const low =
    !exhausted &&
    ((budget != null && spent >= budget * 0.8) ||
      (maxRuns != null && maxRuns > 0 && runsUsed >= maxRuns * 0.8));
  return {
    available: enabled && backend && !exhausted,
    exhausted,
    low,
    enabled,
    backend_feature_enabled: backend,
    plan_kind: (ent?.plan_kind as string | null) ?? null,
    runs_used: runsUsed,
    max_runs: maxRuns,
  };
}

function parseConversation(raw: unknown): ConversationEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ConversationEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = String((item as { role?: string }).role || '');
    const text = String((item as { text?: string }).text || '').trim();
    const at = String((item as { at?: string }).at || new Date().toISOString());
    if (!text) continue;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue;
    const version_id = (item as { version_id?: string | null }).version_id ?? null;
    out.push({ role, text, at, ...(version_id ? { version_id } : {}) });
  }
  return out.slice(-80);
}

async function appendSessionConversation(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  entries: ConversationEntry[],
) {
  if (!entries.length) return;
  const { data } = await admin
    .from('cursor_storefront_sessions')
    .select('conversation')
    .eq('id', sessionId)
    .maybeSingle();
  const prev = parseConversation(data?.conversation);
  const next = [...prev, ...entries].slice(-80);
  await admin.from('cursor_storefront_sessions').update({ conversation: next }).eq('id', sessionId);
  return next;
}

async function isSuperadminUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'superadmin')
    .maybeSingle();
  return Boolean(data);
}

async function countMerchantProducts(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
): Promise<number> {
  const { count } = await admin
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', ownerId);
  return count ?? 0;
}

const ERROR_CATEGORIES = new Set([
  'cursor',
  'entitlement',
  'concurrency',
  'context',
  'artifact',
  'storage',
  'validation',
  'timeout',
  'cancelled',
  'needs_recovery',
  'invalid_args',
  'not_configured',
  'unknown',
]);

function normalizeErrorCategory(raw: unknown): string {
  const s = String(raw || 'unknown').toLowerCase().replace(/\s+/g, '_');
  if (ERROR_CATEGORIES.has(s)) return s;
  if (s.includes('entitlement') || s.includes('budget') || s.includes('runs_exhaust')) {
    return 'entitlement';
  }
  if (s.includes('active') || s.includes('concurren')) return 'concurrency';
  if (s.includes('artifact')) return 'artifact';
  if (s.includes('storage') || s.includes('upload')) return 'storage';
  if (s.includes('context')) return 'context';
  if (s.includes('cursor') || s.includes('502') || s.includes('503')) return 'cursor';
  return 'unknown';
}

function rejectBrowserAgentId(body: Record<string, unknown>): Response | null {
  if (body.agent_id || body.agentId || body.cursor_agent_id) {
    return json({ error: 'agent_id_not_accepted' }, 400);
  }
  return null;
}

function runtimeStartingRef(): string {
  // Prefer exact SHA when set (CURSOR_RUNTIME_STARTING_REF=abc123…); else branch name.
  return (Deno.env.get('CURSOR_RUNTIME_STARTING_REF') || 'main').trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, service);
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '') as Action;

    let ownerId: string;
    try {
      ownerId = await resolveActingOwnerId(
        admin,
        user,
        jwt,
        typeof body.acting_as_user_id === 'string' ? body.acting_as_user_id : null,
      );
    } catch {
      return json({ error: 'forbidden' }, 403);
    }

    const callerIsSuperadmin = await isSuperadminUser(admin, user.id);

    switch (action) {
      case 'status':
        return await handleStatus(admin, ownerId, callerIsSuperadmin);
      case 'start_run':
        return await handleStartRun(admin, ownerId, body, req);
      case 'get_run':
        return await handleGetRun(admin, ownerId, body, callerIsSuperadmin);
      case 'cancel_run':
        return await handleCancelRun(admin, ownerId, body);
      case 'list_artifacts':
        return await handleListArtifacts(admin, ownerId, callerIsSuperadmin);
      case 'download_artifact':
        return await handleDownloadArtifact(admin, ownerId, body, callerIsSuperadmin);
      case 'models':
        return await handleModels(callerIsSuperadmin);
      case 'prepare_context':
        return await handlePrepareContext(admin, ownerId, body);
      case 'start_generation':
        return await handleStartGeneration(admin, ownerId, body, req);
      case 'complete_run':
        return await handleCompleteRun(admin, ownerId, body, callerIsSuperadmin);
      case 'followup_edit':
        return await handleFollowupEdit(admin, ownerId, body, req);
      case 'get_version':
        return await handleGetVersion(admin, ownerId, body);
      case 'list_versions':
        return await handleListVersions(admin, ownerId);
      case 'get_preview_token':
        return await handleGetPreviewToken(admin, ownerId, body);
      case 'create_replacement_session':
        return await handleCreateReplacementSession(admin, ownerId, body);
      case 'restore_version':
        return await handleRestoreVersion(admin, ownerId, body);
      case 'append_conversation':
        return await handleAppendConversation(admin, ownerId, body);
      case 'reconcile_run_cost':
        return await handleReconcileRunCost(admin, ownerId, body, callerIsSuperadmin);
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('cursor-storefront-gateway failed', { message });
    return json({ error: 'server_error', error_category: normalizeErrorCategory(message) }, 500);
  }
});

async function handleStatus(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  callerIsSuperadmin: boolean,
) {
  // Fire-and-forget: settle chargedCents when Cursor billing catches up (does not block UI).
  void reconcilePendingRunCosts(admin, ownerId);

  const session = await loadActiveSession(admin, ownerId);

  const { data: ent } = await admin
    .from('cursor_ai_entitlements')
    .select(
      'enabled, backend_feature_enabled, plan_kind, budget_cents, spent_charged_cents, runs_used, max_runs',
    )
    .eq('user_id', ownerId)
    .maybeSingle();

  const { data: gate } = await admin.rpc('cursor_ai_may_start_run', { p_user_id: ownerId });

  const productCount = await countMerchantProducts(admin, ownerId);

  const { data: versions } = await admin
    .from('cursor_storefront_versions')
    .select(
      'id, version_number, parent_version_id, status, build_status, display_label, prompt, created_at',
    )
    .eq('user_id', ownerId)
    .order('version_number', { ascending: false })
    .limit(50);

  const entitlement = entitlementSummary(ent as Record<string, unknown> | null);

  // may_start from RPC may include internal reasons — keep reason codes only (no cents).
  const mayStart =
    gate && typeof gate === 'object'
      ? {
          allowed: Boolean((gate as { allowed?: boolean }).allowed),
          reason: ((gate as { reason?: string }).reason as string | null) ?? null,
        }
      : null;

  const payload: Record<string, unknown> = {
    session: session
      ? {
          id: session.id,
          status: session.status,
          pipeline_status: session.pipeline_status,
          pipeline_stage: merchantPipelineStage(session.pipeline_status),
          has_agent: Boolean(session.cursor_agent_id),
          runtime_revision: session.runtime_revision,
          runtime_commit_sha: session.runtime_commit_sha,
          current_draft_version_id: session.current_draft_version_id,
          active_run_id: session.active_run_id,
          needs_design_sync: Boolean(session.needs_design_sync),
          conversation: parseConversation(session.conversation),
          last_error_category: session.last_error_category,
          updated_at: session.updated_at,
        }
      : null,
    entitlement,
    may_start: mayStart,
    product_count: productCount,
    versions: versions || [],
  };

  if (callerIsSuperadmin) {
    payload.admin_debug = {
      spent_charged_cents: ent?.spent_charged_cents ?? null,
      budget_cents: ent?.budget_cents ?? null,
      cursor_agent_id: session?.cursor_agent_id ?? null,
      raw_entitlement: ent ?? null,
    };
  }

  return json(payload);
}

async function handleStartRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  req: Request,
) {
  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const idempotencyKey =
    String(body.idempotency_key || req.headers.get('x-idempotency-key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return json({ error: 'idempotency_key_required' }, 400);
  }

  const agentReject = rejectBrowserAgentId(body);
  if (agentReject) return agentReject;

  const runType = String(body.run_type || 'followup');
  const model = body.model ? String(body.model) : null;

  const { data: claim, error: claimErr } = await admin.rpc('cursor_ai_claim_run', {
    p_user_id: ownerId,
    p_idempotency_key: idempotencyKey,
    p_run_type: runType,
    p_prompt: prompt,
    p_model: model,
  });

  if (claimErr) {
    console.error('claim_run failed', claimErr.message);
    return json({ error: 'claim_failed' }, 500);
  }

  const c = claim as Record<string, unknown>;
  if (!c?.ok) {
    return json(
      {
        error: c?.reason || 'rejected',
        error_category: normalizeErrorCategory(c?.reason),
        run_id: c?.run_id ?? null,
        active_run_id: c?.active_run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }

  if (c.reused) {
    return json({
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      status: c.status,
    });
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  const runtimeRepo = (Deno.env.get('CURSOR_RUNTIME_REPO_URL') || '').trim();
  const runtimeRef = runtimeStartingRef();

  try {
    let agentId = typeof c.cursor_agent_id === 'string' ? c.cursor_agent_id : null;
    let cursorRunId: string;

    if (!agentId) {
      const created = await cursor.createAgent({
        name: `sv-${ownerId.slice(0, 8)}`,
        prompt: { text: prompt },
        ...(model ? { model: { id: model } } : {}),
        ...(runtimeRepo
          ? { repos: [{ url: runtimeRepo, startingRef: runtimeRef }], autoCreatePR: false }
          : {}),
      });
      agentId = created.agent.id;
      cursorRunId = created.run.id;
      await admin
        .from('cursor_storefront_sessions')
        .update({
          cursor_agent_id: agentId,
          status: 'running',
          pipeline_status: 'cursor_running',
          runtime_repo_url: runtimeRepo || null,
          runtime_starting_ref: runtimeRepo ? runtimeRef : null,
          runtime_commit_sha: runtimeRepo ? runtimeRef : null,
        })
        .eq('id', c.session_id);
    } else {
      const follow = await cursor.createRun(agentId, {
        prompt: { text: prompt },
        ...(model ? { model: { id: model } } : {}),
      });
      cursorRunId = follow.run.id;
      await admin
        .from('cursor_storefront_sessions')
        .update({ pipeline_status: 'cursor_running' })
        .eq('id', c.session_id);
    }

    await admin
      .from('cursor_storefront_runs')
      .update({
        cursor_run_id: cursorRunId,
        status: 'running',
        model,
      })
      .eq('id', c.run_id);

    return json({
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: cursorRunId,
      status: 'running',
      has_agent: true,
    });
  } catch (e) {
    const msg = e instanceof CursorCloudApiError ? `${e.status}:${e.code}` : 'cursor_error';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await admin
      .from('cursor_storefront_runs')
      .update({
        error_category: normalizeErrorCategory('cursor'),
        error_message: msg,
      })
      .eq('id', c.run_id);
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'failed',
        last_error_category: normalizeErrorCategory('cursor'),
      })
      .eq('id', c.session_id);
    return json({ error: 'cursor_start_failed', detail: msg, error_category: 'cursor' }, 502);
  }
}

async function loadOwnedRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  runId: string,
) {
  const { data: row, error } = await admin
    .from('cursor_storefront_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (error || !row) return null;

  const sessionId = row.session_id as string | null;
  let agentId: string | null = null;
  if (sessionId) {
    const { data: sess } = await admin
      .from('cursor_storefront_sessions')
      .select('cursor_agent_id, user_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sess && sess.user_id === ownerId) {
      agentId = (sess.cursor_agent_id as string | null) || null;
    }
  }

  return {
    ...row,
    cursor_storefront_sessions: { cursor_agent_id: agentId, user_id: ownerId },
  };
}

async function persistUsageIfPossible(
  admin: ReturnType<typeof createClient>,
  cursor: CursorCloudClient,
  agentId: string,
  cursorRunId: string,
  runId: string,
) {
  try {
    const usage = await cursor.getUsage(agentId, cursorRunId);
    const entry = (usage as {
      runs?: Array<{
        usage?: Record<string, number>;
        usageUuid?: string;
        cost?: { chargedCents?: number; rawCostCents?: number } | null;
      }>;
    })?.runs?.[0];
    if (!entry?.usage && !entry?.cost) return usage;

    const charged =
      entry.cost && typeof entry.cost.chargedCents === 'number'
        ? entry.cost.chargedCents
        : null;
    const patch: Record<string, unknown> = {
      cost_reconciliation_status: charged != null ? 'reconciled' : 'tokens_only',
    };
    if (entry.usage) {
      patch.input_tokens = entry.usage.inputTokens ?? null;
      patch.output_tokens = entry.usage.outputTokens ?? null;
      patch.cache_write_tokens = entry.usage.cacheWriteTokens ?? null;
      patch.cache_read_tokens = entry.usage.cacheReadTokens ?? null;
      patch.total_tokens = entry.usage.totalTokens ?? null;
    }
    if (entry.usageUuid) patch.usage_uuid = entry.usageUuid;
    // Only write actual_charged_cents when Cursor returns real charged cost — never estimate.
    if (charged != null) patch.actual_charged_cents = charged;

    await admin.from('cursor_storefront_runs').update(patch).eq('id', runId);
    return usage;
  } catch {
    return null;
  }
}

/** Best-effort delayed cost settle for runs that finished with tokens_only. */
async function reconcilePendingRunCosts(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
) {
  try {
    const { data: pending } = await admin
      .from('cursor_storefront_runs')
      .select('id, cursor_run_id, session_id, cost_reconciliation_status, actual_charged_cents')
      .eq('user_id', ownerId)
      .eq('status', 'finished')
      .eq('cost_reconciliation_status', 'tokens_only')
      .is('actual_charged_cents', null)
      .order('finished_at', { ascending: false })
      .limit(5);
    if (!pending?.length) return;

    const cursor = CursorCloudClient.fromEnv();
    for (const row of pending) {
      const cursorRunId = row.cursor_run_id as string | null;
      const sessionId = row.session_id as string | null;
      if (!cursorRunId || !sessionId) continue;
      const { data: sess } = await admin
        .from('cursor_storefront_sessions')
        .select('cursor_agent_id')
        .eq('id', sessionId)
        .maybeSingle();
      const agentId = sess?.cursor_agent_id as string | null;
      if (!agentId) continue;
      await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, row.id as string);
    }
  } catch (e) {
    console.warn('reconcilePendingRunCosts skipped', e instanceof Error ? e.message : e);
  }
}

async function handleGetRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  callerIsSuperadmin: boolean,
) {
  const runId = String(body.run_id || '');
  if (!runId) return json({ error: 'run_id_required' }, 400);

  const row = await loadOwnedRun(admin, ownerId, runId);
  if (!row) return json({ error: 'not_found' }, 404);

  const agentId = (row as { cursor_storefront_sessions?: { cursor_agent_id?: string } })
    .cursor_storefront_sessions?.cursor_agent_id;
  const cursorRunId = row.cursor_run_id as string | null;

  let cursorStatus: unknown = null;
  let usage: unknown = null;
  if (agentId && cursorRunId) {
    try {
      const cursor = CursorCloudClient.fromEnv();
      const remote = await cursor.getRun(agentId, cursorRunId);
      cursorStatus = { status: remote.status, result: remote.result ?? null };
      const terminal = ['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED'].includes(
        String(remote.status).toUpperCase(),
      );
      if (terminal && ['running', 'creating', 'queued'].includes(row.status)) {
        const mapped = String(remote.status).toLowerCase();
        await admin.rpc('cursor_ai_release_run', {
          p_run_id: runId,
          p_status: mapped === 'finished' ? 'finished' : mapped,
          p_cursor_run_id: cursorRunId,
        });
        usage = await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);
      }
    } catch (e) {
      cursorStatus = { error: e instanceof Error ? e.message : 'cursor_error' };
    }
  }

  const merchantCols =
    'id, status, run_type, error_category, created_at, finished_at';
  const adminCols =
    'id, status, run_type, cursor_run_id, total_tokens, usage_uuid, cost_reconciliation_status, actual_charged_cents, estimated_cost_cents, error_category, created_at, finished_at';

  const { data: fresh } = await admin
    .from('cursor_storefront_runs')
    .select(callerIsSuperadmin ? adminCols : merchantCols)
    .eq('id', runId)
    .single();

  const payload: Record<string, unknown> = {
    run: fresh,
    cursor: cursorStatus
      ? { status: (cursorStatus as { status?: string }).status ?? null }
      : null,
  };

  if (callerIsSuperadmin) {
    payload.cursor = cursorStatus;
    payload.usage = usage;
    payload.admin_debug = {
      cursor_run_id: fresh?.cursor_run_id ?? null,
      total_tokens: fresh?.total_tokens ?? null,
      actual_charged_cents: fresh?.actual_charged_cents ?? null,
      estimated_cost_cents: fresh?.estimated_cost_cents ?? null,
    };
  }

  return json(payload);
}

async function handleCancelRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const runId = String(body.run_id || '');
  const row = await loadOwnedRun(admin, ownerId, runId);
  if (!row) return json({ error: 'not_found' }, 404);

  const agentId = (row as { cursor_storefront_sessions?: { cursor_agent_id?: string } })
    .cursor_storefront_sessions?.cursor_agent_id;
  const cursorRunId = row.cursor_run_id as string | null;
  if (!agentId || !cursorRunId) return json({ error: 'no_cursor_run' }, 409);

  try {
    const cursor = CursorCloudClient.fromEnv();
    await cursor.cancelRun(agentId, cursorRunId);
  } catch (e) {
    if (!(e instanceof CursorCloudApiError && e.status === 409)) {
      return json(
        {
          error: 'cancel_failed',
          detail: e instanceof Error ? e.message : '',
          error_category: 'cursor',
        },
        502,
      );
    }
  }

  await admin.rpc('cursor_ai_release_run', {
    p_run_id: runId,
    p_status: 'cancelled',
    p_cursor_run_id: cursorRunId,
  });
  // If a draft already exists, resume merchant UI as ready (preview still usable).
  // Only leave pipeline_status=cancelled when there is nothing to show yet.
  const session = await loadActiveSession(
    admin,
    ownerId,
    'id, current_draft_version_id',
  );
  const hasDraft = Boolean(session?.current_draft_version_id);
  await admin
    .from('cursor_storefront_sessions')
    .update({
      pipeline_status: hasDraft ? 'ready' : 'cancelled',
      last_error_category: hasDraft ? null : 'cancelled',
    })
    .eq('user_id', ownerId)
    .eq('id', session?.id ?? '');
  return json({ ok: true, run_id: runId, status: 'cancelled' });
}

async function handleListArtifacts(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  callerIsSuperadmin: boolean,
) {
  if (!callerIsSuperadmin) return json({ error: 'forbidden' }, 403);
  const session = await loadActiveSession(admin, ownerId, 'cursor_agent_id');
  if (!session?.cursor_agent_id) return json({ items: [] });

  const cursor = CursorCloudClient.fromEnv();
  const listed = await cursor.listArtifacts(session.cursor_agent_id);
  return json(listed);
}

async function handleDownloadArtifact(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  callerIsSuperadmin: boolean,
) {
  if (!callerIsSuperadmin) return json({ error: 'forbidden' }, 403);
  const artifactPath = String(body.path || '');
  if (!artifactPath.startsWith('artifacts/')) {
    return json({ error: 'invalid_artifact_path' }, 400);
  }
  const session = await loadActiveSession(admin, ownerId, 'id, cursor_agent_id');
  if (!session?.cursor_agent_id) return json({ error: 'no_session' }, 404);

  const cursor = CursorCloudClient.fromEnv();
  const download = await cursor.getArtifactDownload(session.cursor_agent_id, artifactPath);

  const { count } = await admin
    .from('cursor_storefront_versions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session.id);
  const versionNumber = (count ?? 0) + 1;

  await admin.from('cursor_storefront_versions').insert({
    session_id: session.id,
    user_id: ownerId,
    cursor_artifact_path: artifactPath,
    status: 'captured',
    version_number: versionNumber,
    metadata: { expires_at: download.expiresAt, note: 'presigned_temporary' },
  });

  return json({
    path: artifactPath,
    url: download.url,
    expires_at: download.expiresAt,
    warning:
      'Presigned Cursor URL is temporary. Production must copy into SpeedVendors storage before publish.',
  });
}

async function handleModels(callerIsSuperadmin: boolean) {
  if (!callerIsSuperadmin) return json({ error: 'forbidden' }, 403);
  const cursor = CursorCloudClient.fromEnv();
  const models = await cursor.listModels();
  return json(models);
}

// ---- Phase 2 ----------------------------------------------------------------

async function handlePrepareContext(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const strategy: MerchantContextStrategy = {};
  if (typeof body.max_products === 'number') strategy.maxProducts = body.max_products;
  if (Array.isArray(body.featured_ids)) {
    strategy.featuredIds = body.featured_ids.map(String);
  }

  const existing = await loadActiveSession(admin, ownerId, 'id');
  if (existing?.id) {
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'preparing_context',
        context_strategy: strategy,
      })
      .eq('id', existing.id);
  } else {
    await admin.from('cursor_storefront_sessions').insert({
      user_id: ownerId,
      status: 'idle',
      pipeline_status: 'preparing_context',
      context_strategy: strategy,
    });
  }

  try {
    const { context, chars, source } = await loadMerchantContextFromStoreApi({
      admin: admin as never,
      userId: ownerId,
      strategy,
    });

    const active = await loadActiveSession(admin, ownerId, 'id');
    if (active?.id) {
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'ready',
          context_strategy: { ...strategy, last_chars: chars, source },
          last_error_category: null,
        })
        .eq('id', active.id);
    }

    return json({
      context,
      chars,
      source,
      product_count: Array.isArray((context as { products?: unknown[] })?.products)
        ? (context as { products: unknown[] }).products.length
        : 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'context_failed';
    const active = await loadActiveSession(admin, ownerId, 'id');
    if (active?.id) {
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'failed',
          last_error_category: normalizeErrorCategory('context'),
        })
        .eq('id', active.id);
    }
    return json({ error: 'prepare_context_failed', detail: msg, error_category: 'context' }, 502);
  }
}

async function handleStartGeneration(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  req: Request,
) {
  const agentReject = rejectBrowserAgentId(body);
  if (agentReject) return agentReject;

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const idempotencyKey =
    String(body.idempotency_key || req.headers.get('x-idempotency-key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return json({ error: 'idempotency_key_required' }, 400);
  }

  const model = body.model ? String(body.model) : null;
  const strategy: MerchantContextStrategy = {};
  if (typeof body.max_products === 'number') strategy.maxProducts = body.max_products;
  if (Array.isArray(body.featured_ids)) {
    strategy.featuredIds = body.featured_ids.map(String);
  }

  // Claim BEFORE Cursor / context network (entitlement + concurrency).
  const { data: claim, error: claimErr } = await admin.rpc('cursor_ai_claim_run', {
    p_user_id: ownerId,
    p_idempotency_key: idempotencyKey,
    p_run_type: 'initial',
    p_prompt: prompt,
    p_model: model,
  });
  if (claimErr) return json({ error: 'claim_failed' }, 500);

  const c = claim as Record<string, unknown>;
  if (!c?.ok) {
    return json(
      {
        error: c?.reason || 'rejected',
        error_category: normalizeErrorCategory(c?.reason),
        run_id: c?.run_id ?? null,
        active_run_id: c?.active_run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }
  if (c.reused) {
    return json({
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      status: c.status,
    });
  }

  await admin
    .from('cursor_storefront_sessions')
    .update({ pipeline_status: 'preparing_context', context_strategy: strategy })
    .eq('id', c.session_id);

  let fullPrompt: string;
  try {
    const { context, chars } = await loadMerchantContextFromStoreApi({
      admin: admin as never,
      userId: ownerId,
      strategy,
    });
    fullPrompt = buildGenerationPrompt(prompt, context);
    await admin
      .from('cursor_storefront_sessions')
      .update({
        context_strategy: { ...strategy, last_chars: chars },
        pipeline_status: 'cursor_running',
      })
      .eq('id', c.session_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'context_failed';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'failed',
        last_error_category: 'context',
      })
      .eq('id', c.session_id);
    await admin
      .from('cursor_storefront_runs')
      .update({ error_category: 'context', error_message: msg })
      .eq('id', c.run_id);
    return json({ error: 'prepare_context_failed', detail: msg, error_category: 'context' }, 502);
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  const runtimeRepo = (Deno.env.get('CURSOR_RUNTIME_REPO_URL') || '').trim();
  const runtimeRef = runtimeStartingRef();

  try {
    let agentId = typeof c.cursor_agent_id === 'string' ? c.cursor_agent_id : null;
    let cursorRunId: string;

    if (!agentId) {
      const created = await cursor.createAgent({
        name: `sv-${ownerId.slice(0, 8)}`,
        prompt: { text: fullPrompt },
        ...(model ? { model: { id: model } } : {}),
        ...(runtimeRepo
          ? { repos: [{ url: runtimeRepo, startingRef: runtimeRef }], autoCreatePR: false }
          : {}),
      });
      agentId = created.agent.id;
      cursorRunId = created.run.id;
      await admin
        .from('cursor_storefront_sessions')
        .update({
          cursor_agent_id: agentId,
          status: 'running',
          pipeline_status: 'cursor_running',
          runtime_repo_url: runtimeRepo || null,
          runtime_starting_ref: runtimeRepo ? runtimeRef : null,
          runtime_commit_sha: runtimeRepo ? runtimeRef : null,
        })
        .eq('id', c.session_id);
    } else {
      const follow = await cursor.createRun(agentId, {
        prompt: { text: fullPrompt },
        ...(model ? { model: { id: model } } : {}),
      });
      cursorRunId = follow.run.id;
    }

    await admin
      .from('cursor_storefront_runs')
      .update({ cursor_run_id: cursorRunId, status: 'running', model, prompt })
      .eq('id', c.run_id);

    await appendSessionConversation(admin, String(c.session_id), [
      {
        role: 'user',
        text: prompt,
        at: new Date().toISOString(),
      },
    ]);

    // Return quickly — caller polls get_run / complete_run.
    return json({
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      status: 'running',
      pipeline_status: 'cursor_running',
      pipeline_stage: merchantPipelineStage('cursor_running'),
      runtime_commit_sha: runtimeRepo ? runtimeRef : null,
      has_agent: true,
    });
  } catch (e) {
    const msg = e instanceof CursorCloudApiError ? `${e.status}:${e.code}` : 'cursor_error';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await admin
      .from('cursor_storefront_runs')
      .update({ error_category: 'cursor', error_message: msg })
      .eq('id', c.run_id);
    await admin
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'failed', last_error_category: 'cursor' })
      .eq('id', c.session_id);
    return json({ error: 'cursor_start_failed', detail: msg, error_category: 'cursor' }, 502);
  }
}

async function handleCompleteRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  callerIsSuperadmin: boolean,
) {
  const runId = String(body.run_id || '');
  if (!runId) return json({ error: 'run_id_required' }, 400);

  const row = await loadOwnedRun(admin, ownerId, runId);
  if (!row) return json({ error: 'not_found' }, 404);

  const sessionMeta = row as {
    session_id: string;
    prompt?: string | null;
    model?: string | null;
    status: string;
    cursor_run_id?: string | null;
    cursor_storefront_sessions?: { cursor_agent_id?: string };
  };
  const agentId = sessionMeta.cursor_storefront_sessions?.cursor_agent_id;
  const cursorRunId = sessionMeta.cursor_run_id;
  if (!agentId || !cursorRunId) {
    return json({ error: 'no_cursor_run', error_category: 'invalid_args' }, 409);
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  let remote;
  try {
    remote = await cursor.getRun(agentId, cursorRunId);
  } catch (e) {
    return json(
      {
        error: 'cursor_poll_failed',
        detail: e instanceof Error ? e.message : '',
        error_category: 'cursor',
      },
      502,
    );
  }

  const status = String(remote.status).toUpperCase();
  if (status !== 'FINISHED') {
    if (['ERROR', 'CANCELLED', 'EXPIRED'].includes(status)) {
      await admin.rpc('cursor_ai_release_run', {
        p_run_id: runId,
        p_status: status.toLowerCase(),
        p_cursor_run_id: cursorRunId,
      });
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: status === 'CANCELLED' ? 'cancelled' : 'failed',
          last_error_category: normalizeErrorCategory(status),
        })
        .eq('user_id', ownerId);
      return json({
        ok: false,
        status: status.toLowerCase(),
        error_category: normalizeErrorCategory(status),
      });
    }
    // Still running — caller should poll again.
    return json({
      ok: false,
      pending: true,
      status: status.toLowerCase(),
      pipeline_status: 'cursor_running',
    });
  }

  await admin
    .from('cursor_storefront_sessions')
    .update({ pipeline_status: 'storing_artifact' })
    .eq('user_id', ownerId);

  try {
    const listed = await cursor.listArtifactsWithRetry(agentId);
    const items = listed.items || [];
    const artifactPath = pickArtifactPath(items);
    if (!artifactPath) {
      await admin.rpc('cursor_ai_release_run', {
        p_run_id: runId,
        p_status: 'finished',
        p_cursor_run_id: cursorRunId,
      });
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'needs_recovery',
          last_error_category: 'artifact',
        })
        .eq('user_id', ownerId);
      await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);
      return json({
        ok: false,
        error: 'no_artifacts',
        error_category: 'needs_recovery',
        pipeline_status: 'needs_recovery',
      });
    }

    const download = await cursor.getArtifactDownload(agentId, artifactPath);

    let companionManifestBytes: Uint8Array | null = null;
    const companionPath = findCompanionManifestPath(items, artifactPath);
    if (companionPath) {
      try {
        const companionDl = await cursor.getArtifactDownload(agentId, companionPath);
        const companionRes = await fetch(companionDl.url);
        if (companionRes.ok) {
          companionManifestBytes = new Uint8Array(await companionRes.arrayBuffer());
        }
      } catch {
        companionManifestBytes = null;
      }
    }

    const session = await loadActiveSession(admin, ownerId, 'id, current_draft_version_id');
    if (!session?.id) {
      await admin.rpc('cursor_ai_release_run', {
        p_run_id: runId,
        p_status: 'error',
        p_cursor_run_id: cursorRunId,
      });
      return json(
        {
          ok: false,
          error: 'no_active_session',
          error_category: 'needs_recovery',
          pipeline_status: 'needs_recovery',
        },
        500,
      );
    }

    const { count } = await admin
      .from('cursor_storefront_versions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.id);
    const versionNumber = (count ?? 0) + 1;

    const baseManifest = { artifact_path: artifactPath, items };
    const isInitial = (row as { run_type?: string }).run_type === 'initial';
    const displayLabel = deriveVersionLabel(sessionMeta.prompt, { isInitial });
    const { data: versionRow, error: vErr } = await admin
      .from('cursor_storefront_versions')
      .insert({
        session_id: session.id,
        user_id: ownerId,
        run_id: runId,
        version_number: versionNumber,
        parent_version_id: session.current_draft_version_id,
        prompt: sessionMeta.prompt,
        model: sessionMeta.model,
        display_label: displayLabel,
        cursor_artifact_path: artifactPath,
        status: 'captured',
        build_status: 'packaging',
        is_immutable: true,
        manifest: baseManifest,
      })
      .select('id')
      .single();

    if (vErr || !versionRow) {
      throw new Error('version_insert_failed');
    }

    let ingested;
    try {
      ingested = await ingestCursorArtifact({
        admin: admin as never,
        downloadUrl: download.url,
        userId: ownerId,
        sessionId: session.id,
        versionId: versionRow.id,
        cursorArtifactPath: artifactPath,
        companionManifestBytes,
        existingManifest: baseManifest,
      });
    } catch (ingestErr) {
      // Leave current_draft_version_id unchanged; version already marked failed by ingest.
      const detail = ingestErr instanceof Error ? ingestErr.message : 'ingest_failed';
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'failed',
          last_error_category: 'artifact',
        })
        .eq('user_id', ownerId);
      await admin.rpc('cursor_ai_release_run', {
        p_run_id: runId,
        p_status: 'finished',
        p_cursor_run_id: cursorRunId,
      });
      await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);
      return json(
        {
          ok: false,
          error: 'ingest_failed',
          detail,
          version_id: versionRow.id,
          error_category: 'artifact',
          pipeline_status: 'failed',
        },
        422,
      );
    }

    await admin
      .from('cursor_storefront_sessions')
      .update({
        current_draft_version_id: versionRow.id,
        pipeline_status: 'ready',
        last_error_category: null,
        needs_design_sync: false,
      })
      .eq('id', session.id);

    await admin.rpc('cursor_ai_release_run', {
      p_run_id: runId,
      p_status: 'finished',
      p_cursor_run_id: cursorRunId,
    });

    const usage = await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);

    // Increment runs_used on entitlement (best-effort).
    const { data: ent } = await admin
      .from('cursor_ai_entitlements')
      .select('runs_used')
      .eq('user_id', ownerId)
      .maybeSingle();
    if (ent) {
      await admin
        .from('cursor_ai_entitlements')
        .update({ runs_used: (ent.runs_used || 0) + 1 })
        .eq('user_id', ownerId);
    }

    const assistantText = completionMessageForVersion({
      displayLabel,
      versionNumber,
      isInitial,
    });
    await appendSessionConversation(admin, session.id, [
      {
        role: 'assistant',
        text: assistantText,
        at: new Date().toISOString(),
        version_id: versionRow.id,
      },
    ]);

    const result: Record<string, unknown> = {
      ok: true,
      status: 'finished',
      pipeline_status: 'ready',
      pipeline_stage: merchantPipelineStage('ready'),
      version_id: versionRow.id,
      version_number: versionNumber,
      display_label: displayLabel,
      storage_path: ingested.storagePath,
      content_sha256: ingested.contentSha256,
      content_size_bytes: ingested.contentSizeBytes,
      file_count: ingested.fileCount,
      site_prefix: `${artifactStorageDir({
        userId: ownerId,
        sessionId: session.id,
        versionId: versionRow.id,
      })}/site`,
    };

    if (callerIsSuperadmin) {
      result.usage = usage;
      result.admin_debug = { usage };
    }

    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'complete_failed';
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'needs_recovery',
        last_error_category: normalizeErrorCategory(msg),
      })
      .eq('user_id', ownerId);
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: runId,
      p_status: 'error',
      p_cursor_run_id: cursorRunId,
    });
    return json({
      ok: false,
      error: 'complete_run_failed',
      detail: msg,
      error_category: 'needs_recovery',
      pipeline_status: 'needs_recovery',
    }, 502);
  }
}

async function handleFollowupEdit(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  req: Request,
) {
  const agentReject = rejectBrowserAgentId(body);
  if (agentReject) return agentReject;

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const idempotencyKey =
    String(body.idempotency_key || req.headers.get('x-idempotency-key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return json({ error: 'idempotency_key_required' }, 400);
  }

  const model = body.model ? String(body.model) : null;

  const session = await loadActiveSession(
    admin,
    ownerId,
    'id, cursor_agent_id, current_draft_version_id, needs_design_sync, runtime_commit_sha',
  );

  // After restore, Cursor workspace may not match the restored draft — client must reseed.
  if (session?.needs_design_sync) {
    return json(
      {
        error: 'needs_reseed',
        error_category: 'needs_recovery',
        needs_reseed: true,
        runtime_commit_sha: session.runtime_commit_sha || null,
        current_draft_version_id: session.current_draft_version_id,
        note:
          'Draft was restored. Call create_replacement_session with replacement_reason=design_sync (same SHA allowed), then start_generation with your edit prompt.',
      },
      409,
    );
  }

  if (!session?.cursor_agent_id) {
    return json({ error: 'no_agent', error_category: 'invalid_args' }, 409);
  }

  const { data: claim, error: claimErr } = await admin.rpc('cursor_ai_claim_run', {
    p_user_id: ownerId,
    p_idempotency_key: idempotencyKey,
    p_run_type: 'followup',
    p_prompt: prompt,
    p_model: model,
  });
  if (claimErr) return json({ error: 'claim_failed' }, 500);

  const c = claim as Record<string, unknown>;
  if (!c?.ok) {
    return json(
      {
        error: c?.reason || 'rejected',
        error_category: normalizeErrorCategory(c?.reason),
        run_id: c?.run_id ?? null,
        active_run_id: c?.active_run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }
  if (c.reused) {
    return json({
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      status: c.status,
      parent_version_id: session.current_draft_version_id,
    });
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  const followPrompt = buildFollowupPrompt(prompt, session.current_draft_version_id);

  try {
    const follow = await cursor.createRun(session.cursor_agent_id, {
      prompt: { text: followPrompt },
      ...(model ? { model: { id: model } } : {}),
    });

    await admin
      .from('cursor_storefront_runs')
      .update({
        cursor_run_id: follow.run.id,
        status: 'running',
        model,
        prompt,
        metadata: { parent_version_id: session.current_draft_version_id },
      })
      .eq('id', c.run_id);

    await admin
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'cursor_running' })
      .eq('id', session.id);

    await appendSessionConversation(admin, session.id, [
      { role: 'user', text: prompt, at: new Date().toISOString() },
    ]);

    return json({
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      status: 'running',
      parent_version_id: session.current_draft_version_id,
      pipeline_status: 'cursor_running',
      pipeline_stage: merchantPipelineStage('cursor_running'),
    });
  } catch (e) {
    const msg = e instanceof CursorCloudApiError ? `${e.status}:${e.code}` : 'cursor_error';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_start_failed', detail: msg, error_category: 'cursor' }, 502);
  }
}

async function handleCreateReplacementSession(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  /**
   * Reseed stub: create a NEW session pinned to body.runtime_commit_sha.
   * Does NOT mutate the old session's runtime_commit_sha.
   * Does NOT delete old versions.
   * Does NOT create a Cursor agent by default — call start_generation on the
   * new session to provision an agent pinned to the new SHA.
   * Optional body.create_agent=true is reserved / ignored in this stub.
   */
  const runtimeCommitSha = String(body.runtime_commit_sha || '').trim();
  if (!runtimeCommitSha || runtimeCommitSha.length < 7) {
    return json({ error: 'runtime_commit_sha_required', error_category: 'invalid_args' }, 400);
  }
  const reason =
    String(body.replacement_reason || body.reason || 'runtime_reseed').trim() || 'runtime_reseed';

  const old = await loadActiveSession(
    admin,
    ownerId,
    'id, user_id, status, runtime_commit_sha, runtime_repo_url, runtime_starting_ref, runtime_revision, metadata, active_run_id, conversation, needs_design_sync, current_draft_version_id',
  );
  if (!old) {
    return json({ error: 'no_active_session', error_category: 'invalid_args' }, 404);
  }
  if (old.active_run_id) {
    return json(
      {
        error: 'run_already_active',
        error_category: 'concurrency',
        active_run_id: old.active_run_id,
      },
      409,
    );
  }

  const forceSameSha =
    body.force === true ||
    reason === 'design_sync' ||
    reason === 'needs_design_sync' ||
    reason === 'start_over' ||
    Boolean(old.needs_design_sync);

  if (old.runtime_commit_sha === runtimeCommitSha && !forceSameSha) {
    return json(
      {
        error: 'same_runtime_commit_sha',
        error_category: 'invalid_args',
        session_id: old.id,
        runtime_commit_sha: runtimeCommitSha,
      },
      409,
    );
  }

  // Free the one-active-per-user unique slot, then insert successor.
  const { error: markErr } = await admin
    .from('cursor_storefront_sessions')
    .update({
      status: 'replaced',
      replaced_at: new Date().toISOString(),
      replacement_reason: reason,
      active_run_id: null,
      pipeline_status: null,
    })
    .eq('id', old.id);
  if (markErr) {
    return json({ error: 'replace_mark_failed', detail: markErr.message }, 500);
  }

  const prevMeta =
    old.metadata && typeof old.metadata === 'object' && !Array.isArray(old.metadata)
      ? (old.metadata as Record<string, unknown>)
      : {};
  const storeId =
    typeof prevMeta.store_id === 'string'
      ? prevMeta.store_id
      : typeof body.store_id === 'string'
        ? body.store_id
        : null;

  const { data: neu, error: insErr } = await admin
    .from('cursor_storefront_sessions')
    .insert({
      user_id: ownerId,
      status: 'idle',
      pipeline_status: null,
      cursor_agent_id: null,
      runtime_revision: old.runtime_revision || 'phase2',
      runtime_repo_url: old.runtime_repo_url || Deno.env.get('CURSOR_RUNTIME_REPO_URL') || null,
      runtime_starting_ref: runtimeCommitSha,
      runtime_commit_sha: runtimeCommitSha,
      current_draft_version_id: null,
      active_run_id: null,
      needs_design_sync: false,
      // Start over keeps prior versions but begins a fresh merchant chat.
      conversation: reason === 'start_over' ? [] : parseConversation(old.conversation),
      metadata: {
        ...prevMeta,
        ...(storeId ? { store_id: storeId } : {}),
        seed_from_session_id: old.id,
        seed_from_runtime_commit_sha: old.runtime_commit_sha,
        ...(reason === 'start_over' ? { start_over: true } : {}),
        ...(forceSameSha && reason !== 'start_over' ? { design_sync_reseed: true } : {}),
      },
    })
    .select('id, runtime_commit_sha')
    .single();

  if (insErr || !neu) {
    // Best-effort rollback: restore old session so merchant is not left without an active row.
    await admin
      .from('cursor_storefront_sessions')
      .update({
        status: old.status || 'ready',
        replaced_at: null,
        replacement_reason: null,
      })
      .eq('id', old.id);
    return json({ error: 'replace_insert_failed', detail: insErr?.message }, 500);
  }

  await admin
    .from('cursor_storefront_sessions')
    .update({ replaced_by_session_id: neu.id })
    .eq('id', old.id);

  // create_agent intentionally not implemented in stub — start_generation on new session
  // creates the Cursor agent pinned to runtime_commit_sha / CURSOR_RUNTIME_STARTING_REF.
  if (body.create_agent === true) {
    console.info(
      'create_replacement_session: create_agent=true ignored; use start_generation on new session',
    );
  }

  return json({
    old_session_id: old.id,
    new_session_id: neu.id,
    runtime_commit_sha: neu.runtime_commit_sha,
    note:
      'Old versions retained on old session. Call start_generation on the new session to create a Cursor agent pinned to the new SHA.',
  });
}

async function handleGetVersion(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const versionId = String(body.version_id || '');
  if (!versionId) return json({ error: 'version_id_required' }, 400);

  const { data } = await admin
    .from('cursor_storefront_versions')
    .select(
      'id, session_id, run_id, version_number, parent_version_id, prompt, model, display_label, manifest, preview_path, is_immutable, build_status, status, storage_bucket, storage_path, content_sha256, content_size_bytes, cursor_artifact_path, created_at, metadata',
    )
    .eq('id', versionId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (!data) return json({ error: 'not_found' }, 404);
  return json({ version: data });
}

async function handleListVersions(admin: ReturnType<typeof createClient>, ownerId: string) {
  const { data } = await admin
    .from('cursor_storefront_versions')
    .select(
      'id, version_number, parent_version_id, status, build_status, content_sha256, content_size_bytes, created_at, prompt, model, display_label',
    )
    .eq('user_id', ownerId)
    .order('version_number', { ascending: false })
    .limit(50);

  return json({ versions: data || [] });
}

async function handleGetPreviewToken(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const versionId = String(body.version_id || '');
  if (!versionId) return json({ error: 'version_id_required' }, 400);

  const { data } = await admin
    .from('cursor_storefront_versions')
    .select(
      'id, status, build_status, storage_bucket, storage_path, preview_path, manifest, content_sha256, content_size_bytes, metadata, user_id',
    )
    .eq('id', versionId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (!data) return json({ error: 'not_found' }, 404);

  const ttl = Math.min(
    Math.max(Number(body.ttl_seconds) || PREVIEW_TOKEN_DEFAULT_TTL_SECONDS, 30),
    600,
  );

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const previewPath = data.preview_path || 'index.html';

  if (data.storage_path && data.status === 'stored' && data.build_status === 'ready') {
    const minted = await mintPreviewToken({
      versionId: data.id,
      userId: ownerId,
      ttlSeconds: ttl,
    });
    const previewUrl =
      `${supabaseUrl}/functions/v1/cursor-storefront-preview` +
      `?version_id=${encodeURIComponent(data.id)}` +
      `&path=${encodeURIComponent(previewPath)}` +
      `&token=${encodeURIComponent(minted.token)}`;

    // Keep signed URL as optional archive download (not for iframe HTML).
    const signedUrl = await createArtifactSignedUrl(admin as never, data.storage_path, ttl);

    return json({
      version_id: data.id,
      status: data.status,
      build_status: data.build_status,
      token: minted.token,
      preview_url: previewUrl,
      expires_in: minted.expiresIn,
      signed_url: signedUrl,
      content_sha256: data.content_sha256,
      content_size_bytes: data.content_size_bytes,
      manifest: data.manifest,
      preview_path: previewPath,
    });
  }

  return json({
    version_id: data.id,
    status: data.status,
    build_status: data.build_status,
    token: null,
    preview_url: null,
    signed_url: null,
    expires_in: ttl,
    manifest: data.manifest,
    preview_path: data.preview_path,
    note: 'Artifact not ready for preview (need status=stored and build_status=ready).',
  });
}

async function handleRestoreVersion(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const versionId = String(body.version_id || '').trim();
  if (!versionId) return json({ error: 'version_id_required' }, 400);

  const { data, error } = await admin.rpc('cursor_ai_restore_draft_version_admin', {
    p_user_id: ownerId,
    p_version_id: versionId,
  });

  if (error) {
    console.error('restore_draft failed', error.message);
    return json({ error: 'restore_failed', detail: error.message }, 500);
  }

  const result = data as Record<string, unknown>;
  if (!result?.ok) {
    const reason = String(result?.error || 'restore_failed');
    return json(
      {
        error: reason,
        error_category: normalizeErrorCategory(reason),
        active_run_id: result?.active_run_id ?? null,
      },
      reason === 'run_already_active' ? 409 : reason === 'not_found' ? 404 : 400,
    );
  }

  // Append a concise system note — no Cursor call.
  if (result.session_id) {
    await appendSessionConversation(admin, String(result.session_id), [
      {
        role: 'system',
        text: 'Restored a previous draft. Edits will start a fresh design session.',
        at: new Date().toISOString(),
        version_id: versionId,
      },
    ]);
  }

  return json({
    ok: true,
    session_id: result.session_id,
    version_id: result.version_id,
    needs_design_sync: true,
  });
}

async function handleAppendConversation(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const session = await loadActiveSession(admin, ownerId, 'id, conversation');
  if (!session?.id) return json({ error: 'no_active_session' }, 404);

  const raw = Array.isArray(body.messages) ? body.messages : body.message ? [body.message] : [];
  const entries = parseConversation(raw);
  if (!entries.length) return json({ error: 'messages_required' }, 400);

  const next = await appendSessionConversation(admin, session.id, entries);
  return json({ ok: true, conversation: next });
}

async function handleReconcileRunCost(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  callerIsSuperadmin: boolean,
) {
  const runId = String(body.run_id || '').trim();
  if (runId) {
    const row = await loadOwnedRun(admin, ownerId, runId);
    if (!row) return json({ error: 'not_found' }, 404);
    const agentId = (row as { cursor_storefront_sessions?: { cursor_agent_id?: string | null } })
      .cursor_storefront_sessions?.cursor_agent_id;
    const cursorRunId = row.cursor_run_id as string | null;
    if (!agentId || !cursorRunId) {
      return json({ ok: false, pending: true, reason: 'missing_cursor_ids' });
    }
    const cursor = CursorCloudClient.fromEnv();
    await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);
    const { data: fresh } = await admin
      .from('cursor_storefront_runs')
      .select(
        callerIsSuperadmin
          ? 'id, cost_reconciliation_status, actual_charged_cents, total_tokens, usage_uuid'
          : 'id, cost_reconciliation_status, total_tokens',
      )
      .eq('id', runId)
      .single();
    return json({
      ok: true,
      run: fresh,
      settled: Boolean(
        callerIsSuperadmin &&
          fresh &&
          typeof (fresh as { actual_charged_cents?: number }).actual_charged_cents === 'number',
      ),
      pending: (fresh as { cost_reconciliation_status?: string } | null)?.cost_reconciliation_status ===
        'tokens_only',
    });
  }

  await reconcilePendingRunCosts(admin, ownerId);
  return json({ ok: true, reconciled_batch: true });
}
